import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { TraceProcessor, normalizeCount } from "./core/averager.js";
import { FONT_SIZE, computeLayout } from "./core/layout.js";
import { drawBase, drawFrame } from "./core/render.js";
import { binFrequency, clampView, fitLevels as computeFit, formatDb, formatFrequency, peakInRange, sampleColumn } from "./core/scale.js";
import { WaterfallHistory, WaterfallRenderer, resolveColormap } from "./core/waterfall.js";
import { DEFAULT_FEATURES, DEFAULT_MESSAGES } from "./defaults.js";
import { useControllableState } from "./hooks/useControllableState.js";
import { useElementSize, useSystemDark } from "./hooks/useElementSize.js";
import { useInteractions, zoomStep } from "./hooks/useInteractions.js";
import { resolveTheme, themeVariables } from "./theme.js";
import ContextMenu from "./ui/ContextMenu.jsx";
import LabelEditor from "./ui/LabelEditor.jsx";
import { CSS } from "./ui/styles.js";
import Toolbar from "./ui/Toolbar.jsx";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const DEFAULT_DB_MIN = -120;
const DEFAULT_DB_MAX = 0;
const EMPTY_VIEW = {};
const EMPTY_LABELS = [];
const COMPACT_WIDTH = 620;
const TOOLBAR_MIN_WIDTH = 240;
const TOOLBAR_MIN_HEIGHT = 140;

let labelCounter = 0;
const nextLabelId = () => `label-${Date.now().toString(36)}-${++labelCounter}`;

// Accepts a level array, or an object carrying one in `spectrum` (e.g. a stream message).
const binsOf = (source) => (source && !ArrayBuffer.isView(source) && !Array.isArray(source) ? source.spectrum : source);

let hexContext = null;
function toHex(color) {
    if (typeof document === "undefined") return "#000000";
    hexContext ??= document.createElement("canvas").getContext("2d");
    hexContext.fillStyle = "#000000";
    hexContext.fillStyle = color;
    const parsed = hexContext.fillStyle;
    return parsed.startsWith("#") ? parsed : "#000000";
}

const SpectrumAnalyzer = forwardRef(function SpectrumAnalyzer({
    /* ---- Data ---- */
    data,
    dataRef,
    centerFreq,
    span,
    dbMin: dbMinProp,
    dbMax: dbMaxProp,
    autoFitLevels,

    /* ---- Feature switches ---- */
    features: featuresProp,

    /* ---- View / zoom ---- */
    view: viewProp,
    defaultView,
    onViewChange,
    minSpan,
    maxSpan,

    /* ---- Averaging and holds ---- */
    average: averageProp,
    defaultAverage = 1,
    onAverageChange,
    averageMode = "db",
    averageMax = 1000,
    maxHold: maxHoldProp,
    defaultMaxHold = false,
    onMaxHoldChange,
    minHold: minHoldProp,
    defaultMinHold = false,
    onMinHoldChange,
    peak: peakProp,
    defaultPeak = false,
    onPeakChange,

    /* ---- Waterfall ---- */
    waterfall: waterfallProp,
    defaultWaterfall = false,
    onWaterfallChange,
    waterfallRatio = 0.5,
    waterfallRows = 1024,
    waterfallRowHeight = 1,
    waterfallMaxBins = 4096,
    waterfallColors = "jet",
    waterfallLevels,

    /* ---- Trace appearance ---- */
    color: colorProp,
    defaultColor,
    onColorChange,
    colorStops,
    lineWidth = 1.5,
    fill = 0.1,

    /* ---- Level line ---- */
    level: levelProp,
    defaultLevel = null,
    onLevelChange,
    levelLabel,
    levelStep = 0.5,

    /* ---- Ruler ---- */
    ruler: rulerProp,
    defaultRuler = null,
    onRulerChange,

    /* ---- Frequency labels ---- */
    labels: labelsProp,
    defaultLabels = EMPTY_LABELS,
    onLabelsChange,
    onLabelClick,
    maxLabelRows = 3,

    /* ---- Playback ---- */
    paused: pausedProp,
    defaultPaused = false,
    onPausedChange,
    maxFps = 60,

    /* ---- Look and text ---- */
    theme: themeProp = "auto",
    messages: messagesProp,
    dbUnit = "dB",
    frequencyUnit,
    formatFrequency: formatFrequencyProp,
    plotMargin,
    toolbarPosition = "top",
    toolbarExtra,
    contextMenuItems,
    className,
    style,
    minHeight = 160,
    ariaLabel,

    /* ---- Events ---- */
    onCursorChange,
    onFrequencyClick,
    onPlotAreaChange,
}, ref) {
    /* ================= Resolved options ================= */
    const dbMin = dbMinProp ?? DEFAULT_DB_MIN;
    const dbMax = dbMaxProp ?? DEFAULT_DB_MAX;
    // A level range the caller set is deliberate; without one, the first signal sets it.
    const autoFit = autoFitLevels ?? [dbMinProp, dbMaxProp, viewProp?.dbMin, viewProp?.dbMax, defaultView?.dbMin, defaultView?.dbMax]
        .every((value) => value == null);
    // dbMin and dbMax name the range to reset to. A restored starting view doesn't.
    const fitOnReset = autoFitLevels ?? (dbMinProp == null && dbMaxProp == null);

    const featuresKey = JSON.stringify(featuresProp ?? null);
    const features = useMemo(
        () => ({ ...DEFAULT_FEATURES, ...JSON.parse(featuresKey) }),
        [featuresKey],
    );
    const messages = useMemo(() => ({ ...DEFAULT_MESSAGES, ...messagesProp }), [messagesProp]);

    const systemDark = useSystemDark();
    const themeKey = JSON.stringify(themeProp);
    const theme = useMemo(() => resolveTheme(JSON.parse(themeKey), systemDark), [themeKey, systemDark]);
    const cssVariables = useMemo(() => themeVariables(theme), [theme]);

    const colorStopsKey = colorStops?.length ? JSON.stringify(colorStops) : null;
    const stops = useMemo(() => (colorStopsKey ? JSON.parse(colorStopsKey) : null), [colorStopsKey]);
    const marginKey = JSON.stringify(plotMargin ?? {});
    const margin = useMemo(() => JSON.parse(marginKey), [marginKey]);

    const dataFreq = useMemo(() => ({
        centerFreq: Number.isFinite(centerFreq) ? centerFreq : 0,
        span: span > 0 ? span : 1,
    }), [centerFreq, span]);

    const limits = useMemo(() => {
        const floor = Math.min(dataFreq.span, Math.max(dataFreq.span * 1e-4, 1));
        return {
            dataCenter: dataFreq.centerFreq,
            dataSpan: dataFreq.span,
            minSpan: minSpan ?? floor,
            maxSpan: Math.max(maxSpan ?? dataFreq.span, minSpan ?? floor),
        };
    }, [dataFreq, minSpan, maxSpan]);

    /* ================= State ================= */
    const [rawView, setRawView] = useControllableState(viewProp, defaultView ?? EMPTY_VIEW);
    const [averageRaw, setAverage] = useControllableState(averageProp, defaultAverage, onAverageChange);
    const [maxHold, setMaxHold] = useControllableState(maxHoldProp, defaultMaxHold, onMaxHoldChange);
    const [minHold, setMinHold] = useControllableState(minHoldProp, defaultMinHold, onMinHoldChange);
    const [peak, setPeak] = useControllableState(peakProp, defaultPeak, onPeakChange);
    const [waterfall, setWaterfall] = useControllableState(waterfallProp, defaultWaterfall, onWaterfallChange);
    const [colorValue, setColor] = useControllableState(colorProp, defaultColor, onColorChange);
    const [level, setLevel] = useControllableState(levelProp, defaultLevel, onLevelChange);
    const [ruler, setRuler] = useControllableState(rulerProp, defaultRuler, onRulerChange);
    const [labels, setLabels] = useControllableState(labelsProp, defaultLabels, onLabelsChange);
    const [paused, setPaused] = useControllableState(pausedProp, defaultPaused, onPausedChange);

    const average = Math.min(normalizeCount(averageRaw), averageMax);
    const color = colorValue ?? theme.trace;
    const waterfallOn = features.waterfall && Boolean(waterfall);
    const colormapKey = JSON.stringify(resolveColormap(waterfallColors));
    const colormap = useMemo(() => JSON.parse(colormapKey), [colormapKey]);

    const [tool, setTool] = useState(null);
    const [editor, setEditor] = useState(null);
    const [menu, setMenu] = useState(null);
    const [fontFamily, setFontFamily] = useState("system-ui, sans-serif");
    const lastLevelRef = useRef(null);

    const view = useMemo(() => clampView({
        centerFreq: rawView.centerFreq ?? dataFreq.centerFreq,
        span: rawView.span ?? dataFreq.span,
        dbMin: rawView.dbMin ?? dbMin,
        dbMax: rawView.dbMax ?? dbMax,
    }, limits), [rawView, dataFreq, dbMin, dbMax, limits]);

    // Latest props and state for callbacks that outlive a render; filled in below.
    const apiRef = useRef(null);
    const limitsRef = useRef(limits);
    limitsRef.current = limits;
    const dbRangeRef = useRef({ dbMin, dbMax });
    dbRangeRef.current = { dbMin, dbMax };
    const onViewChangeRef = useRef(onViewChange);
    onViewChangeRef.current = onViewChange;

    const applyView = useCallback((next) => {
        const l = limitsRef.current;
        const clamped = clampView(next, l);
        // Fully zoomed out, the frequency range keeps following the data through a retune.
        const followsData = clamped.span >= l.dataSpan;
        setRawView(followsData ? { dbMin: clamped.dbMin, dbMax: clamped.dbMax } : clamped);
        onViewChangeRef.current?.(clamped);
    }, [setRawView]);

    const resetView = useCallback(() => {
        const l = limitsRef.current;
        const full = clampView({
            centerFreq: l.dataCenter,
            span: l.dataSpan,
            dbMin: dbRangeRef.current.dbMin,
            dbMax: dbRangeRef.current.dbMax,
        }, l);
        const bins = apiRef.current.fitOnReset ? tracesRef.current.current : null;
        const fit = bins ? computeFit(bins, apiRef.current.dataFreq, full) : null;
        setRawView(fit ?? EMPTY_VIEW);
        onViewChangeRef.current?.({ ...full, ...fit });
    }, [setRawView]);

    /* ================= Layout ================= */
    const rootRef = useRef(null);
    const plotRef = useRef(null);
    const canvasRef = useRef(null);
    const { width, height } = useElementSize(plotRef);

    const rootSize = useElementSize(rootRef);
    const compact = rootSize.width > 0 && rootSize.width < COMPACT_WIDTH;
    // In a very small parent the toolbar would leave no room for the plot.
    const roomForToolbar = rootSize.width === 0
        || (rootSize.width >= TOOLBAR_MIN_WIDTH && rootSize.height >= TOOLBAR_MIN_HEIGHT);

    useIsomorphicLayoutEffect(() => {
        if (!rootRef.current) return;
        setFontFamily(getComputedStyle(rootRef.current).fontFamily || "system-ui, sans-serif");
    }, [width]);

    const measure = useMemo(() => {
        let ctx = null;
        return (text) => {
            ctx ??= document.createElement("canvas").getContext("2d");
            ctx.font = `500 ${FONT_SIZE}px ${fontFamily}`;
            return ctx.measureText(text).width;
        };
    }, [fontFamily]);

    const draftLabels = useMemo(() => {
        if (!editor) return labels;
        // The label being edited sits under the form; a new one previews at its frequency.
        return editor.id == null
            ? [...labels, { id: "__draft", freq: editor.freq, text: "…", color: editor.color }]
            : labels;
    }, [labels, editor]);

    const scene = useMemo(() => computeLayout({
        width,
        height,
        view,
        labels: draftLabels,
        showLabels: features.labels,
        showAxes: features.axes,
        colorBar: features.colorBar && (Boolean(stops) || waterfallOn),
        margin,
        maxLabelRows,
        waterfallRatio: waterfallOn ? waterfallRatio : null,
        measure,
    }), [width, height, view, draftLabels, features.labels, features.axes, features.colorBar, stops, waterfallOn, waterfallRatio, margin, maxLabelRows, measure]);

    const plotAreaKey = scene.valid
        ? `${scene.plot.x},${scene.plot.y},${scene.plot.w},${scene.plot.h},${width},${height}`
        : "";
    const onPlotAreaChangeRef = useRef(onPlotAreaChange);
    onPlotAreaChangeRef.current = onPlotAreaChange;
    useEffect(() => {
        if (!plotAreaKey) return;
        const { plot } = scene;
        onPlotAreaChangeRef.current?.({
            left: plot.x,
            right: width - plot.x - plot.w,
            top: plot.y,
            bottom: height - plot.y - plot.h,
            width: plot.w,
            height: plot.h,
        });
    }, [plotAreaKey]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ================= Traces ================= */
    const tracesRef = useRef(null);
    tracesRef.current ??= new TraceProcessor();
    const traces = tracesRef.current;

    traces.configure({
        average,
        averageMode,
        maxHold: features.maxHold && maxHold,
        minHold: features.minHold && minHold,
    });

    const historyRef = useRef(null);
    historyRef.current ??= new WaterfallHistory(waterfallRows, waterfallMaxBins);
    historyRef.current.configure(waterfallRows, waterfallMaxBins);
    const rendererRef = useRef(null);
    rendererRef.current ??= new WaterfallRenderer();
    const waterfallOnRef = useRef(waterfallOn);
    waterfallOnRef.current = waterfallOn;
    // Rows can take many megabytes; don't hold them while nothing shows them.
    if (!waterfallOn && historyRef.current.total) historyRef.current.clear();

    /* ================= Paint ================= */
    const hoverRef = useRef(null);
    const hoverTargetRef = useRef({ kind: null, id: null });
    const baseRef = useRef({ canvas: null, scene: null, dpr: 0, key: "" });
    const paintStateRef = useRef(null);
    const rafRef = useRef(0);
    const lastPaintRef = useRef(0);

    const paint = useCallback(() => {
        const canvas = canvasRef.current;
        const state = paintStateRef.current;
        if (!canvas || !state || !state.scene.valid) return;
        const { scene: s } = state;
        const dpr = window.devicePixelRatio || 1;
        const pxW = Math.round(s.width * dpr);
        const pxH = Math.round(s.height * dpr);
        if (canvas.width !== pxW || canvas.height !== pxH) {
            canvas.width = pxW;
            canvas.height = pxH;
        }
        // Whole CSS pixels: a fractional parent width would otherwise stretch and blur the bitmap.
        canvas.style.width = `${s.width}px`;
        canvas.style.height = `${s.height}px`;

        const base = baseRef.current;
        base.canvas ??= document.createElement("canvas");
        if (base.scene !== s || base.dpr !== dpr || base.key !== state.baseKey) {
            base.canvas.width = pxW;
            base.canvas.height = pxH;
            const baseCtx = base.canvas.getContext("2d");
            baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            drawBase(baseCtx, s, state);
            base.scene = s;
            base.dpr = dpr;
            base.key = state.baseKey;
        }

        if (s.waterfall) {
            rendererRef.current.setColors(state.waterfallColors);
            rendererRef.current.sync(
                historyRef.current,
                s.waterfall,
                s.view,
                state.data,
                state.waterfallLevels ?? s.view,
                state.waterfallRowHeight,
            );
        }

        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const { current, maxHold: max, minHold: min, averager } = tracesRef.current;
        drawFrame(ctx, s, base.canvas, {
            ...state,
            waterfallRenderer: rendererRef.current,
            waterfallHistory: historyRef.current,
            series: { current, maxHold: max, minHold: min, averageFilled: averager.filled },
            hover: hoverRef.current,
            hoverKind: hoverTargetRef.current.kind,
            hoverId: hoverTargetRef.current.id,
        });
    }, []);

    const invalidate = useCallback(() => {
        if (rafRef.current) return;
        const tick = (now) => {
            const interval = 1000 / (paintStateRef.current?.maxFps || 60);
            // The small tolerance keeps a 60 fps cap from skipping every other 16.6 ms frame.
            if (now - lastPaintRef.current < interval - 2) {
                rafRef.current = requestAnimationFrame(tick);
                return;
            }
            rafRef.current = 0;
            lastPaintRef.current = now;
            paint();
        };
        rafRef.current = requestAnimationFrame(tick);
    }, [paint]);

    useEffect(() => () => {
        cancelAnimationFrame(rafRef.current);
        // StrictMode remounts: a stale id here would make invalidate() a no-op forever.
        rafRef.current = 0;
    }, []);

    const formatDbFn = useCallback((db) => formatDb(db, dbUnit), [dbUnit]);
    const baseKey = `${features.grid}|${frequencyUnit}|${fontFamily}|${formatFrequencyProp ? 1 : 0}|${colorStopsKey}|${colormapKey}|${JSON.stringify(waterfallLevels ?? null)}|${JSON.stringify(theme)}`;

    paintStateRef.current = {
        scene,
        theme,
        fontFamily,
        baseKey,
        grid: features.grid,
        legend: features.legend,
        colorStops: stops,
        color,
        lineWidth,
        fill,
        frequencyUnit,
        formatFrequency: formatFrequencyProp,
        formatDb: formatDbFn,
        messages,
        data: dataFreq,
        average: features.average ? average : 1,
        level: features.level ? level : null,
        levelLabel,
        ruler: features.ruler ? ruler : null,
        peak: features.peak && peak,
        maxFps,
        waterfallColors: colormap,
        waterfallLevels,
        waterfallRowHeight: Math.max(1, waterfallRowHeight),
    };

    // Every commit may change what is on screen.
    useIsomorphicLayoutEffect(() => {
        invalidate();
    });

    /* ================= Data ingest ================= */
    const pausedRef = useRef(paused);
    pausedRef.current = paused;

    const autoFitPendingRef = useRef(true);

    const ingest = useCallback((bins) => {
        if (pausedRef.current || !bins || !bins.length) return;
        tracesRef.current.push(bins);
        if (waterfallOnRef.current) historyRef.current.push(bins, performance.now());

        if (autoFitPendingRef.current && apiRef.current.autoFit) {
            const { view: v, dataFreq: d } = apiRef.current;
            const fit = computeFit(tracesRef.current.current, d, v);
            // A frame of only bad bins has nothing to fit; the next one gets the chance.
            if (fit) {
                autoFitPendingRef.current = false;
                const { dbMin: lo, dbMax: hi } = dbRangeRef.current;
                // Levels already moved by hand before the signal came stay as they are.
                if (v.dbMin === lo && v.dbMax === hi) applyView({ ...v, ...fit });
            }
        }
        invalidate();
    }, [invalidate, applyView]);

    // Frames from another tuning must not mix into the average or the holds.
    const tuningRef = useRef(dataFreq);
    useEffect(() => {
        if (tuningRef.current === dataFreq) return;
        tuningRef.current = dataFreq;
        tracesRef.current.clear();
        historyRef.current.clear();
        invalidate();
    }, [dataFreq, invalidate]);

    const lastDataRef = useRef(null);
    useEffect(() => {
        const bins = binsOf(data);
        if (!bins || bins === lastDataRef.current) return;
        lastDataRef.current = bins;
        ingest(bins);
    }, [data, ingest]);

    useEffect(() => {
        if (!dataRef) return undefined;
        let raf = 0;
        let lastCounter;
        let lastBins = null;
        const poll = () => {
            const source = dataRef.current;
            const bins = binsOf(source);
            if (bins) {
                const counter = source?.counter;
                const fresh = counter !== undefined ? counter !== lastCounter : bins !== lastBins;
                if (fresh) {
                    lastCounter = counter;
                    lastBins = bins;
                    ingest(bins);
                }
            }
            raf = requestAnimationFrame(poll);
        };
        raf = requestAnimationFrame(poll);
        return () => cancelAnimationFrame(raf);
    }, [dataRef, ingest]);

    /* ================= Actions ================= */
    const clearTraces = useCallback(() => {
        const t = tracesRef.current;
        const keep = t.current ? Float32Array.from(t.current) : null;
        t.clear();
        // Restart the queue from what is displayed so the plot doesn't blank while paused.
        if (keep) t.push(keep);
        historyRef.current.clear();
        invalidate();
    }, [invalidate]);

    const zoomBy = useCallback((direction) => {
        applyView(zoomStep(apiRef.current.view, direction, limitsRef.current));
    }, [applyView]);

    const fitLevels = useCallback(() => {
        const bins = tracesRef.current.current;
        if (!bins) return;
        const { view: v, dataFreq: d } = apiRef.current;
        const fit = computeFit(bins, d, v);
        if (fit) applyView({ ...v, ...fit });
    }, [applyView]);

    const toggleLevel = useCallback(() => {
        const { level: current, view: v } = apiRef.current;
        if (current != null) {
            lastLevelRef.current = current;
            setLevel(null);
            return;
        }
        const remembered = lastLevelRef.current;
        const inView = remembered != null && remembered >= v.dbMin && remembered <= v.dbMax;
        setLevel(inView ? remembered : Math.round((v.dbMin + v.dbMax) / 2));
    }, [setLevel]);

    const toggleRuler = useCallback(() => {
        const { ruler: current, view: v } = apiRef.current;
        setRuler(current ? null : { centerFreq: v.centerFreq, bandwidth: v.span / 5 });
    }, [setRuler]);

    const openNewLabel = useCallback((freq) => {
        setTool(null);
        setEditor({ id: null, freq, text: "", color: apiRef.current.theme.label });
    }, []);

    const openLabel = useCallback((id) => {
        const { labels: list, theme: t, onLabelClick: click } = apiRef.current;
        const label = list.find((l) => l.id === id);
        if (!label) return;
        click?.(label);
        if (label.readOnly) return;
        setEditor({ id, freq: label.freq, text: String(label.text ?? ""), color: label.color ?? t.label });
    }, []);

    // Enter, blur and an outside press can all land on one edit; the ref makes it commit once.
    const editorRef = useRef(null);
    editorRef.current = editor;

    const commitEditor = useCallback((text, nextColor) => {
        const current = editorRef.current;
        if (!current) return;
        editorRef.current = null;
        setEditor(null);
        const list = apiRef.current.labels;
        if (current.id == null) {
            if (text) setLabels([...list, { id: nextLabelId(), freq: current.freq, text, color: nextColor }]);
        } else if (!text) {
            setLabels(list.filter((l) => l.id !== current.id));
        } else {
            setLabels(list.map((l) => (l.id === current.id ? { ...l, text, color: nextColor } : l)));
        }
    }, [setLabels]);

    const cancelEditor = useCallback(() => {
        editorRef.current = null;
        setEditor(null);
    }, []);

    const reportCursor = useCallback((pos) => {
        const api = apiRef.current;
        if (!api.onCursorChange) return;
        if (!pos) {
            api.onCursorChange(null);
            return;
        }
        const { scene: s, dataFreq: d } = api;
        const f0 = s.xToFreq(pos.x - 0.5);
        const f1 = s.xToFreq(pos.x + 0.5);
        if (s.waterfall && pos.y >= s.waterfall.y) {
            const history = historyRef.current;
            const age = Math.floor((pos.y - s.waterfall.y) / Math.max(1, api.waterfallRowHeight));
            const level = history.sample(age, d, f0, f1);
            api.onCursorChange({
                freq: s.xToFreq(pos.x),
                db: null,
                level,
                ageMs: level == null ? null : history.timeAt(0) - history.timeAt(age),
            });
            return;
        }
        api.onCursorChange({
            freq: s.xToFreq(pos.x),
            db: s.yToDb(pos.y),
            level: sampleColumn(tracesRef.current.current, d, f0, f1),
        });
    }, []);

    const setHoverTarget = useCallback((kind, id) => {
        const target = hoverTargetRef.current;
        if (target.kind === kind && target.id === id) return;
        hoverTargetRef.current = { kind, id };
        invalidate();
    }, [invalidate]);

    const closeMenu = useCallback(() => setMenu(null), []);

    /* ================= Interactions ================= */
    apiRef.current = {
        scene,
        view,
        limits,
        features,
        theme,
        dataFreq,
        level,
        ruler,
        labels,
        tool,
        levelStep,
        autoFit,
        fitOnReset,
        waterfallRowHeight,
        applyView,
        resetView,
        setLevel,
        setRuler,
        setLabels,
        setTool,
        openNewLabel,
        openLabel,
        onLabelClick,
        closeMenu,
        openMenu: setMenu,
        invalidate,
        reportCursor,
        setHoverTarget,
        onCursorChange,
        onFrequencyClick,
    };

    const handlers = useInteractions(apiRef, canvasRef, hoverRef);

    /* ================= Imperative handle ================= */
    useImperativeHandle(ref, () => ({
        pushFrame: ingest,
        clearTraces,
        zoomIn: () => zoomBy(1),
        zoomOut: () => zoomBy(-1),
        resetZoom: resetView,
        fitLevels,
        setView: (next) => applyView({ ...apiRef.current.view, ...next }),
        getView: () => apiRef.current.view,
        getTraces: () => {
            const { current, maxHold: max, minHold: min } = tracesRef.current;
            return { current, maxHold: max, minHold: min };
        },
        getPeak: () => {
            const { view: v, dataFreq: d } = apiRef.current;
            const start = v.centerFreq - v.span / 2;
            return peakInRange(tracesRef.current.current, d, start, start + v.span);
        },
        toDataURL: (type, quality) => {
            const canvas = canvasRef.current;
            if (!canvas) return null;
            paint();
            // The visible canvas is transparent; the background comes from CSS.
            const out = document.createElement("canvas");
            out.width = canvas.width;
            out.height = canvas.height;
            const ctx = out.getContext("2d");
            ctx.fillStyle = apiRef.current.theme.background;
            ctx.fillRect(0, 0, out.width, out.height);
            ctx.drawImage(canvas, 0, 0);
            return out.toDataURL(type, quality);
        },
        toCSV: () => {
            const { current, maxHold: max, minHold: min } = tracesRef.current;
            if (!current) return "";
            const d = apiRef.current.dataFreq;
            const head = ["frequency_hz", "level_db", max && "max_hold_db", min && "min_hold_db"].filter(Boolean);
            const rows = [head.join(",")];
            for (let i = 0; i < current.length; i++) {
                const row = [binFrequency(i, current.length, d), current[i]];
                if (max) row.push(max[i]);
                if (min) row.push(min[i]);
                rows.push(row.join(","));
            }
            return rows.join("\n");
        },
    }), [applyView, clearTraces, fitLevels, ingest, paint, resetView, zoomBy]);

    /* ================= Context menu items ================= */
    const menuItems = useMemo(() => {
        if (!menu) return [];
        const items = [];
        if (features.labels) items.push({ key: "label", label: messages.labelHere, onClick: () => openNewLabel(menu.freq) });
        if (features.ruler) {
            items.push({
                key: "ruler",
                label: messages.rulerHere,
                onClick: () => setRuler({ centerFreq: menu.freq, bandwidth: ruler?.bandwidth ?? view.span / 5 }),
            });
            if (ruler) items.push({ key: "ruler-off", label: messages.removeRuler, onClick: () => setRuler(null) });
        }
        if (features.level) {
            if (menu.db != null) {
                items.push({
                    key: "level",
                    label: messages.levelHere,
                    onClick: () => setLevel(Math.round(menu.db / levelStep) * levelStep),
                });
            }
            if (level != null) items.push({ key: "level-off", label: messages.removeLevel, onClick: () => setLevel(null) });
        }
        if (features.pan && view.span < limits.dataSpan) {
            items.push({ key: "center", label: messages.centerHere, onClick: () => applyView({ ...view, centerFreq: menu.freq }) });
        }
        if (features.resetZoom) items.push({ key: "reset", label: messages.resetZoom, onClick: resetView });
        (contextMenuItems ?? []).forEach((item, i) => {
            items.push({
                key: `custom-${i}`,
                label: item.label,
                onClick: () => item.onClick({ freq: menu.freq, db: menu.db }),
            });
        });
        return items;
    }, [menu, features, messages, ruler, level, view, limits, levelStep, contextMenuItems, openNewLabel, setRuler, setLevel, applyView, resetView]);

    const menuTitle = useMemo(() => {
        if (!menu || !scene.valid) return "";
        const resolution = view.span / scene.plot.w;
        return formatFrequencyProp ? formatFrequencyProp(menu.freq) : formatFrequency(menu.freq, resolution, frequencyUnit);
    }, [menu, scene, view, formatFrequencyProp, frequencyUnit]);

    /* ================= Render ================= */
    const toolbarApi = {
        features,
        average,
        averageMax,
        setAverage,
        maxHold,
        setMaxHold,
        minHold,
        setMinHold,
        peak,
        setPeak,
        level,
        toggleLevel,
        ruler,
        toggleRuler,
        tool,
        setTool,
        waterfall: Boolean(waterfall),
        setWaterfall,
        colorStops: stops,
        colorHex: toHex(color),
        setColor,
        paused,
        setPaused,
        zoomBy,
        resetView,
        fitLevels,
        clearTraces,
    };

    const editorBox = editor?.id != null ? scene.labelBoxes.find((b) => b.label.id === editor.id) : null;
    const frequencyText = scene.valid && !formatFrequencyProp
        ? `${formatFrequency(view.centerFreq - view.span / 2, view.span / 100, frequencyUnit)} – ${formatFrequency(view.centerFreq + view.span / 2, view.span / 100, frequencyUnit)}`
        : "";

    return (
        <div
            ref={rootRef}
            dir="ltr"
            className={className ? `rsa-root ${className}` : "rsa-root"}
            style={{ minHeight, ...cssVariables, ...style }}
            onKeyDown={(e) => {
                if (e.key === "Escape") setTool(null);
            }}
        >
            <style>{CSS}</style>
            {features.toolbar && roomForToolbar && (
                <Toolbar
                    api={toolbarApi}
                    messages={messages}
                    position={toolbarPosition}
                    compact={compact}
                    extra={toolbarExtra}
                />
            )}
            <div ref={plotRef} className="rsa-plot">
                <canvas
                    ref={canvasRef}
                    className="rsa-canvas"
                    tabIndex={0}
                    role="img"
                    aria-label={ariaLabel ?? `${messages.chartName} ${frequencyText}`.trim()}
                    {...handlers}
                />
                {tool === "label" && <div className="rsa-hint">{messages.placeLabelHint}</div>}
                {editor && scene.valid && (
                    <LabelEditor
                        key={editor.id ?? "new"}
                        editor={editor}
                        box={editorBox}
                        scene={scene}
                        messages={messages}
                        toHex={toHex}
                        onCommit={commitEditor}
                        onDelete={() => commitEditor("", editor.color)}
                        onCancel={cancelEditor}
                    />
                )}
            </div>
            {menu && (
                <ContextMenu
                    menu={menu}
                    title={menuTitle}
                    items={menuItems}
                    style={{ ...cssVariables, fontFamily }}
                    onClose={closeMenu}
                />
            )}
        </div>
    );
});

export default SpectrumAnalyzer;

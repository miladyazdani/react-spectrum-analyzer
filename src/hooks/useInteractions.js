import { useEffect, useRef } from "react";
import { hitTest, rulerEdges } from "../core/layout.js";
import { panX, panY, zoomX, zoomY } from "../core/scale.js";

const CLICK_SLOP = 3;
const BUTTON_ZOOM = 2;

const CURSORS = {
    level: "ns-resize",
    "ruler-start": "ew-resize",
    "ruler-stop": "ew-resize",
    "ruler-body": "move",
    label: "pointer",
    "y-axis": "ns-resize",
    "x-axis": "ew-resize",
};

const PLOT_KINDS = ["plot", "waterfall", "level", "ruler-start", "ruler-stop", "ruler-body"];

export const zoomStep = (view, direction, limits) => zoomX(
    view,
    direction > 0 ? 1 / BUTTON_ZOOM : BUTTON_ZOOM,
    view.centerFreq,
    limits,
);

function positionIn(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function hitAt(api, pos, pointerType) {
    return hitTest(pos.x, pos.y, api.scene, {
        level: api.features.level ? api.level : null,
        ruler: api.features.ruler ? api.ruler : null,
        slack: pointerType === "touch" ? 14 : 6,
    });
}

function applyDrag(api, drag, pos) {
    const { scene, limits } = api;
    const dx = pos.x - drag.startX;
    const dy = pos.y - drag.startY;
    const plotX = () => Math.max(scene.plot.x, Math.min(scene.plot.x + scene.plot.w, pos.x));

    switch (drag.kind) {
        case "pan":
        case "pan-frequency":
        case "x-axis":
        case "y-axis": {
            let next = drag.view;
            if (drag.kind !== "y-axis") next = panX(next, (-dx / drag.plot.w) * next.span, limits);
            if (drag.kind === "pan" || drag.kind === "y-axis") {
                next = panY(next, (dy / drag.plot.h) * (next.dbMax - next.dbMin));
            }
            api.applyView(next);
            break;
        }
        case "level": {
            const { dbMin, dbMax } = scene.view;
            const db = Math.max(dbMin, Math.min(dbMax, scene.yToDb(pos.y)));
            api.setLevel(Number((Math.round(db / api.levelStep) * api.levelStep).toFixed(6)));
            break;
        }
        case "ruler-start":
        case "ruler-stop":
        case "ruler-new": {
            const f = scene.xToFreq(plotX());
            const lo = Math.min(f, drag.fixed);
            const hi = Math.max(f, drag.fixed);
            api.setRuler({ centerFreq: (lo + hi) / 2, bandwidth: hi - lo });
            break;
        }
        case "ruler-body": {
            const half = drag.ruler.bandwidth / 2;
            const dataStart = limits.dataCenter - limits.dataSpan / 2;
            const dataStop = limits.dataCenter + limits.dataSpan / 2;
            const center = drag.ruler.centerFreq + (dx / drag.plot.w) * drag.view.span;
            const clamped = half * 2 >= limits.dataSpan
                ? center
                : Math.max(dataStart + half, Math.min(dataStop - half, center));
            api.setRuler({ ...drag.ruler, centerFreq: clamped });
            break;
        }
        case "label": {
            const f = scene.xToFreq(plotX());
            api.setLabels(api.labels.map((l) => (l.id === drag.id ? { ...l, freq: f } : l)));
            break;
        }
        default:
            break;
    }
}

function startDrag(api, hit, base, shiftKey) {
    const inPlot = hit && PLOT_KINDS.includes(hit.kind);

    if (api.tool === "label") return inPlot ? { ...base, kind: "place-label" } : null;
    if (shiftKey && inPlot && api.features.ruler) {
        return { ...base, kind: "ruler-new", fixed: api.scene.xToFreq(base.startX) };
    }

    switch (hit?.kind) {
        case "label": {
            const readOnly = api.labels.find((l) => l.id === hit.id)?.readOnly;
            return { ...base, kind: readOnly ? "label-click" : "label", id: hit.id };
        }
        case "level":
            return { ...base, kind: "level" };
        case "ruler-start":
            return { ...base, kind: hit.kind, fixed: rulerEdges(api.ruler).stop };
        case "ruler-stop":
            return { ...base, kind: hit.kind, fixed: rulerEdges(api.ruler).start };
        case "ruler-body":
            return { ...base, kind: hit.kind, ruler: api.ruler };
        case "plot":
            return { ...base, kind: api.features.pan ? "pan" : "click" };
        case "waterfall":
            // Its vertical axis is time, so only frequency pans here.
            return { ...base, kind: api.features.pan ? "pan-frequency" : "click" };
        case "x-axis":
        case "y-axis":
            return api.features.pan ? { ...base, kind: hit.kind } : null;
        default:
            return null;
    }
}

function cursorFor(api, kind) {
    if (api.tool === "label") return kind && kind !== "label" ? "copy" : "default";
    if (kind === "plot" || kind === "waterfall") {
        return api.features.crosshair ? "crosshair" : (api.features.pan ? "grab" : "default");
    }
    if ((kind === "x-axis" || kind === "y-axis") && !api.features.pan) return "default";
    return CURSORS[kind] ?? "default";
}

/**
 * Pointer, wheel and keyboard gestures. `apiRef.current` always holds the latest
 * props and setters, so a drag in progress survives re-renders.
 */
export function useInteractions(apiRef, canvasRef, hoverRef) {
    const dragRef = useRef(null);
    const pointersRef = useRef(new Map());
    const pinchRef = useRef(null);

    const setCursor = (cursor) => {
        if (canvasRef.current) canvasRef.current.style.cursor = cursor;
    };

    const setHover = (next) => {
        const api = apiRef.current;
        hoverRef.current = next;
        api.reportCursor(next);
        api.invalidate();
    };

    const onPointerDown = (e) => {
        const api = apiRef.current;
        // Ctrl+click is the context menu on macOS.
        if (e.button !== 0 || e.ctrlKey || !api.scene.valid) return;
        const canvas = canvasRef.current;
        const pos = positionIn(canvas, e);
        canvas.setPointerCapture?.(e.pointerId);
        pointersRef.current.set(e.pointerId, pos);
        api.closeMenu();

        if (pointersRef.current.size === 2 && api.features.zoom) {
            const [a, b] = [...pointersRef.current.values()];
            dragRef.current = null;
            pinchRef.current = {
                dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
                anchor: api.scene.xToFreq((a.x + b.x) / 2),
                view: api.view,
            };
            return;
        }

        dragRef.current = startDrag(api, hitAt(api, pos, e.pointerType), {
            startX: pos.x,
            startY: pos.y,
            view: api.view,
            plot: api.scene.plot,
            moved: false,
        }, e.shiftKey);
        if (dragRef.current?.kind === "pan" || dragRef.current?.kind === "pan-frequency") setCursor("grabbing");
    };

    const onPointerMove = (e) => {
        const api = apiRef.current;
        if (!api.scene.valid) return;
        const pos = positionIn(canvasRef.current, e);
        if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, pos);

        if (pinchRef.current && pointersRef.current.size === 2) {
            const [a, b] = [...pointersRef.current.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            const { view, anchor, dist: startDist } = pinchRef.current;
            api.applyView(zoomX(view, startDist / dist, anchor, api.limits));
            return;
        }

        const drag = dragRef.current;
        if (drag) {
            if (!drag.moved && Math.hypot(pos.x - drag.startX, pos.y - drag.startY) > CLICK_SLOP) {
                drag.moved = true;
                if (hoverRef.current) setHover(null);
            }
            if (drag.moved) applyDrag(api, drag, pos);
            return;
        }

        if (e.pointerType === "touch") return;

        const hit = hitAt(api, pos, e.pointerType);
        const kind = hit?.kind ?? null;
        api.setHoverTarget(kind, hit?.id ?? null);
        setCursor(cursorFor(api, kind));
        setHover(PLOT_KINDS.includes(kind) && api.features.crosshair ? pos : null);
    };

    const onPointerUp = (e) => {
        const api = apiRef.current;
        pointersRef.current.delete(e.pointerId);
        if (pointersRef.current.size < 2) pinchRef.current = null;

        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag) return;

        if (!drag.moved && api.scene.valid) {
            const pos = positionIn(canvasRef.current, e);
            if (drag.kind === "label" || drag.kind === "label-click") {
                api.openLabel(drag.id);
            } else if (drag.kind === "place-label") {
                // On release, not press: the press would move focus back out of the editor.
                api.openNewLabel(api.scene.xToFreq(pos.x));
            } else if (drag.kind !== "x-axis" && drag.kind !== "y-axis") {
                api.onFrequencyClick?.(api.scene.xToFreq(pos.x));
                if (e.pointerType === "touch" && api.features.crosshair) setHover(pos);
            }
        }
        if (drag.kind === "pan" || drag.kind === "pan-frequency") setCursor(cursorFor(api, "plot"));
    };

    const onPointerLeave = (e) => {
        if (e.pointerType === "touch" || dragRef.current) return;
        apiRef.current.setHoverTarget(null, null);
        if (hoverRef.current) setHover(null);
    };

    const onContextMenu = (e) => {
        const api = apiRef.current;
        if (!api.features.contextMenu || !api.scene.valid) return;
        const pos = positionIn(canvasRef.current, e);
        const hit = hitAt(api, pos, e.pointerType);
        if (!hit || hit.kind === "x-axis" || hit.kind === "y-axis") return;
        e.preventDefault();
        const { plot } = api.scene;
        api.openMenu({
            clientX: e.clientX,
            clientY: e.clientY,
            freq: api.scene.xToFreq(pos.x),
            // Below the plot the vertical axis is time: there is no level to offer.
            db: pos.y <= plot.y + plot.h ? api.scene.yToDb(pos.y) : null,
        });
    };

    const onKeyDown = (e) => {
        const api = apiRef.current;
        const { features, view, limits, scene } = api;
        if (!scene.valid) return;
        const panFreq = view.span * 0.1;
        const panDb = (view.dbMax - view.dbMin) * 0.1;
        let handled = true;

        if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && features.crosshair) {
            const prev = hoverRef.current ?? { x: scene.plot.x + scene.plot.w / 2, y: scene.plot.y + scene.plot.h / 2 };
            const x = prev.x + (e.key === "ArrowLeft" ? -1 : 1);
            setHover({ x: Math.max(scene.plot.x, Math.min(scene.plot.x + scene.plot.w, x)), y: prev.y });
        } else if ((e.key === "+" || e.key === "=") && features.zoom) {
            api.applyView(zoomStep(view, 1, limits));
        } else if ((e.key === "-" || e.key === "_") && features.zoom) {
            api.applyView(zoomStep(view, -1, limits));
        } else if (e.key === "0" && features.resetZoom) {
            api.resetView();
        } else if (e.key === "ArrowLeft" && features.pan) {
            api.applyView(panX(view, -panFreq, limits));
        } else if (e.key === "ArrowRight" && features.pan) {
            api.applyView(panX(view, panFreq, limits));
        } else if (e.key === "ArrowUp" && features.pan) {
            api.applyView(panY(view, panDb));
        } else if (e.key === "ArrowDown" && features.pan) {
            api.applyView(panY(view, -panDb));
        } else if (e.key === "Escape") {
            if (hoverRef.current) setHover(null);
            handled = false;
        } else {
            handled = false;
        }
        if (handled) e.preventDefault();
    };

    const onFocus = (e) => {
        const { scene, features } = apiRef.current;
        // Same readout on keyboard focus as on hover.
        if (scene.valid && features.crosshair && e.target.matches?.(":focus-visible") && !hoverRef.current) {
            setHover({ x: scene.plot.x + scene.plot.w / 2, y: scene.plot.y + scene.plot.h / 2 });
        }
    };

    const onBlur = () => {
        if (hoverRef.current) setHover(null);
    };

    // React attaches wheel passively, which would make preventDefault a no-op.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const onWheel = (e) => {
            const api = apiRef.current;
            if (!api.features.zoom || !api.scene.valid) return;
            const pos = positionIn(canvas, e);
            const hit = hitAt(api, pos, "mouse");
            if (!hit) return;
            e.preventDefault();

            const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
            const speed = e.ctrlKey ? 0.01 : 0.0018;
            const factor = Math.exp(e.deltaY * unit * speed);

            if (hit.kind === "y-axis" || (e.shiftKey && hit.kind !== "waterfall")) {
                api.applyView(zoomY(api.view, factor, api.scene.yToDb(pos.y)));
            } else {
                api.applyView(zoomX(api.view, factor, api.scene.xToFreq(pos.x), api.limits));
            }
        };
        canvas.addEventListener("wheel", onWheel, { passive: false });
        return () => canvas.removeEventListener("wheel", onWheel);
    }, [apiRef, canvasRef]);

    return {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerUp,
        onPointerLeave,
        onContextMenu,
        onKeyDown,
        onFocus,
        onBlur,
    };
}

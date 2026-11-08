import type { CSSProperties, ForwardRefExoticComponent, MutableRefObject, ReactNode, RefAttributes, RefObject } from "react";

export type LevelArray = ArrayLike<number>;

/** A level array, or an object carrying one (e.g. a stream message). */
export type SpectrumSource = LevelArray | { spectrum: LevelArray; counter?: number | string };

export interface SpectrumView {
    centerFreq: number;
    span: number;
    dbMin: number;
    dbMax: number;
}

export interface SpectrumFeatures {
    /** Toolbar above (or below) the plot. Gestures and the context menu keep working without it. */
    toolbar: boolean;
    /** Wheel, pinch and keyboard zoom. Turning it off also removes the zoom in and out buttons. */
    zoom: boolean;
    /** Zoom in button. */
    zoomIn: boolean;
    /** Zoom out button. */
    zoomOut: boolean;
    /** Reset zoom button, its context menu item and the `0` key. */
    resetZoom: boolean;
    /** Fit levels button. `autoFitLevels` is separate from it. */
    fitLevels: boolean;
    /** Drag to pan the frequency and level axes. */
    pan: boolean;
    average: boolean;
    maxHold: boolean;
    minHold: boolean;
    /** Clear traces button. */
    clearTraces: boolean;
    /** Marker on the strongest bin in view. */
    peak: boolean;
    /** Draggable horizontal level line. */
    level: boolean;
    /** Bandwidth ruler. */
    ruler: boolean;
    /** Frequency labels above the plot, each with a vertical line. */
    labels: boolean;
    /** Crosshair and value tooltip. */
    crosshair: boolean;
    /** Trace color input in the toolbar. */
    colorPicker: boolean;
    pause: boolean;
    contextMenu: boolean;
    grid: boolean;
    axes: boolean;
    legend: boolean;
    /** Scale next to the level axis; shown with `colorStops` or while the waterfall is on. */
    colorBar: boolean;
    /** Makes the waterfall available, with its toolbar button. Whether it shows is `waterfall`. */
    waterfall: boolean;
}

export interface SpectrumRuler {
    centerFreq: number;
    bandwidth: number;
}

export interface SpectrumLabel {
    id: string | number;
    freq: number;
    text: string;
    color?: string;
    /** Clicking still fires `onLabelClick`, but opens no editor. */
    readOnly?: boolean;
}

export interface SpectrumColorStop {
    /** 0 = bottom of the visible level range, 1 = top. */
    offset: number;
    color: string;
}

export interface SpectrumTheme {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    grid: string;
    axis: string;
    border: string;
    hover: string;
    crosshair: string;
    trace: string;
    maxHold: string;
    minHold: string;
    label: string;
    level: string;
    ruler: string;
}

export type SpectrumMessages = Record<keyof typeof DEFAULT_MESSAGES, string>;

export interface SpectrumCursor {
    freq: number;
    /** Level under the pointer; null over the waterfall, whose vertical axis is time. */
    db: number | null;
    /** Trace level at that frequency (or that waterfall row), or null when there is none. */
    level: number | null;
    /** Over the waterfall: how far that row is behind the newest one, in ms. */
    ageMs?: number | null;
}

export interface SpectrumPlotArea {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
}

export interface SpectrumContextMenuItem {
    label: string;
    /** `db` is null when the menu was opened over the waterfall. */
    onClick: (point: { freq: number; db: number | null }) => void;
}

export interface SpectrumAnalyzerProps {
    /** Newest frame in dB per bin. Each new array identity is one frame. */
    data?: SpectrumSource | null;
    /** Polled once per animation frame, so high-rate streams skip React re-renders. */
    dataRef?: RefObject<SpectrumSource | null> | MutableRefObject<SpectrumSource | null>;
    /** Center of the range the frame's bins cover, in Hz. */
    centerFreq: number;
    /** Width of the range the frame's bins cover, in Hz. */
    span: number;
    /** Level range before the first signal, and on reset when set. Default -120. */
    dbMin?: number;
    /** Level range before the first signal, and on reset when set. Default 0. */
    dbMax?: number;
    /**
     * Fits the level axis to the first frame with a signal, and again on reset.
     * Default: on. `dbMin` or `dbMax` turns both off; a level in `view` or
     * `defaultView` turns off the first fit only.
     */
    autoFitLevels?: boolean;

    /** Every feature and toolbar tool defaults to on; pass `false` for what you don't want. */
    features?: Partial<SpectrumFeatures>;

    view?: Partial<SpectrumView>;
    defaultView?: Partial<SpectrumView>;
    onViewChange?: (view: SpectrumView) => void;
    /** Narrowest span in Hz. Default: span / 10000, at least 1 Hz. */
    minSpan?: number;
    /** Widest span in Hz. Default: `span`. */
    maxSpan?: number;

    /** Length of the averaging queue. 1 = off. */
    average?: number;
    defaultAverage?: number;
    onAverageChange?: (count: number) => void;
    /** "db" averages the dB values; "power" averages linear power. Default "db". */
    averageMode?: "db" | "power";
    /** Upper limit for `average`; memory use is frames x bins x 4 bytes. Default 1000. */
    averageMax?: number;

    maxHold?: boolean;
    defaultMaxHold?: boolean;
    onMaxHoldChange?: (on: boolean) => void;
    minHold?: boolean;
    defaultMinHold?: boolean;
    onMinHoldChange?: (on: boolean) => void;
    peak?: boolean;
    defaultPeak?: boolean;
    onPeakChange?: (on: boolean) => void;

    /** Shows the waterfall under the spectrum. Default false. */
    waterfall?: boolean;
    defaultWaterfall?: boolean;
    onWaterfallChange?: (on: boolean) => void;
    /** Share of the height the waterfall takes, 0 to 1. Default 0.5. */
    waterfallRatio?: number;
    /** Rows kept, so that zoom and level changes can repaint them. Default 1024. */
    waterfallRows?: number;
    /** CSS px per row; larger scrolls faster. Default 1. */
    waterfallRowHeight?: number;
    /** Wider frames keep their strongest bin per column. Memory is rows x bins x 4 bytes. Default 4096. */
    waterfallMaxBins?: number;
    /** A preset name or your own stops, offset 0 being the weakest level. Default "jet". */
    waterfallColors?: "jet" | "viridis" | "grayscale" | SpectrumColorStop[];
    /** Level range of the colors. Default: the spectrum's visible range. */
    waterfallLevels?: { dbMin: number; dbMax: number };

    /** Any CSS color. Default: `theme.trace`. */
    color?: string;
    defaultColor?: string;
    onColorChange?: (color: string) => void;
    /** Colors the trace by level; replaces `color` and the toolbar color input. */
    colorStops?: SpectrumColorStop[];
    /** Default 1.5. */
    lineWidth?: number;
    /** Opacity of the area under the trace, 0 to 1. Default 0.1. */
    fill?: number;

    /** In dB; null hides the line. */
    level?: number | null;
    defaultLevel?: number | null;
    onLevelChange?: (level: number | null) => void;
    levelLabel?: string;
    /** Dragging snaps to this step in dB. Default 0.5. */
    levelStep?: number;

    /** null hides the ruler. */
    ruler?: SpectrumRuler | null;
    defaultRuler?: SpectrumRuler | null;
    onRulerChange?: (ruler: SpectrumRuler | null) => void;

    labels?: SpectrumLabel[];
    defaultLabels?: SpectrumLabel[];
    onLabelsChange?: (labels: SpectrumLabel[]) => void;
    onLabelClick?: (label: SpectrumLabel) => void;
    /** Default 3. */
    maxLabelRows?: number;

    paused?: boolean;
    defaultPaused?: boolean;
    onPausedChange?: (paused: boolean) => void;
    /** Caps redraws, not frame processing: the average still sees every frame. Default 60. */
    maxFps?: number;

    /** Default "auto": follows the OS. An object overrides single tokens. */
    theme?: "auto" | "light" | "dark" | (Partial<SpectrumTheme> & { base?: "light" | "dark" });
    messages?: Partial<SpectrumMessages>;
    /** Default "dB". */
    dbUnit?: string;
    /** Default: picked from the visible range. */
    frequencyUnit?: "Hz" | "kHz" | "MHz" | "GHz";
    /** Replaces all frequency text, including axis ticks. */
    formatFrequency?: (hz: number) => string;
    /** Fixed plot margins in px, e.g. to line up with a waterfall. `top` excludes the label band. */
    plotMargin?: { left?: number; right?: number; top?: number; bottom?: number };
    toolbarPosition?: "top" | "bottom";
    toolbarExtra?: ReactNode;
    contextMenuItems?: SpectrumContextMenuItem[];
    className?: string;
    style?: CSSProperties;
    /** Floor for parents with no height of their own. Default 160. */
    minHeight?: number | string;
    ariaLabel?: string;

    /** null when the pointer leaves the plot. */
    onCursorChange?: (cursor: SpectrumCursor | null) => void;
    onFrequencyClick?: (freq: number) => void;
    onPlotAreaChange?: (area: SpectrumPlotArea) => void;
}

export interface SpectrumAnalyzerHandle {
    pushFrame(frame: LevelArray): void;
    /** Restarts the averaging queue and the holds. */
    clearTraces(): void;
    zoomIn(): void;
    zoomOut(): void;
    resetZoom(): void;
    /** Fits the level axis to the visible trace. */
    fitLevels(): void;
    setView(view: Partial<SpectrumView>): void;
    getView(): SpectrumView;
    getTraces(): { current: Float32Array | null; maxHold: Float32Array | null; minHold: Float32Array | null };
    /** Strongest bin in view. */
    getPeak(): { freq: number; db: number } | null;
    toDataURL(type?: string, quality?: number): string | null;
    /** One row per bin: frequency, level and any active holds. */
    toCSV(): string;
}

export const SpectrumAnalyzer: ForwardRefExoticComponent<SpectrumAnalyzerProps & RefAttributes<SpectrumAnalyzerHandle>>;
export default SpectrumAnalyzer;

export const DEFAULT_FEATURES: SpectrumFeatures;
export const DEFAULT_MESSAGES: {
    zoomIn: string;
    zoomOut: string;
    resetZoom: string;
    fitLevels: string;
    average: string;
    averageTitle: string;
    live: string;
    maxHold: string;
    maxHoldShort: string;
    minHold: string;
    minHoldShort: string;
    peak: string;
    level: string;
    ruler: string;
    label: string;
    color: string;
    pause: string;
    resume: string;
    clear: string;
    center: string;
    bandwidth: string;
    cursor: string;
    noData: string;
    labelHere: string;
    rulerHere: string;
    removeRuler: string;
    levelHere: string;
    removeLevel: string;
    centerHere: string;
    labelPlaceholder: string;
    labelColor: string;
    deleteLabel: string;
    placeLabelHint: string;
    waterfall: string;
    seconds: string;
    chartName: string;
};
export const WATERFALL_COLORMAPS: Record<"jet" | "viridis" | "grayscale", SpectrumColorStop[]>;
export const LIGHT_THEME: SpectrumTheme;
export const DARK_THEME: SpectrumTheme;

export class FrameAverager {
    constructor(count?: number, mode?: "db" | "power");
    readonly count: number;
    readonly filled: number;
    output: Float32Array | null;
    setCount(count: number): void;
    setMode(mode: "db" | "power"): void;
    push(frame: LevelArray): Float32Array;
    reset(): void;
}

export class TraceProcessor {
    current: Float32Array | null;
    maxHold: Float32Array | null;
    minHold: Float32Array | null;
    averager: FrameAverager;
    configure(options: { average: number; averageMode: "db" | "power"; maxHold: boolean; minHold: boolean }): void;
    push(bins: LevelArray): void;
    clear(): void;
}

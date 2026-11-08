export const FONT_SIZE = 11;
export const LABEL_ROW_HEIGHT = 22;
const LABEL_CHIP_HEIGHT = 18;
const LABEL_MAX_WIDTH = 140;
const LABEL_PADDING = 7;
const LABEL_GAP = 4;

const COLOR_BAR_WIDTH = 10;
const Y_AXIS_WIDTH = 42;
const X_AXIS_HEIGHT = 24;
const RIGHT_MARGIN = 42;
const WATERFALL_BOTTOM = 6;
const MIN_WATERFALL_HEIGHT = 40;
const MIN_PLOT_HEIGHT = 40;

function fitText(text, maxWidth, measure) {
    if (measure(text) <= maxWidth) return text;
    let end = text.length;
    while (end > 1 && measure(`${text.slice(0, end - 1)}…`) > maxWidth) end--;
    return `${text.slice(0, end - 1)}…`;
}

/**
 * Stacks labels into rows so they never overlap; once `maxRows` is full the
 * remainder share the top row. Row 0 sits directly above the plot.
 */
function placeLabels(labels, plotX, plotW, view, maxRows, measure) {
    const start = view.centerFreq - view.span / 2;
    const toX = (f) => plotX + ((f - start) / view.span) * plotW;

    const visible = labels
        .filter((l) => l.freq >= start && l.freq <= start + view.span)
        .map((l) => {
            const text = fitText(String(l.text ?? ""), LABEL_MAX_WIDTH, measure);
            const width = Math.min(plotW, measure(text) + LABEL_PADDING * 2);
            const lineX = toX(l.freq);
            const x = Math.max(plotX, Math.min(lineX - width / 2, plotX + plotW - width));
            return { label: l, text, width, lineX, x, row: 0 };
        })
        .sort((a, b) => a.x - b.x);

    const rowEnds = [];
    for (const box of visible) {
        let row = rowEnds.findIndex((end) => box.x >= end + LABEL_GAP);
        if (row < 0) row = Math.min(rowEnds.length, maxRows - 1);
        rowEnds[row] = box.x + box.width;
        box.row = row;
    }
    return { boxes: visible, rows: rowEnds.length };
}

/** Everything that depends only on size and view: the plot rect, scales and label boxes. */
export function computeLayout({
    width,
    height,
    view,
    labels = [],
    showLabels = false,
    showAxes = true,
    colorBar = false,
    margin = {},
    maxLabelRows = 3,
    waterfallRatio = null,
    measure = (text) => text.length * 6,
}) {
    const left = margin.left ?? ((showAxes ? Y_AXIS_WIDTH : 8) + (colorBar ? COLOR_BAR_WIDTH + 4 : 0));
    const right = margin.right ?? (showAxes ? RIGHT_MARGIN : 8);
    const axisBand = showAxes ? X_AXIS_HEIGHT : 8;
    const plotX = left;
    const plotW = Math.max(0, width - left - right);

    const placed = showLabels && plotW > 0
        ? placeLabels(labels, plotX, plotW, view, Math.max(1, maxLabelRows), measure)
        : { boxes: [], rows: 0 };

    // One row stays reserved so the first label doesn't shift the plot.
    const top = (margin.top ?? 8) + (showLabels ? Math.max(1, placed.rows) * LABEL_ROW_HEIGHT : 0);

    // The frequency axis stays under the spectrum; the waterfall hangs below it.
    const bottomWithWaterfall = margin.bottom ?? WATERFALL_BOTTOM;
    const room = height - top - axisBand - bottomWithWaterfall;
    const waterfallH = waterfallRatio != null ? Math.round(room * Math.max(0, Math.min(1, waterfallRatio))) : 0;
    const fits = waterfallRatio != null && waterfallH >= MIN_WATERFALL_HEIGHT && room - waterfallH >= MIN_PLOT_HEIGHT;

    const plotH = fits ? room - waterfallH : Math.max(0, height - top - (margin.bottom ?? axisBand));
    const plot = { x: plotX, y: top, w: plotW, h: plotH };
    const waterfall = fits ? { x: plotX, y: top + plotH + axisBand, w: plotW, h: waterfallH } : null;

    const start = view.centerFreq - view.span / 2;
    const dbRange = view.dbMax - view.dbMin || 1;

    return {
        valid: plotW > 0 && plotH > 0,
        width,
        height,
        plot,
        waterfall,
        view,
        colorBar,
        showAxes,
        freqToX: (f) => plot.x + ((f - start) / view.span) * plot.w,
        xToFreq: (x) => start + ((x - plot.x) / plot.w) * view.span,
        dbToY: (db) => plot.y + plot.h - ((db - view.dbMin) / dbRange) * plot.h,
        yToDb: (y) => view.dbMin + ((plot.y + plot.h - y) / plot.h) * dbRange,
        labelBoxes: placed.boxes.map((box) => ({
            ...box,
            y: top - (box.row + 1) * LABEL_ROW_HEIGHT + (LABEL_ROW_HEIGHT - LABEL_CHIP_HEIGHT) / 2,
            height: LABEL_CHIP_HEIGHT,
        })),
    };
}

export function rulerEdges(ruler) {
    return { start: ruler.centerFreq - ruler.bandwidth / 2, stop: ruler.centerFreq + ruler.bandwidth / 2 };
}

/** Topmost thing under a point. Priority follows the draw order, top layer first. */
export function hitTest(px, py, scene, { level = null, ruler = null, slack = 6 } = {}) {
    if (!scene.valid) return null;
    const { plot, waterfall } = scene;
    const inPlot = px >= plot.x && px <= plot.x + plot.w && py >= plot.y && py <= plot.y + plot.h;
    const inWaterfall = Boolean(waterfall)
        && px >= waterfall.x && px <= waterfall.x + waterfall.w
        && py >= waterfall.y && py <= waterfall.y + waterfall.h;

    for (let i = scene.labelBoxes.length - 1; i >= 0; i--) {
        const box = scene.labelBoxes[i];
        if (px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height) {
            return { kind: "label", id: box.label.id };
        }
    }

    if (inPlot && level != null) {
        const y = Math.max(plot.y, Math.min(plot.y + plot.h, scene.dbToY(level)));
        if (Math.abs(py - y) <= slack) return { kind: "level" };
    }

    // The ruler spans the waterfall too, and can be grabbed there as well.
    if ((inPlot || inWaterfall) && ruler) {
        const { start, stop } = rulerEdges(ruler);
        const x0 = scene.freqToX(start);
        const x1 = scene.freqToX(stop);
        if (Math.abs(px - x0) <= slack) return { kind: "ruler-start" };
        if (Math.abs(px - x1) <= slack) return { kind: "ruler-stop" };
        if (px > x0 && px < x1) return { kind: "ruler-body" };
    }

    if (inPlot) return { kind: "plot" };
    if (inWaterfall) return { kind: "waterfall" };
    if (px < plot.x && py >= plot.y && py <= plot.y + plot.h) return { kind: "y-axis" };
    const axisBottom = waterfall ? waterfall.y : scene.height;
    if (py > plot.y + plot.h && py < axisBottom && px >= plot.x && px <= plot.x + plot.w) return { kind: "x-axis" };
    return null;
}

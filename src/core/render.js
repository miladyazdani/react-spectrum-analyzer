import { FONT_SIZE, rulerEdges } from "./layout.js";
import {
    formatFrequency,
    frequencyAxis,
    niceStep,
    peakInRange,
    sampleColumn,
    ticks,
} from "./scale.js";
import { timeStep } from "./waterfall.js";

const fontOf = (family, size = FONT_SIZE, weight = 400) => `${weight} ${size}px ${family}`;

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// A 1px line sits on the pixel grid only at half coordinates.
const crisp = (v) => Math.round(v) + 0.5;

function hLine(ctx, x0, x1, y) {
    ctx.beginPath();
    ctx.moveTo(x0, crisp(y));
    ctx.lineTo(x1, crisp(y));
    ctx.stroke();
}

function vLine(ctx, x, y0, y1) {
    ctx.beginPath();
    ctx.moveTo(crisp(x), y0);
    ctx.lineTo(crisp(x), y1);
    ctx.stroke();
}

function gradientOf(ctx, plot, stops) {
    const gradient = ctx.createLinearGradient(0, plot.y + plot.h, 0, plot.y);
    for (const stop of stops) gradient.addColorStop(stop.offset, stop.color);
    return gradient;
}

/* ================= Static layer: grid, axes, color bar ================= */
export function drawBase(ctx, scene, o) {
    const { plot, view } = scene;
    const { theme, fontFamily } = o;
    ctx.clearRect(0, 0, scene.width, scene.height);

    const start = view.centerFreq - view.span / 2;
    const stop = start + view.span;
    const xStep = niceStep(view.span, Math.max(2, Math.floor(plot.w / 70)));
    const yStep = niceStep(view.dbMax - view.dbMin, Math.max(2, Math.floor(plot.h / 36)));
    const xTicks = ticks(start, stop, xStep);
    const yTicks = ticks(view.dbMin, view.dbMax, yStep);

    ctx.lineWidth = 1;
    if (o.grid) {
        ctx.strokeStyle = theme.grid;
        for (const db of yTicks) hLine(ctx, plot.x, plot.x + plot.w, scene.dbToY(db));
        for (const f of xTicks) vLine(ctx, scene.freqToX(f), plot.y, plot.y + plot.h);
    }

    ctx.strokeStyle = theme.axis;
    hLine(ctx, plot.x, plot.x + plot.w, plot.y + plot.h);
    vLine(ctx, plot.x, plot.y, plot.y + plot.h);

    if (scene.showAxes) {
        ctx.font = fontOf(fontFamily);
        ctx.fillStyle = theme.textSecondary;

        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        const axisRight = plot.x - 6;
        for (const db of yTicks) {
            const label = Number.isInteger(db) ? `${db}` : db.toFixed(1);
            ctx.fillText(label, axisRight, Math.max(plot.y + 5, Math.min(plot.y + plot.h - 5, scene.dbToY(db))));
        }

        const axis = frequencyAxis(start, stop, xStep, o.frequencyUnit);
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const axisY = plot.y + plot.h + 7;
        // The unit sits at the far right; a tick that would run into it gives way.
        const unitLeft = o.formatFrequency ? scene.width : scene.width - 2 - ctx.measureText(axis.unit).width;
        let lastRight = -Infinity;
        for (const f of xTicks) {
            const label = o.formatFrequency ? o.formatFrequency(f) : (f / axis.scale).toFixed(axis.decimals);
            const half = ctx.measureText(label).width / 2;
            const x = scene.freqToX(f);
            if (x - half < Math.max(0, lastRight + 6) || x + half > unitLeft - 4) continue;
            ctx.fillText(label, x, axisY);
            lastRight = x + half;
        }

        if (!o.formatFrequency) {
            ctx.textAlign = "right";
            ctx.fillText(axis.unit, scene.width - 2, axisY);
        }
    }

    // Beside the level axis, so a color reads off as the level printed next to it.
    if (scene.colorBar && (o.colorStops || scene.waterfall)) {
        const levels = o.waterfallLevels;
        const span = !o.colorStops && levels
            ? { y: scene.dbToY(levels.dbMax), h: scene.dbToY(levels.dbMin) - scene.dbToY(levels.dbMax) }
            : plot;
        ctx.fillStyle = gradientOf(ctx, span, o.colorStops ?? o.waterfallColors);
        roundRect(ctx, 1, plot.y, 8, plot.h, 2);
        ctx.fill();
    }
}

/* ================= Trace ================= */
// Min/max per pixel column: keeps peaks and caps the path at ~2x the plot width.
function tracePath(ctx, bins, scene, data, closeToBottom) {
    const { plot, view } = scene;
    const n = bins.length;
    if (n < 2) return false;

    const start = view.centerFreq - view.span / 2;
    const stop = start + view.span;
    const dataStart = data.centerFreq - data.span / 2;
    const binFreq = data.span / (n - 1);
    const i0 = Math.max(0, Math.floor((start - dataStart) / binFreq));
    const i1 = Math.min(n - 1, Math.ceil((stop - dataStart) / binFreq));
    if (i1 <= i0) return false;

    const yMin = plot.y - 2;
    const yMax = plot.y + plot.h + 2;
    const toY = (db) => Math.max(yMin, Math.min(yMax, scene.dbToY(db)));
    const bottom = plot.y + plot.h;
    const firstX = scene.freqToX(dataStart + i0 * binFreq);

    ctx.beginPath();
    if (closeToBottom) ctx.moveTo(firstX, bottom);

    let lastX = firstX;
    if (i1 - i0 <= plot.w * 2) {
        for (let i = i0; i <= i1; i++) {
            lastX = scene.freqToX(dataStart + i * binFreq);
            const y = toY(bins[i]);
            if (i === i0 && !closeToBottom) ctx.moveTo(lastX, y);
            else ctx.lineTo(lastX, y);
        }
    } else {
        const cols = Math.max(1, Math.floor(plot.w));
        for (let c = 0; c <= cols; c++) {
            const f0 = start + (c / cols) * view.span;
            const f1 = start + ((c + 1) / cols) * view.span;
            const b0 = Math.max(i0, Math.floor((f0 - dataStart) / binFreq));
            const b1 = Math.min(i1, Math.max(b0, Math.floor((f1 - dataStart) / binFreq) - 1));
            let mn = bins[b0];
            let mx = mn;
            for (let i = b0 + 1; i <= b1; i++) {
                const v = bins[i];
                if (v < mn) mn = v;
                else if (v > mx) mx = v;
            }
            lastX = plot.x + c * (plot.w / cols);
            if (c === 0 && !closeToBottom) ctx.moveTo(lastX, toY(mx));
            else ctx.lineTo(lastX, toY(mx));
            if (mn !== mx) ctx.lineTo(lastX, toY(mn));
        }
    }

    if (closeToBottom) {
        ctx.lineTo(lastX, bottom);
        ctx.closePath();
    }
    return true;
}

function drawTrace(ctx, bins, scene, data, style, lineWidth) {
    if (!tracePath(ctx, bins, scene, data, false)) return;
    ctx.strokeStyle = style;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";
    ctx.stroke();
}

/* ================= Chips ================= */
/**
 * rows: [{ value, label?, key? }]. The value leads in primary ink; a label follows
 * in secondary ink; `key` draws a short stroke of the series color.
 */
function drawChip(ctx, rows, anchor, bounds, o) {
    const { theme, fontFamily } = o;
    const rowH = 16;
    const pad = 7;
    const keyW = 12;

    const widths = rows.map((row) => {
        ctx.font = fontOf(fontFamily, FONT_SIZE, 600);
        const valueW = ctx.measureText(row.value).width;
        ctx.font = fontOf(fontFamily);
        const labelW = row.label ? ctx.measureText(row.label).width + 6 : 0;
        return { valueW, total: (row.key ? keyW + 5 : 0) + valueW + labelW };
    });
    const w = Math.max(...widths.map((v) => v.total)) + pad * 2;
    const h = rows.length * rowH + 6;

    let x = anchor.align === "right" ? anchor.x - w : anchor.align === "center" ? anchor.x - w / 2 : anchor.x;
    let y = anchor.y;
    x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.w - w));
    y = Math.max(bounds.y, Math.min(y, bounds.y + bounds.h - h));

    roundRect(ctx, x, y, w, h, 4);
    ctx.fillStyle = theme.surface;
    ctx.fill();
    ctx.strokeStyle = anchor.border ?? theme.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    rows.forEach((row, i) => {
        const cy = y + 3 + rowH * i + rowH / 2;
        let cx = x + pad;
        if (row.key) {
            ctx.strokeStyle = row.key;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + keyW, cy);
            ctx.stroke();
            cx += keyW + 5;
        }
        ctx.font = fontOf(fontFamily, FONT_SIZE, 600);
        ctx.fillStyle = theme.text;
        ctx.fillText(row.value, cx, cy);
        if (row.label) {
            ctx.font = fontOf(fontFamily);
            ctx.fillStyle = theme.textSecondary;
            ctx.fillText(row.label, cx + widths[i].valueW + 6, cy);
        }
    });
    return { x, y, w, h };
}

/* ================= Overlays ================= */
function drawRulerBand(ctx, scene, o) {
    const { plot } = scene;
    const { start, stop } = rulerEdges(o.ruler);
    const x0 = Math.max(plot.x, scene.freqToX(start));
    const x1 = Math.min(plot.x + plot.w, scene.freqToX(stop));
    if (x1 <= x0) return;
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = o.theme.ruler;
    ctx.fillRect(x0, plot.y, x1 - x0, plot.h);
    ctx.globalAlpha = 1;
}

// Vertical overlays run through the plot and the waterfall, skipping the axis between them.
function verticalThrough(ctx, scene, x, topY = scene.plot.y) {
    const { plot, waterfall } = scene;
    vLine(ctx, x, topY, plot.y + plot.h);
    if (waterfall) vLine(ctx, x, waterfall.y, waterfall.y + waterfall.h);
}

function drawRulerOnWaterfall(ctx, scene, o) {
    const rect = scene.waterfall;
    const { start, stop } = rulerEdges(o.ruler);
    const x0 = Math.max(rect.x, scene.freqToX(start));
    const x1 = Math.min(rect.x + rect.w, scene.freqToX(stop));
    if (x1 <= x0) return;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = o.theme.surface;
    ctx.fillRect(x0, rect.y, x1 - x0, rect.h);
    ctx.globalAlpha = 1;
}

function drawTimeAxis(ctx, scene, o) {
    const rect = scene.waterfall;
    const history = o.waterfallHistory;
    const rows = Math.min(history.length, Math.ceil(rect.h / o.waterfallRowHeight));
    if (!scene.showAxes || rows < 2) return;

    const newest = history.timeAt(0);
    const elapsed = newest - history.timeAt(rows - 1);
    if (elapsed <= 0) return;

    // The scale comes from the rows on screen, since frames rarely arrive evenly.
    const msPerPx = elapsed / (rows * o.waterfallRowHeight);
    const step = timeStep(msPerPx * 40);

    ctx.font = fontOf(o.fontFamily);
    ctx.fillStyle = o.theme.textSecondary;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const axisRight = rect.x - 6;
    let next = step;
    for (let age = 1; age < rows; age++) {
        if (newest - history.timeAt(age) < next) continue;
        const y = rect.y + age * o.waterfallRowHeight;
        const seconds = next / 1000;
        const text = next < 1000 ? seconds.toFixed(1) : `${seconds}`;
        if (y < rect.y + rect.h - 5) ctx.fillText(`-${text}${o.messages.seconds}`, axisRight, y);
        next += step;
    }
}

function drawRuler(ctx, scene, o, legendBottom) {
    const { plot } = scene;
    const { start, stop } = rulerEdges(o.ruler);
    const hover = o.hoverKind?.startsWith("ruler");

    ctx.strokeStyle = o.theme.ruler;
    ctx.lineWidth = hover ? 2 : 1.5;
    for (const f of [start, stop]) {
        const x = scene.freqToX(f);
        if (x >= plot.x && x <= plot.x + plot.w) verticalThrough(ctx, scene, x);
    }

    const resolution = scene.view.span / plot.w;
    const fmt = (hz) => (o.formatFrequency ? o.formatFrequency(hz) : formatFrequency(hz, resolution, o.frequencyUnit));
    const bw = o.formatFrequency ? o.formatFrequency(o.ruler.bandwidth) : formatFrequency(o.ruler.bandwidth, resolution);
    const rows = [
        { value: bw, label: o.messages.bandwidth },
        { value: fmt(o.ruler.centerFreq), label: o.messages.center },
    ];
    const peak = peakInRange(o.series.current, o.data, start, stop);
    if (peak) rows.push({ value: o.formatDb(peak.db), label: o.messages.peak });

    drawChip(ctx, rows, {
        x: scene.freqToX(o.ruler.centerFreq),
        y: legendBottom + 6,
        align: "center",
        border: o.theme.ruler,
    }, plot, o);
}

function drawLevel(ctx, scene, o) {
    const { plot } = scene;
    const y = scene.dbToY(o.level);
    const above = y < plot.y;
    const below = y > plot.y + plot.h;
    const lineY = Math.max(plot.y, Math.min(plot.y + plot.h, y));

    ctx.strokeStyle = o.theme.level;
    ctx.lineWidth = o.hoverKind === "level" ? 2 : 1.5;
    hLine(ctx, plot.x, plot.x + plot.w, lineY);

    const arrow = above ? " ▲" : below ? " ▼" : "";
    drawChip(ctx, [{ value: `${o.formatDb(o.level)}${arrow}`, label: o.levelLabel ?? o.messages.level }], {
        x: plot.x + plot.w - 4,
        y: lineY < plot.y + 28 ? lineY + 4 : lineY - 26,
        align: "right",
        border: o.theme.level,
    }, plot, o);
}

function drawLabels(ctx, scene, o) {
    const { theme, fontFamily } = o;

    for (const box of scene.labelBoxes) {
        const color = box.label.color ?? theme.label;
        ctx.strokeStyle = color;
        ctx.lineWidth = o.hoverKind === "label" && o.hoverId === box.label.id ? 2 : 1;
        verticalThrough(ctx, scene, box.lineX, box.y + box.height);
    }

    ctx.font = fontOf(fontFamily, FONT_SIZE, 500);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    for (const box of scene.labelBoxes) {
        const color = box.label.color ?? theme.label;
        roundRect(ctx, box.x, box.y, box.width, box.height, 4);
        ctx.fillStyle = theme.surface;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = o.hoverKind === "label" && o.hoverId === box.label.id ? 2 : 1;
        ctx.stroke();
        ctx.fillStyle = theme.text;
        ctx.fillText(box.text, box.x + box.width / 2, box.y + box.height / 2 + 0.5);
    }
}

function drawPeak(ctx, scene, o, traceColor) {
    const { plot, view } = scene;
    const start = view.centerFreq - view.span / 2;
    const peak = peakInRange(o.series.current, o.data, start, start + view.span);
    if (!peak) return;
    const x = scene.freqToX(peak.freq);
    const y = Math.max(plot.y + 8, Math.min(plot.y + plot.h, scene.dbToY(peak.db)));

    ctx.fillStyle = traceColor;
    ctx.strokeStyle = o.theme.surface;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 2);
    ctx.lineTo(x - 5, y - 10);
    ctx.lineTo(x + 5, y - 10);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();

    const resolution = view.span / plot.w;
    const freq = o.formatFrequency ? o.formatFrequency(peak.freq) : formatFrequency(peak.freq, resolution, o.frequencyUnit);
    drawChip(ctx, [{ value: o.formatDb(peak.db), label: freq }], {
        x,
        y: y - 38 < plot.y ? y + 4 : y - 36,
        align: "center",
    }, plot, o);
}

function drawLegend(ctx, scene, o, traceColor) {
    const { plot } = scene;
    const rows = [];
    const avg = o.series.averageFilled;
    if (o.average > 1) rows.push({ value: `${avg}/${o.average}`, label: o.messages.average, key: traceColor });
    else if (o.series.maxHold || o.series.minHold) rows.push({ value: o.messages.live, key: traceColor });
    if (o.series.maxHold) rows.push({ value: o.messages.maxHold, key: o.theme.maxHold });
    if (o.series.minHold) rows.push({ value: o.messages.minHold, key: o.theme.minHold });
    if (!rows.length) return plot.y;
    return drawChip(ctx, rows, { x: plot.x + 4, y: plot.y + 4 }, plot, o).y + rows.length * 16 + 6;
}

function drawCrosshair(ctx, scene, o, traceColor) {
    const { plot, view, waterfall } = scene;
    const { x, y } = o.hover;
    const inPlot = y >= plot.y && y <= plot.y + plot.h;
    const inWaterfall = Boolean(waterfall) && y >= waterfall.y && y <= waterfall.y + waterfall.h;
    if (x < plot.x || x > plot.x + plot.w || (!inPlot && !inWaterfall)) return;

    ctx.strokeStyle = o.theme.crosshair;
    ctx.lineWidth = 1;
    verticalThrough(ctx, scene, x);
    hLine(ctx, plot.x, plot.x + plot.w, y);

    const f0 = scene.xToFreq(x - 0.5);
    const f1 = scene.xToFreq(x + 0.5);
    const { current, maxHold, minHold } = o.series;
    const liveLabel = o.average > 1 ? o.messages.average : o.messages.live;
    const rows = [];
    const addRow = (bins, label, key, useMin) => {
        const value = sampleColumn(bins, o.data, f0, f1, useMin);
        if (value != null) rows.push({ value: o.formatDb(value), label, key });
        return value;
    };

    const value = addRow(current, liveLabel, traceColor, false);
    addRow(maxHold, o.messages.maxHold, o.theme.maxHold, false);
    addRow(minHold, o.messages.minHold, o.theme.minHold, true);
    if (inWaterfall) {
        const history = o.waterfallHistory;
        const age = Math.floor((y - waterfall.y) / o.waterfallRowHeight);
        const level = history.sample(age, o.data, f0, f1);
        if (level != null) {
            const seconds = (history.timeAt(0) - history.timeAt(age)) / 1000;
            rows.push({ value: o.formatDb(level), label: `-${seconds.toFixed(1)}${o.messages.seconds}` });
        }
    } else {
        rows.push({ value: o.formatDb(scene.yToDb(y)), label: o.messages.cursor });
    }

    if (value != null) {
        const py = scene.dbToY(value);
        if (py >= plot.y && py <= plot.y + plot.h) {
            ctx.beginPath();
            ctx.arc(x, py, 6, 0, Math.PI * 2);
            ctx.fillStyle = o.theme.surface;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, py, 4, 0, Math.PI * 2);
            ctx.fillStyle = traceColor;
            ctx.fill();
        }
    }

    const resolution = Math.max(view.span / plot.w, 1e-9);
    const freq = scene.xToFreq(x);
    rows.unshift({
        value: o.formatFrequency ? o.formatFrequency(freq) : formatFrequency(freq, resolution, o.frequencyUnit),
    });

    const flip = x > plot.x + plot.w - 170;
    const bounds = inWaterfall ? waterfall : plot;
    drawChip(ctx, rows, { x: flip ? x - 10 : x + 10, y: y + 12, align: flip ? "right" : "left" }, bounds, o);
}

/* ================= Dynamic layer ================= */
export function drawFrame(ctx, scene, base, o) {
    const { plot } = scene;
    const { theme, series, data } = o;

    ctx.clearRect(0, 0, scene.width, scene.height);
    ctx.drawImage(base, 0, 0, scene.width, scene.height);

    if (scene.waterfall) {
        o.waterfallRenderer.draw(ctx, scene.waterfall);
        if (o.ruler) drawRulerOnWaterfall(ctx, scene, o);
        drawTimeAxis(ctx, scene, o);
    }

    const traceStyle = o.colorStops ? gradientOf(ctx, plot, o.colorStops) : o.color;
    const keyColor = o.colorStops ? o.colorStops[o.colorStops.length - 1].color : o.color;

    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.w, plot.h);
    ctx.clip();

    if (o.ruler) drawRulerBand(ctx, scene, o);

    if (series.current) {
        if (o.fill > 0 && tracePath(ctx, series.current, scene, data, true)) {
            ctx.globalAlpha = o.fill;
            ctx.fillStyle = traceStyle;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        if (series.minHold) drawTrace(ctx, series.minHold, scene, data, theme.minHold, 1);
        if (series.maxHold) drawTrace(ctx, series.maxHold, scene, data, theme.maxHold, 1);
        drawTrace(ctx, series.current, scene, data, traceStyle, o.lineWidth);
    }
    ctx.restore();

    drawLabels(ctx, scene, o);

    const legendBottom = o.legend ? drawLegend(ctx, scene, o, keyColor) : plot.y;
    if (o.ruler) drawRuler(ctx, scene, o, legendBottom);
    if (o.level != null) drawLevel(ctx, scene, o);
    if (o.peak && series.current) drawPeak(ctx, scene, o, keyColor);

    if (!series.current) {
        ctx.font = fontOf(o.fontFamily, 13);
        ctx.fillStyle = theme.textSecondary;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(o.messages.noData, plot.x + plot.w / 2, plot.y + plot.h / 2);
    }

    if (o.hover) drawCrosshair(ctx, scene, o, keyColor);
}

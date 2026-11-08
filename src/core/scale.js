import { DB_FLOOR } from "./averager.js";

/* ================= Ticks ================= */
export function niceStep(range, maxTicks) {
    const raw = range / Math.max(1, maxTicks);
    if (!(raw > 0) || !Number.isFinite(raw)) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const normalized = raw / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
}

export function ticks(min, max, step) {
    const out = [];
    const first = Math.ceil(min / step - 1e-9);
    for (let i = first; i * step <= max + step * 1e-9 && out.length < 500; i++) {
        out.push(i * step);
    }
    return out;
}

/* ================= Formatting ================= */
const UNITS = { Hz: 1, kHz: 1e3, MHz: 1e6, GHz: 1e9 };

export function pickFrequencyUnit(hz) {
    const abs = Math.abs(hz);
    if (abs >= 1e9) return "GHz";
    if (abs >= 1e6) return "MHz";
    if (abs >= 1e3) return "kHz";
    return "Hz";
}

export function decimalsFor(step) {
    if (!(step > 0)) return 0;
    return Math.min(9, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
}

export function frequencyAxis(startHz, stopHz, stepHz, forcedUnit) {
    const unit = forcedUnit && UNITS[forcedUnit]
        ? forcedUnit
        : pickFrequencyUnit(Math.max(Math.abs(startHz), Math.abs(stopHz)));
    return { unit, scale: UNITS[unit], decimals: decimalsFor(stepHz / UNITS[unit]) };
}

/** "98.250 MHz", with as many decimals as `resolutionHz` makes meaningful. */
export function formatFrequency(hz, resolutionHz, forcedUnit) {
    const unit = forcedUnit && UNITS[forcedUnit] ? forcedUnit : pickFrequencyUnit(hz || resolutionHz);
    const scale = UNITS[unit];
    return `${(hz / scale).toFixed(decimalsFor((resolutionHz || scale) / scale))} ${unit}`;
}

export function formatDb(db, unit = "dB") {
    return `${db.toFixed(1)} ${unit}`;
}

/* ================= View math ================= */
const MIN_DB_RANGE = 1;
const MAX_DB_RANGE = 600;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function clampCenter(center, span, limits) {
    const dataStart = limits.dataCenter - limits.dataSpan / 2;
    const dataStop = limits.dataCenter + limits.dataSpan / 2;
    const lo = dataStart + span / 2;
    const hi = dataStop - span / 2;
    return lo > hi ? limits.dataCenter : clamp(center, lo, hi);
}

export function clampView(view, limits) {
    const span = clamp(view.span, limits.minSpan, limits.maxSpan);
    return { ...view, span, centerFreq: clampCenter(view.centerFreq, span, limits) };
}

/** Zooms the frequency axis keeping `anchorFreq` under the same pixel. */
export function zoomX(view, factor, anchorFreq, limits) {
    const span = clamp(view.span * factor, limits.minSpan, limits.maxSpan);
    const start = view.centerFreq - view.span / 2;
    const ratio = view.span > 0 ? (anchorFreq - start) / view.span : 0.5;
    const centerFreq = anchorFreq - ratio * span + span / 2;
    return { ...view, span, centerFreq: clampCenter(centerFreq, span, limits) };
}

export function zoomY(view, factor, anchorDb) {
    const range = view.dbMax - view.dbMin;
    const next = clamp(range * factor, MIN_DB_RANGE, MAX_DB_RANGE);
    const ratio = range > 0 ? (anchorDb - view.dbMin) / range : 0.5;
    const dbMin = anchorDb - ratio * next;
    return { ...view, dbMin, dbMax: dbMin + next };
}

export function panX(view, deltaFreq, limits) {
    return { ...view, centerFreq: clampCenter(view.centerFreq + deltaFreq, view.span, limits) };
}

export function panY(view, deltaDb) {
    return { ...view, dbMin: view.dbMin + deltaDb, dbMax: view.dbMax + deltaDb };
}

/* ================= Bin lookups ================= */
/** Index range of the bins covering [f0, f1]; a frame spans its data range inclusively. */
export function binRange(n, data, f0, f1) {
    const start = data.centerFreq - data.span / 2;
    const toBin = (f) => ((f - start) / data.span) * (n - 1);
    const lo = clamp(Math.round(toBin(Math.min(f0, f1))), 0, n - 1);
    const hi = clamp(Math.round(toBin(Math.max(f0, f1))), 0, n - 1);
    return [lo, hi];
}

export function binFrequency(i, n, data) {
    return data.centerFreq - data.span / 2 + (n > 1 ? (i / (n - 1)) * data.span : data.span / 2);
}

/** Strongest bin in [f0, f1], or null when the range holds no finite level. */
export function peakInRange(bins, data, f0, f1) {
    if (!bins || !bins.length) return null;
    const [lo, hi] = binRange(bins.length, data, f0, f1);
    let best = -1;
    let db = -Infinity;
    for (let i = lo; i <= hi; i++) {
        if (bins[i] > db) {
            db = bins[i];
            best = i;
        }
    }
    return best < 0 ? null : { freq: binFrequency(best, bins.length, data), db };
}

/** Extreme of a pixel column, so a tooltip never reports less than the trace drawn there. */
export function sampleColumn(bins, data, f0, f1, useMin = false) {
    if (!bins || !bins.length) return null;
    const [lo, hi] = binRange(bins.length, data, f0, f1);
    let value = bins[lo];
    for (let i = lo + 1; i <= hi; i++) {
        if (useMin ? bins[i] < value : bins[i] > value) value = bins[i];
    }
    return Number.isFinite(value) ? value : null;
}

/** Level range that frames the visible part of a trace, snapped to 5 dB. */
export function fitLevels(bins, data, view) {
    const [lo, hi] = binRange(bins.length, data, view.centerFreq - view.span / 2, view.centerFreq + view.span / 2);
    let min = Infinity;
    let max = -Infinity;
    for (let i = lo; i <= hi; i++) {
        const v = bins[i];
        // Bad bins are stored at the floor; they would stretch the fit to -300.
        if (v <= DB_FLOOR) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    const dbMin = Math.floor((min - 3) / 5) * 5;
    const dbMax = Math.ceil((max + 3) / 5) * 5;
    return { dbMin, dbMax: Math.max(dbMax, dbMin + 5) };
}

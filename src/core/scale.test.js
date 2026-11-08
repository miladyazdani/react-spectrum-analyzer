import { describe, expect, it } from "vitest";
import {
    binRange,
    clampView,
    decimalsFor,
    fitLevels,
    formatFrequency,
    frequencyAxis,
    niceStep,
    panX,
    peakInRange,
    sampleColumn,
    ticks,
    zoomX,
    zoomY,
} from "./scale.js";

const limits = { dataCenter: 100e6, dataSpan: 20e6, minSpan: 1e3, maxSpan: 20e6 };
const full = { centerFreq: 100e6, span: 20e6, dbMin: -120, dbMax: 0 };
const data = { centerFreq: 100e6, span: 20e6 };

describe("ticks", () => {
    it("rounds steps to 1, 2 or 5 times a power of ten", () => {
        expect(niceStep(100, 5)).toBe(20);
        expect(niceStep(100, 4)).toBe(50);
        expect(niceStep(20e6, 7)).toBe(5e6);
    });

    it("lands on multiples of the step, inside the range", () => {
        expect(ticks(-115, -85, 10)).toEqual([-110, -100, -90]);
        expect(ticks(90e6, 110e6, 5e6)).toEqual([90e6, 95e6, 100e6, 105e6, 110e6]);
    });
});

describe("formatting", () => {
    it("shows as many decimals as the step needs", () => {
        expect(decimalsFor(1)).toBe(0);
        expect(decimalsFor(0.5)).toBe(1);
        expect(decimalsFor(0.02)).toBe(2);
    });

    it("picks a unit from the largest visible frequency", () => {
        expect(frequencyAxis(90e6, 110e6, 5e6)).toEqual({ unit: "MHz", scale: 1e6, decimals: 0 });
        expect(frequencyAxis(2.4e9, 2.5e9, 2e7).unit).toBe("GHz");
        expect(frequencyAxis(0, 900, 100).unit).toBe("Hz");
    });

    it("honors a forced unit", () => {
        expect(frequencyAxis(90e6, 110e6, 5e6, "kHz").unit).toBe("kHz");
        expect(formatFrequency(98.25e6, 1e3, "kHz")).toBe("98250 kHz");
    });

    it("formats with the resolution in mind", () => {
        expect(formatFrequency(98.25e6, 1e4)).toBe("98.25 MHz");
        expect(formatFrequency(0, 1e4)).toBe("0 kHz");
    });
});

describe("view math", () => {
    it("zooming keeps the anchor under the same pixel", () => {
        const anchor = 95e6;
        const before = (anchor - (full.centerFreq - full.span / 2)) / full.span;
        const next = zoomX(full, 0.5, anchor, limits);
        const after = (anchor - (next.centerFreq - next.span / 2)) / next.span;
        expect(next.span).toBe(10e6);
        expect(after).toBeCloseTo(before);
    });

    it("cannot zoom out past the data or in past the minimum", () => {
        expect(zoomX(full, 4, 100e6, limits).span).toBe(20e6);
        expect(zoomX(full, 1e-9, 100e6, limits).span).toBe(1e3);
    });

    it("cannot pan outside the data", () => {
        const zoomed = { ...full, span: 10e6 };
        expect(panX(zoomed, 100e6, limits).centerFreq).toBe(105e6);
        expect(panX(zoomed, -100e6, limits).centerFreq).toBe(95e6);
    });

    it("zooming levels keeps the anchor level in place", () => {
        const next = zoomY(full, 0.5, -60);
        expect(next.dbMax - next.dbMin).toBe(60);
        expect((next.dbMin + next.dbMax) / 2).toBe(-60);
    });

    it("clampView fixes an out-of-range view", () => {
        expect(clampView({ ...full, centerFreq: 500e6, span: 1e6 }, limits).centerFreq).toBe(109.5e6);
    });
});

describe("bin lookups", () => {
    const bins = Float32Array.from([-100, -90, -30, -90, -100]);

    it("maps frequencies onto bins, end to end", () => {
        expect(binRange(5, data, 90e6, 110e6)).toEqual([0, 4]);
        expect(binRange(5, data, 100e6, 100e6)).toEqual([2, 2]);
        expect(binRange(5, data, 0, 1)).toEqual([0, 0]);
    });

    it("finds the peak and its frequency inside a range", () => {
        expect(peakInRange(bins, data, 90e6, 110e6)).toEqual({ freq: 100e6, db: -30 });
        expect(peakInRange(bins, data, 90e6, 95e6).db).toBe(-90);
    });

    it("samples the extreme of a pixel column", () => {
        expect(sampleColumn(bins, data, 95e6, 105e6)).toBe(-30);
        expect(sampleColumn(bins, data, 95e6, 105e6, true)).toBe(-90);
    });

    it("fits levels to the visible trace, ignoring bad bins", () => {
        const withBad = Float32Array.from([-300, -90, -30, -90, -100]);
        expect(fitLevels(withBad, data, full)).toEqual({ dbMin: -105, dbMax: -25 });
    });
});

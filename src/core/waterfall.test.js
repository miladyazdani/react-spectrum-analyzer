import { describe, expect, it } from "vitest";
import { resolveColormap, timeStep, WATERFALL_COLORMAPS, WaterfallHistory } from "./waterfall.js";

const row = (history, age) => Array.from(history.rows.subarray(history.rowOffset(age), history.rowOffset(age) + history.cols));
const data = { centerFreq: 100, span: 100 };

describe("WaterfallHistory", () => {
    it("keeps the newest row at age 0", () => {
        const h = new WaterfallHistory(4);
        h.push([-10, -20], 1000);
        h.push([-30, -40], 2000);
        expect(row(h, 0)).toEqual([-30, -40]);
        expect(row(h, 1)).toEqual([-10, -20]);
        expect(h.timeAt(0)).toBe(2000);
        expect(h.timeAt(1)).toBe(1000);
    });

    it("drops the oldest row once full, and keeps counting", () => {
        const h = new WaterfallHistory(2);
        h.push([-1], 1);
        h.push([-2], 2);
        h.push([-3], 3);
        expect(h.length).toBe(2);
        expect(h.total).toBe(3);
        expect(row(h, 0)).toEqual([-3]);
        expect(row(h, 1)).toEqual([-2]);
    });

    it("keeps the strongest bin when it narrows a wide frame", () => {
        const h = new WaterfallHistory(2, 2);
        h.push([-90, -10, -80, -70], 0);
        expect(h.cols).toBe(2);
        expect(row(h, 0)).toEqual([-10, -70]);
    });

    it("restarts when the bin count changes", () => {
        const h = new WaterfallHistory(4);
        h.push([-1, -2], 0);
        const generation = h.generation;
        h.push([-3], 0);
        expect(h.length).toBe(1);
        expect(h.cols).toBe(1);
        expect(h.generation).toBeGreaterThan(generation);
    });

    it("clear frees the rows and invalidates renderers", () => {
        const h = new WaterfallHistory(4);
        h.push([-1], 0);
        const generation = h.generation;
        h.clear();
        expect(h.rows).toBe(null);
        expect(h.length).toBe(0);
        expect(h.total).toBe(0);
        expect(h.generation).toBe(generation + 1);
    });

    it("starts over when its size changes, and only then", () => {
        const h = new WaterfallHistory(4, 16);
        h.push([-1], 0);
        h.configure(4, 16);
        expect(h.length).toBe(1);
        h.configure(8, 16);
        expect(h.length).toBe(0);
        expect(h.capacity).toBe(8);
    });

    it("stores bad bins as the floor", () => {
        const h = new WaterfallHistory(1);
        h.push([NaN, Infinity, -10], 0);
        expect(row(h, 0)).toEqual([-300, -300, -10]);
    });

    it("samples the strongest level of a row within a frequency range", () => {
        const h = new WaterfallHistory(2);
        h.push([-90, -20, -80, -70, -60], 0);
        h.push([-50, -50, -50, -50, -50], 1);
        expect(h.sample(1, data, 50, 150)).toBe(-20);
        expect(h.sample(1, data, 90, 110)).toBe(-80);
        expect(h.sample(0, data, 50, 50)).toBe(-50);
    });

    it("has no sample for rows that don't exist", () => {
        const h = new WaterfallHistory(4);
        h.push([-1, -2], 0);
        expect(h.sample(1, data, 50, 150)).toBe(null);
        expect(h.sample(-1, data, 50, 150)).toBe(null);
    });
});

describe("helpers", () => {
    it("picks a time step no smaller than asked", () => {
        expect(timeStep(1)).toBe(100);
        expect(timeStep(1500)).toBe(2000);
        expect(timeStep(1e9)).toBe(1800000);
    });

    it("resolves named and custom colormaps", () => {
        const custom = [{ offset: 0, color: "black" }, { offset: 1, color: "white" }];
        expect(resolveColormap("viridis")).toBe(WATERFALL_COLORMAPS.viridis);
        expect(resolveColormap(custom)).toBe(custom);
        expect(resolveColormap("nope")).toBe(WATERFALL_COLORMAPS.jet);
        expect(resolveColormap([])).toBe(WATERFALL_COLORMAPS.jet);
    });
});

import { describe, expect, it } from "vitest";
import { FrameAverager, TraceProcessor } from "./averager.js";

const frame = (...values) => Float32Array.from(values);

describe("FrameAverager", () => {
    it("averages only what has arrived until the queue is full", () => {
        const avg = new FrameAverager(4);
        expect(Array.from(avg.push(frame(-10, -20)))).toEqual([-10, -20]);
        expect(Array.from(avg.push(frame(-30, -40)))).toEqual([-20, -30]);
        expect(avg.filled).toBe(2);
    });

    it("drops the oldest frame once the queue is full", () => {
        const avg = new FrameAverager(2);
        avg.push(frame(-10));
        avg.push(frame(-20));
        expect(avg.push(frame(-40))[0]).toBeCloseTo(-30);
        expect(avg.filled).toBe(2);
    });

    it("count 1 passes frames through", () => {
        const avg = new FrameAverager(1);
        avg.push(frame(-10));
        expect(avg.push(frame(-77))[0]).toBeCloseTo(-77);
    });

    it("power mode averages linear power, not decibels", () => {
        const avg = new FrameAverager(2, "power");
        avg.push(frame(0));
        // Mean of 1 and 0.1 is 0.55, about -2.6 dB; a dB mean would give -5.
        expect(avg.push(frame(-10))[0]).toBeCloseTo(10 * Math.log10(0.55), 4);
    });

    it("keeps the newest frames when the length shrinks", () => {
        const avg = new FrameAverager(3);
        avg.push(frame(-10));
        avg.push(frame(-20));
        avg.push(frame(-30));
        avg.push(frame(-60));
        avg.setCount(2);
        expect(avg.filled).toBe(2);
        expect(avg.output[0]).toBeCloseTo(-45);
        expect(avg.push(frame(-80))[0]).toBeCloseTo(-70);
    });

    it("keeps averaging after growing a wrapped queue", () => {
        const avg = new FrameAverager(2);
        avg.push(frame(-10));
        avg.push(frame(-20));
        avg.push(frame(-30));
        avg.setCount(3);
        expect(avg.filled).toBe(2);
        expect(avg.push(frame(-40))[0]).toBeCloseTo(-30);
        expect(avg.push(frame(-70))[0]).toBeCloseTo(-140 / 3, 4);
    });

    it("restarts when the bin count changes", () => {
        const avg = new FrameAverager(4);
        avg.push(frame(-10, -10));
        const out = avg.push(frame(-50, -50, -50));
        expect(out.length).toBe(3);
        expect(out[0]).toBeCloseTo(-50);
        expect(avg.filled).toBe(1);
    });

    it("a bad bin neither poisons the sum nor outlives its frame", () => {
        const avg = new FrameAverager(2);
        avg.push(frame(NaN, -10));
        expect(Number.isFinite(avg.output[0])).toBe(true);
        avg.push(frame(-20, -20));
        expect(avg.push(frame(-40, -40))[0]).toBeCloseTo(-30);
    });

    it("doesn't drift over a long run in power mode", () => {
        const avg = new FrameAverager(4, "power");
        for (let i = 0; i < 10000; i++) avg.push(frame(i % 50 === 0 ? 0 : -120));
        for (let i = 0; i < 4; i++) avg.push(frame(-120));
        expect(avg.output[0]).toBeCloseTo(-120, 2);
    });

    it("accepts a plain array", () => {
        const avg = new FrameAverager(2);
        avg.push([-10, -20]);
        expect(avg.push([-20, -30])[1]).toBeCloseTo(-25);
    });
});

describe("TraceProcessor", () => {
    const configure = (t, o = {}) => t.configure({ average: 1, averageMode: "db", maxHold: false, minHold: false, ...o });

    it("holds extremes of the raw frames, not of the average", () => {
        const t = new TraceProcessor();
        configure(t, { average: 4, maxHold: true, minHold: true });
        t.push(frame(-10));
        t.push(frame(-50));
        expect(t.maxHold[0]).toBeCloseTo(-10);
        expect(t.minHold[0]).toBeCloseTo(-50);
        expect(t.current[0]).toBeCloseTo(-30);
    });

    it("drops a hold when it is switched off", () => {
        const t = new TraceProcessor();
        configure(t, { maxHold: true });
        t.push(frame(-10));
        configure(t);
        expect(t.maxHold).toBe(null);
    });

    it("starts over on a new bin count", () => {
        const t = new TraceProcessor();
        configure(t, { maxHold: true });
        t.push(frame(-10, -10));
        t.push(frame(-50));
        expect(t.maxHold.length).toBe(1);
        expect(t.maxHold[0]).toBeCloseTo(-50);
    });
});

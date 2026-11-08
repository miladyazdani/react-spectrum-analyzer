import { describe, expect, it } from "vitest";
import { computeLayout, hitTest, LABEL_ROW_HEIGHT } from "./layout.js";

const view = { centerFreq: 100e6, span: 20e6, dbMin: -100, dbMax: 0 };
const base = { width: 800, height: 400, view, showLabels: true };

const label = (id, freq, text = "Label") => ({ id, freq, text });

describe("scales", () => {
    const scene = computeLayout(base);

    it("are inverse of each other", () => {
        expect(scene.xToFreq(scene.freqToX(97e6))).toBeCloseTo(97e6, 0);
        expect(scene.yToDb(scene.dbToY(-42))).toBeCloseTo(-42);
    });

    it("map the view onto the plot rectangle", () => {
        const { plot } = scene;
        expect(scene.freqToX(90e6)).toBe(plot.x);
        expect(scene.freqToX(110e6)).toBe(plot.x + plot.w);
        expect(scene.dbToY(0)).toBe(plot.y);
        expect(scene.dbToY(-100)).toBe(plot.y + plot.h);
    });

    it("is invalid when the parent has no room", () => {
        expect(computeLayout({ ...base, width: 0, height: 0 }).valid).toBe(false);
    });

    it("honors plot margins for lining up with other charts", () => {
        const { plot } = computeLayout({ ...base, margin: { left: 58, right: 35 } });
        expect(plot.x).toBe(58);
        expect(plot.w).toBe(800 - 58 - 35);
    });
});

describe("labels", () => {
    it("stack into rows instead of overlapping", () => {
        const scene = computeLayout({
            ...base,
            labels: [label("a", 100e6), label("b", 100.01e6), label("c", 100.02e6)],
        });
        const rows = scene.labelBoxes.map((b) => b.row).sort();
        expect(rows).toEqual([0, 1, 2]);
    });

    it("share a row when they are far apart", () => {
        const scene = computeLayout({ ...base, labels: [label("a", 92e6), label("b", 108e6)] });
        expect(scene.labelBoxes.map((b) => b.row)).toEqual([0, 0]);
    });

    it("grow the band above the plot with the rows", () => {
        const one = computeLayout({ ...base, labels: [label("a", 100e6)] });
        const two = computeLayout({ ...base, labels: [label("a", 100e6), label("b", 100.01e6)] });
        expect(two.plot.y - one.plot.y).toBe(LABEL_ROW_HEIGHT);
    });

    it("never exceed maxLabelRows", () => {
        const labels = Array.from({ length: 8 }, (_, i) => label(String(i), 100e6 + i));
        const scene = computeLayout({ ...base, labels, maxLabelRows: 2 });
        expect(Math.max(...scene.labelBoxes.map((b) => b.row))).toBe(1);
    });

    it("hide labels outside the view", () => {
        const scene = computeLayout({ ...base, labels: [label("a", 50e6), label("b", 100e6)] });
        expect(scene.labelBoxes.map((b) => b.label.id)).toEqual(["b"]);
    });

    it("keep chips inside the plot but the line on its frequency", () => {
        const scene = computeLayout({ ...base, labels: [label("edge", 90e6, "A long label text")] });
        const [box] = scene.labelBoxes;
        expect(box.x).toBe(scene.plot.x);
        expect(box.lineX).toBe(scene.plot.x);
    });

    it("truncate long text", () => {
        const scene = computeLayout({ ...base, labels: [label("a", 100e6, "x".repeat(200))] });
        expect(scene.labelBoxes[0].text.endsWith("…")).toBe(true);
        expect(scene.labelBoxes[0].width).toBeLessThanOrEqual(154);
    });

    it("reserve no band when the feature is off", () => {
        const on = computeLayout(base);
        const off = computeLayout({ ...base, showLabels: false, labels: [label("a", 100e6)] });
        expect(off.plot.y).toBeLessThan(on.plot.y);
        expect(off.labelBoxes).toEqual([]);
    });
});

describe("waterfall", () => {
    const scene = computeLayout({ ...base, waterfallRatio: 0.5 });
    const { plot, waterfall } = scene;

    it("hangs below the frequency axis, in the same columns as the plot", () => {
        expect(waterfall.x).toBe(plot.x);
        expect(waterfall.w).toBe(plot.w);
        expect(waterfall.y).toBeGreaterThan(plot.y + plot.h);
        expect(waterfall.y + waterfall.h).toBeLessThanOrEqual(400);
    });

    it("shares the height by the ratio", () => {
        expect(Math.abs(plot.h - waterfall.h)).toBeLessThanOrEqual(1);
        const small = computeLayout({ ...base, waterfallRatio: 0.25 });
        expect(small.waterfall.h).toBeLessThan(small.plot.h);
    });

    it("gives way when there is no room for both", () => {
        const tiny = computeLayout({ ...base, height: 120, waterfallRatio: 0.5 });
        expect(tiny.waterfall).toBe(null);
        expect(tiny.plot.h).toBeGreaterThan(0);
    });

    it("is absent by default", () => {
        expect(computeLayout(base).waterfall).toBe(null);
    });

    it("has its own hit zone, separate from the axis between the two", () => {
        expect(hitTest(300, waterfall.y + 10, scene).kind).toBe("waterfall");
        expect(hitTest(300, plot.y + plot.h + 10, scene).kind).toBe("x-axis");
    });

    it("lets the ruler be grabbed from inside it", () => {
        const ruler = { centerFreq: 100e6, bandwidth: 4e6 };
        const y = waterfall.y + 10;
        expect(hitTest(scene.freqToX(98e6), y, scene, { ruler }).kind).toBe("ruler-start");
        expect(hitTest(scene.freqToX(100e6), y, scene, { ruler }).kind).toBe("ruler-body");
    });

    it("doesn't catch the level line", () => {
        const y = waterfall.y + 10;
        expect(hitTest(300, y, scene, { level: -100 }).kind).toBe("waterfall");
    });
});

describe("hitTest", () => {
    const scene = computeLayout({ ...base, labels: [label("a", 100e6)] });
    const ruler = { centerFreq: 100e6, bandwidth: 4e6 };
    const midY = scene.plot.y + scene.plot.h / 2;
    const x98 = scene.freqToX(98e6);
    const x102 = scene.freqToX(102e6);

    it("finds a label chip", () => {
        const [box] = scene.labelBoxes;
        expect(hitTest(box.x + 2, box.y + 2, scene)).toEqual({ kind: "label", id: "a" });
    });

    it("finds the level line within the slack", () => {
        const y = scene.dbToY(-50);
        expect(hitTest(300, y + 5, scene, { level: -50 }).kind).toBe("level");
        expect(hitTest(300, y + 9, scene, { level: -50 }).kind).toBe("plot");
    });

    it("widens the slack for touch", () => {
        const y = scene.dbToY(-50);
        expect(hitTest(300, y + 12, scene, { level: -50, slack: 14 }).kind).toBe("level");
    });

    it("level line stays grabbable when scrolled out of the view", () => {
        const y = scene.plot.y + scene.plot.h;
        expect(hitTest(300, y - 2, scene, { level: -500 }).kind).toBe("level");
    });

    it("tells ruler edges from its body", () => {
        expect(hitTest(x98 + 3, midY, scene, { ruler }).kind).toBe("ruler-start");
        expect(hitTest(x102 - 3, midY, scene, { ruler }).kind).toBe("ruler-stop");
        expect(hitTest((x98 + x102) / 2, midY, scene, { ruler }).kind).toBe("ruler-body");
        expect(hitTest(x102 + 30, midY, scene, { ruler }).kind).toBe("plot");
    });

    it("prefers the level line over the ruler", () => {
        expect(hitTest(x98, scene.dbToY(-50), scene, { ruler, level: -50 }).kind).toBe("level");
    });

    it("finds the axis gutters", () => {
        expect(hitTest(10, midY, scene).kind).toBe("y-axis");
        expect(hitTest(300, scene.plot.y + scene.plot.h + 10, scene).kind).toBe("x-axis");
    });

    it("returns null outside everything", () => {
        expect(hitTest(2, 2, scene)).toBe(null);
    });
});

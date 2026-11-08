// Lowest level kept in a frame. Also stands in for NaN/Infinity so one bad bin
// cannot poison the running sum of the averaging queue.
export const DB_FLOOR = -300;
const POWER_FLOOR = 1e-30;

export const normalizeCount = (count) => Math.max(1, Math.floor(Number(count)) || 1);

export const sanitizeDb = (value) => (Number.isFinite(value) ? Math.max(value, DB_FLOOR) : DB_FLOOR);

/**
 * FIFO queue of the last `count` frames with a running per-bin sum, so a push
 * costs O(bins) no matter how long the queue is.
 *
 * mode "db":    arithmetic mean of the dB values (log average).
 * mode "power": mean of the linear power, converted back to dB.
 */
export class FrameAverager {
    constructor(count = 1, mode = "db") {
        this.count = normalizeCount(count);
        this.mode = mode;
        this.reset();
    }

    reset() {
        this.queue = [];
        this.head = 0;
        this.sum = null;
        this.output = null;
        this.sinceRebuild = 0;
    }

    get filled() {
        return this.queue.length;
    }

    setMode(mode) {
        if (mode === this.mode) return;
        this.mode = mode;
        this.reset();
    }

    // Keeps the newest frames, so changing the length never blanks the display.
    setCount(count) {
        const next = normalizeCount(count);
        if (next === this.count) return;
        const ordered = [...this.queue.slice(this.head), ...this.queue.slice(0, this.head)];
        this.queue = ordered.slice(-next);
        this.head = 0;
        this.count = next;
        if (this.sum) {
            this.rebuild();
            this.computeOutput();
        }
    }

    push(frame) {
        const n = frame.length;
        if (!this.sum || this.sum.length !== n) {
            this.reset();
            this.sum = new Float64Array(n);
            this.output = new Float32Array(n);
        }

        let slot;
        if (this.queue.length === this.count) {
            slot = this.queue[this.head];
            this.head = (this.head + 1) % this.count;
            for (let i = 0; i < n; i++) this.sum[i] -= slot[i];
        } else {
            slot = new Float32Array(n);
            this.queue.push(slot);
        }

        if (this.mode === "power") {
            for (let i = 0; i < n; i++) {
                const linear = Math.pow(10, sanitizeDb(frame[i]) / 10);
                slot[i] = linear;
                this.sum[i] += linear;
            }
        } else {
            for (let i = 0; i < n; i++) {
                const db = sanitizeDb(frame[i]);
                slot[i] = db;
                this.sum[i] += db;
            }
        }

        // Subtracting floats drifts; a rebuild once per queue length stays O(bins) amortized.
        if (++this.sinceRebuild >= this.count) this.rebuild();

        this.computeOutput();
        return this.output;
    }

    rebuild() {
        this.sum.fill(0);
        for (const frame of this.queue) {
            for (let i = 0; i < frame.length; i++) this.sum[i] += frame[i];
        }
        this.sinceRebuild = 0;
    }

    computeOutput() {
        const filled = this.queue.length;
        if (!filled) return;
        if (this.mode === "power") {
            for (let i = 0; i < this.sum.length; i++) {
                this.output[i] = 10 * Math.log10(Math.max(this.sum[i] / filled, POWER_FLOOR));
            }
        } else {
            for (let i = 0; i < this.sum.length; i++) this.output[i] = this.sum[i] / filled;
        }
    }
}

/** Owns everything derived from incoming frames: the average and the hold traces. */
export class TraceProcessor {
    constructor() {
        this.averager = new FrameAverager();
        this.current = null;
        this.maxHold = null;
        this.minHold = null;
        this.maxHoldOn = false;
        this.minHoldOn = false;
    }

    configure({ average, averageMode, maxHold, minHold }) {
        this.averager.setMode(averageMode);
        this.averager.setCount(average);
        this.maxHoldOn = Boolean(maxHold);
        this.minHoldOn = Boolean(minHold);
        if (!this.maxHoldOn) this.maxHold = null;
        if (!this.minHoldOn) this.minHold = null;
    }

    push(bins) {
        const n = bins.length;
        if (!n) return;
        if (this.current && this.current.length !== n) this.clear();
        this.current = this.averager.push(bins);

        // Holds follow the raw frames: an average would hide the extremes they exist to catch.
        if (this.maxHoldOn) {
            if (!this.maxHold) this.maxHold = new Float32Array(n).fill(-Infinity);
            for (let i = 0; i < n; i++) {
                const v = sanitizeDb(bins[i]);
                if (v > this.maxHold[i]) this.maxHold[i] = v;
            }
        }
        if (this.minHoldOn) {
            if (!this.minHold) this.minHold = new Float32Array(n).fill(Infinity);
            for (let i = 0; i < n; i++) {
                const v = sanitizeDb(bins[i]);
                if (v < this.minHold[i]) this.minHold[i] = v;
            }
        }
    }

    clear() {
        this.averager.reset();
        this.current = null;
        this.maxHold = null;
        this.minHold = null;
    }
}

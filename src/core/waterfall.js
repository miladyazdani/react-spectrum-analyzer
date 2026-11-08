import { sanitizeDb } from "./averager.js";

/** Stops are { offset, color }, offset 0 being the weakest level. */
export const WATERFALL_COLORMAPS = {
    jet: [
        { offset: 0, color: "#000080" },
        { offset: 0.125, color: "#0000ff" },
        { offset: 0.375, color: "#00ffff" },
        { offset: 0.625, color: "#ffff00" },
        { offset: 0.875, color: "#ff0000" },
        { offset: 1, color: "#800000" },
    ],
    viridis: [
        { offset: 0, color: "#440154" },
        { offset: 0.25, color: "#3b528b" },
        { offset: 0.5, color: "#21918c" },
        { offset: 0.75, color: "#5ec962" },
        { offset: 1, color: "#fde725" },
    ],
    grayscale: [
        { offset: 0, color: "#000000" },
        { offset: 1, color: "#ffffff" },
    ],
};

export const resolveColormap = (colors) => (
    Array.isArray(colors) && colors.length ? colors : (WATERFALL_COLORMAPS[colors] ?? WATERFALL_COLORMAPS.jet)
);

/**
 * Ring buffer of past frames. Levels stay in dB rather than colors, so zooming
 * or changing the level range can repaint the whole history.
 */
export class WaterfallHistory {
    constructor(capacity = 1024, maxCols = 4096) {
        this.capacity = Math.max(1, Math.floor(capacity));
        this.maxCols = Math.max(1, Math.floor(maxCols));
        this.generation = 0;
        this.clear();
    }

    /** Frees the rows. `generation` tells a renderer its picture is out of date. */
    clear() {
        this.rows = null;
        this.times = null;
        this.cols = 0;
        this.bins = 0;
        this.head = 0;
        this.length = 0;
        this.total = 0;
        this.generation++;
    }

    configure(capacity, maxCols) {
        const nextCapacity = Math.max(1, Math.floor(capacity));
        const nextCols = Math.max(1, Math.floor(maxCols));
        if (nextCapacity === this.capacity && nextCols === this.maxCols) return;
        this.capacity = nextCapacity;
        this.maxCols = nextCols;
        this.clear();
    }

    push(bins, time) {
        const n = bins.length;
        if (!n) return;
        if (n !== this.bins) {
            this.clear();
            this.bins = n;
            this.cols = Math.min(n, this.maxCols);
        }
        this.rows ??= new Float32Array(this.cols * this.capacity);
        this.times ??= new Float64Array(this.capacity);

        this.head = (this.head + this.capacity - 1) % this.capacity;
        const offset = this.head * this.cols;

        if (this.cols === n) {
            for (let i = 0; i < n; i++) this.rows[offset + i] = sanitizeDb(bins[i]);
        } else {
            // The strongest bin of each column, so a narrow carrier stays visible.
            const binsPerCol = n / this.cols;
            for (let c = 0; c < this.cols; c++) {
                const start = Math.floor(c * binsPerCol);
                const end = Math.min(n, Math.floor((c + 1) * binsPerCol));
                let max = sanitizeDb(bins[start]);
                for (let i = start + 1; i < end; i++) {
                    const v = sanitizeDb(bins[i]);
                    if (v > max) max = v;
                }
                this.rows[offset + c] = max;
            }
        }

        this.times[this.head] = time;
        this.length = Math.min(this.length + 1, this.capacity);
        this.total++;
    }

    /** Offset of a row in `rows`; age 0 is the newest. */
    rowOffset(age) {
        return ((this.head + age) % this.capacity) * this.cols;
    }

    timeAt(age) {
        return this.times[(this.head + age) % this.capacity];
    }

    /** Strongest level of a row within [f0, f1], or null when there is no such row. */
    sample(age, data, f0, f1) {
        if (age < 0 || age >= this.length) return null;
        const start = data.centerFreq - data.span / 2;
        const toCol = (f) => Math.round(((f - start) / data.span) * (this.cols - 1));
        const lo = Math.max(0, Math.min(this.cols - 1, toCol(Math.min(f0, f1))));
        const hi = Math.max(0, Math.min(this.cols - 1, toCol(Math.max(f0, f1))));
        const offset = this.rowOffset(age);
        let max = this.rows[offset + lo];
        for (let c = lo + 1; c <= hi; c++) {
            if (this.rows[offset + c] > max) max = this.rows[offset + c];
        }
        return max;
    }
}

/** Largest "nice" time step that keeps time labels at least `minMs` apart. */
export function timeStep(minMs) {
    const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000, 120000, 300000, 600000];
    return steps.find((s) => s >= minMs) ?? 1800000;
}

/**
 * Keeps one bitmap per row in a ring canvas: a new frame paints a single row and
 * moves the head, so nothing has to scroll. Bitmap columns are CSS pixels, which
 * keeps Retina displays cheap.
 */
export class WaterfallRenderer {
    constructor() {
        this.canvas = null;
        this.head = 0;
        this.key = "";
        this.painted = 0;
        this.lut = null;
        this.lutKey = "";
    }

    setColors(stops) {
        const key = JSON.stringify(stops);
        if (key === this.lutKey) return;
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const gradient = ctx.createLinearGradient(0, 0, 256, 0);
        for (const stop of stops) gradient.addColorStop(stop.offset, stop.color);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 1);
        // Same byte order as ImageData, whatever the platform's endianness.
        this.lut = new Uint32Array(ctx.getImageData(0, 0, 256, 1).data.buffer.slice(0));
        this.lutKey = key;
        this.key = "";
    }

    /** Which history columns each bitmap column shows, for the current view. */
    buildColumnMap(width, view, data, cols) {
        const map = new Int32Array(width * 2);
        const start = view.centerFreq - view.span / 2;
        const dataStart = data.centerFreq - data.span / 2;
        const toCol = (f) => ((f - dataStart) / data.span) * (cols - 1);
        for (let x = 0; x < width; x++) {
            const c0 = toCol(start + (x / width) * view.span);
            const c1 = toCol(start + ((x + 1) / width) * view.span);
            if (c1 < -0.5 || c0 > cols - 0.5) {
                map[x * 2] = -1;
                continue;
            }
            const lo = Math.max(0, Math.min(cols - 1, Math.round(c0)));
            map[x * 2] = lo;
            map[x * 2 + 1] = Math.max(lo, Math.min(cols - 1, Math.round(c1) - 1));
        }
        return map;
    }

    paintRow(pixels, pixelOffset, rows, rowOffset) {
        const { map, width, lut, dbMin, scale } = this;
        for (let x = 0; x < width; x++) {
            const lo = map[x * 2];
            if (lo < 0) {
                pixels[pixelOffset + x] = 0;
                continue;
            }
            const hi = map[x * 2 + 1];
            let max = rows[rowOffset + lo];
            for (let c = lo + 1; c <= hi; c++) {
                const v = rows[rowOffset + c];
                if (v > max) max = v;
            }
            const index = (max - dbMin) * scale;
            pixels[pixelOffset + x] = lut[index <= 0 ? 0 : index >= 255 ? 255 : index | 0];
        }
    }

    /** Brings the ring canvas up to date with the history. */
    sync(history, rect, view, data, levels, rowHeight) {
        const width = Math.max(1, Math.round(rect.w));
        const height = Math.max(1, Math.ceil(rect.h / rowHeight));
        const key = [
            width, height, history.generation, history.cols, this.lutKey, view.centerFreq, view.span,
            levels.dbMin, levels.dbMax, data.centerFreq, data.span,
        ].join("|");

        const fresh = history.total - this.painted;
        if (key === this.key && fresh === 0) return;

        this.canvas ??= document.createElement("canvas");
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        const ctx = this.canvas.getContext("2d");

        this.width = width;
        this.dbMin = levels.dbMin;
        this.scale = 255 / (levels.dbMax - levels.dbMin || 1);

        if (key !== this.key || fresh >= height) {
            this.key = key;
            this.head = 0;
            ctx.clearRect(0, 0, width, height);
            if (history.length) {
                this.map = this.buildColumnMap(width, view, data, history.cols);
                const rows = Math.min(history.length, height);
                const image = ctx.createImageData(width, rows);
                const pixels = new Uint32Array(image.data.buffer);
                for (let age = 0; age < rows; age++) {
                    this.paintRow(pixels, age * width, history.rows, history.rowOffset(age));
                }
                ctx.putImageData(image, 0, 0);
            }
        } else {
            if (!this.rowImage || this.rowImage.width !== width) {
                this.rowImage = ctx.createImageData(width, 1);
                this.rowPixels = new Uint32Array(this.rowImage.data.buffer);
            }
            for (let age = fresh - 1; age >= 0; age--) {
                this.head = (this.head + height - 1) % height;
                this.paintRow(this.rowPixels, 0, history.rows, history.rowOffset(age));
                ctx.putImageData(this.rowImage, 0, this.head);
            }
        }
        this.painted = history.total;
        this.rows = height;
    }

    /** Newest row on top. The two slices are the ring cut at its head. */
    draw(ctx, rect) {
        if (!this.canvas || !this.rows) return;
        const { head, rows, canvas } = this;
        const rowH = rect.h / rows;
        const smoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        const upper = rows - head;
        ctx.drawImage(canvas, 0, head, canvas.width, upper, rect.x, rect.y, rect.w, upper * rowH);
        if (head > 0) {
            ctx.drawImage(canvas, 0, 0, canvas.width, head, rect.x, rect.y + upper * rowH, rect.w, head * rowH);
        }
        ctx.imageSmoothingEnabled = smoothing;
    }
}

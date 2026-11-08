import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import SpectrumAnalyzer, { DEFAULT_FEATURES } from "../src/index.js";

const BINS = 4096;
const CENTER = 98e6;
const SPAN = 20e6;

const CARRIERS = [
    { freq: 91.5e6, width: 0.1e6, power: -38 },
    { freq: 94.3e6, width: 0.1e6, power: -52 },
    { freq: 98.1e6, width: 0.12e6, power: -27 },
    { freq: 101.2e6, width: 0.4e6, power: -60 },
    { freq: 104.8e6, width: 0.08e6, power: -44 },
];

const gaussianNoise = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

// Noise floor plus Gaussian-shaped carriers, with one that fades in and out.
function makeFrame(buffer, t) {
    const start = CENTER - SPAN / 2;
    for (let i = 0; i < BINS; i++) {
        const f = start + (i / (BINS - 1)) * SPAN;
        let linear = Math.pow(10, -9.5);
        for (const c of CARRIERS) {
            const fade = c.freq === 94.3e6 ? 0.5 + 0.5 * Math.sin(t / 900) : 1;
            const d = (f - c.freq) / c.width;
            linear += fade * Math.pow(10, c.power / 10) * Math.exp(-d * d);
        }
        buffer[i] = 10 * Math.log10(linear) + gaussianNoise() * 2.5;
    }
}

const THEMES = ["auto", "light", "dark"];
const SWITCHES = Object.keys(DEFAULT_FEATURES);
const WIDTHS = ["100%", "70%", "420px"];

const INITIAL_LABELS = [
    { id: "fm-1", freq: 98.1e6, text: "Broadcast FM", color: "#eda100" },
    { id: "fm-2", freq: 91.5e6, text: "Radio 2", color: "#1baf7a" },
];

function Demo() {
    const chartRef = useRef(null);
    const dataRef = useRef(null);
    const [theme, setTheme] = useState("dark");
    const [width, setWidth] = useState(WIDTHS[0]);
    const [gradient, setGradient] = useState(false);
    const [features, setFeatures] = useState({});
    const [ruler, setRuler] = useState(null);
    const [level, setLevel] = useState(-70);
    const [labels, setLabels] = useState(INITIAL_LABELS);

    useEffect(() => {
        const buffer = new Float32Array(BINS);
        let counter = 0;
        const timer = setInterval(() => {
            makeFrame(buffer, performance.now());
            dataRef.current = { spectrum: buffer, counter: ++counter };
        }, 33);
        return () => clearInterval(timer);
    }, []);

    // For playing with the handle from the console, e.g. spectrum.current.fitLevels().
    useEffect(() => {
        window.spectrum = chartRef;
    }, []);

    const dark = theme === "dark";

    return (
        <div style={{
            minHeight: "100vh",
            margin: "-8px",
            padding: 16,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            background: dark ? "#0d0d0d" : "#f9f9f7",
            color: dark ? "#f0efec" : "#0b0b0b",
            fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
            fontSize: 13,
        }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <label>
                    Theme{" "}
                    <select data-testid="theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
                        {THEMES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                </label>
                <label>
                    Parent width{" "}
                    <select data-testid="width" value={width} onChange={(e) => setWidth(e.target.value)}>
                        {WIDTHS.map((w) => <option key={w}>{w}</option>)}
                    </select>
                </label>
                <label>
                    <input data-testid="gradient" type="checkbox" checked={gradient} onChange={(e) => setGradient(e.target.checked)} />
                    {" "}Level gradient
                </label>
                <span style={{ opacity: 0.8 }}>
                    Level: {level ?? "off"} dB · Ruler: {ruler ? `${(ruler.bandwidth / 1e6).toFixed(3)} MHz @ ${(ruler.centerFreq / 1e6).toFixed(3)} MHz` : "off"} · Labels: {labels.length}
                </span>
            </div>

            <details>
                <summary>Features</summary>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", paddingTop: 6 }}>
                    {SWITCHES.map((key) => (
                        <label key={key}>
                            <input
                                type="checkbox"
                                data-testid={`feature-${key}`}
                                checked={features[key] ?? DEFAULT_FEATURES[key]}
                                onChange={(e) => setFeatures((f) => ({ ...f, [key]: e.target.checked }))}
                            />
                            {" "}{key}
                        </label>
                    ))}
                </div>
            </details>

            <div data-testid="parent" style={{ width, flex: "1 1 0", minHeight: 420, border: "1px solid rgba(128,128,128,0.3)", borderRadius: 6, overflow: "hidden", transition: "width 0.2s" }}>
                <SpectrumAnalyzer
                    ref={chartRef}
                    dataRef={dataRef}
                    centerFreq={CENTER}
                    span={SPAN}
                    dbMin={-110}
                    dbMax={-10}
                    theme={theme}
                    features={features}
                    defaultAverage={8}
                    defaultWaterfall
                    level={level}
                    onLevelChange={setLevel}
                    ruler={ruler}
                    onRulerChange={setRuler}
                    labels={labels}
                    onLabelsChange={setLabels}
                    onPlotAreaChange={(area) => { window.spectrumPlotArea = area; }}
                    colorStops={gradient ? [
                        { offset: 0, color: "#3987e5" },
                        { offset: 0.5, color: "#1baf7a" },
                        { offset: 1, color: "#e34948" },
                    ] : undefined}
                    contextMenuItems={[{ label: "Tune receiver here", onClick: ({ freq }) => console.log("tune", freq) }]}
                />
            </div>
        </div>
    );
}

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <Demo />
    </StrictMode>,
);

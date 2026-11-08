import { useEffect, useState } from "react";

const icon = (children) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
);

const ICONS = {
    zoomIn: icon(<><circle cx="7" cy="7" r="4.5" /><path d="M14 14l-3.8-3.8M7 5v4M5 7h4" /></>),
    zoomOut: icon(<><circle cx="7" cy="7" r="4.5" /><path d="M14 14l-3.8-3.8M5 7h4" /></>),
    reset: icon(<path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />),
    fit: icon(<path d="M8 1.5v13M5.5 4L8 1.5 10.5 4M5.5 12L8 14.5 10.5 12M2 8h3M11 8h3" />),
    peak: icon(<path d="M1.5 13.5h3L8 3l3.5 10.5h3" />),
    level: icon(<><path d="M1.5 8h13" /><path d="M5 4.5L8 2l3 2.5M5 11.5L8 14l3-2.5" /></>),
    ruler: icon(<><path d="M3 2.5v11M13 2.5v11" /><path d="M3 8h10M5.5 6L3.5 8l2 2M10.5 6l2 2-2 2" /></>),
    label: icon(<><path d="M8 7v7.5" /><rect x="3" y="1.5" width="10" height="5.5" rx="1.5" /></>),
    waterfall: icon(<><rect x="2" y="2" width="12" height="12" rx="1.5" /><path d="M2 6h12M2 10h12M6 2v12M10 2v12" /></>),
    pause: icon(<path d="M5.5 3v10M10.5 3v10" />),
    play: icon(<path d="M5 3l8 5-8 5z" />),
    clear: icon(<path d="M3 8a5 5 0 1 0 1.5-3.5L3 6M3 2.5V6h3.5" />),
};

function ToolButton({ name, title, text, pressed, onClick, showText }) {
    return (
        <button
            type="button"
            className="rsa-btn"
            title={title}
            aria-label={title}
            aria-pressed={pressed === undefined ? undefined : pressed}
            onClick={onClick}
        >
            {ICONS[name]}
            {showText && text ? <span>{text}</span> : null}
        </button>
    );
}

function AverageField({ value, max, label, title, onCommit }) {
    const [draft, setDraft] = useState(String(value));

    useEffect(() => setDraft(String(value)), [value]);

    const commit = () => {
        const parsed = Math.floor(Number(draft));
        const next = Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, max) : value;
        setDraft(String(next));
        if (next !== value) onCommit(next);
    };

    return (
        <label className="rsa-field" title={title}>
            <span>{label}</span>
            <input
                type="number"
                min={1}
                max={max}
                step={1}
                value={draft}
                aria-label={title}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    e.stopPropagation();
                }}
            />
        </label>
    );
}

export default function Toolbar({ api, messages: m, position, compact, extra }) {
    const { features: f } = api;
    const showText = !compact;
    // The buttons zoom too, so `zoom: false` takes them along with the gestures.
    const zoomIn = f.zoom && f.zoomIn;
    const zoomOut = f.zoom && f.zoomOut;
    const colorPicker = f.colorPicker && !api.colorStops;

    const anyTool = zoomIn || zoomOut || f.resetZoom || f.fitLevels
        || f.average || f.maxHold || f.minHold || f.clearTraces
        || f.peak || f.level || f.ruler || f.labels || f.waterfall
        || colorPicker || f.pause || extra;
    if (!anyTool) return null;

    return (
        <div className="rsa-toolbar" role="toolbar" aria-label={m.chartName} data-position={position} data-compact={compact}>
            {(zoomIn || zoomOut || f.resetZoom || f.fitLevels) && (
                <div className="rsa-group">
                    {zoomIn && <ToolButton name="zoomIn" title={m.zoomIn} onClick={() => api.zoomBy(1)} />}
                    {zoomOut && <ToolButton name="zoomOut" title={m.zoomOut} onClick={() => api.zoomBy(-1)} />}
                    {f.resetZoom && <ToolButton name="reset" title={m.resetZoom} onClick={api.resetView} />}
                    {f.fitLevels && <ToolButton name="fit" title={m.fitLevels} onClick={api.fitLevels} />}
                </div>
            )}

            {(f.average || f.maxHold || f.minHold || f.clearTraces) && (
                <div className="rsa-group">
                    {f.average && (
                        <AverageField
                            value={api.average}
                            max={api.averageMax}
                            label={m.average}
                            title={m.averageTitle}
                            onCommit={api.setAverage}
                        />
                    )}
                    {f.maxHold && (
                        <button type="button" className="rsa-btn" title={m.maxHold} aria-pressed={api.maxHold} onClick={() => api.setMaxHold(!api.maxHold)}>
                            {compact ? m.maxHoldShort : m.maxHold}
                        </button>
                    )}
                    {f.minHold && (
                        <button type="button" className="rsa-btn" title={m.minHold} aria-pressed={api.minHold} onClick={() => api.setMinHold(!api.minHold)}>
                            {compact ? m.minHoldShort : m.minHold}
                        </button>
                    )}
                    {f.clearTraces && <ToolButton name="clear" title={m.clear} onClick={api.clearTraces} />}
                </div>
            )}

            {(f.peak || f.level || f.ruler || f.labels || f.waterfall) && (
                <div className="rsa-group">
                    {f.peak && <ToolButton name="peak" title={m.peak} text={m.peak} showText={showText} pressed={api.peak} onClick={() => api.setPeak(!api.peak)} />}
                    {f.level && <ToolButton name="level" title={m.level} text={m.level} showText={showText} pressed={api.level != null} onClick={api.toggleLevel} />}
                    {f.ruler && <ToolButton name="ruler" title={m.ruler} text={m.ruler} showText={showText} pressed={api.ruler != null} onClick={api.toggleRuler} />}
                    {f.labels && <ToolButton name="label" title={m.placeLabelHint} text={m.label} showText={showText} pressed={api.tool === "label"} onClick={() => api.setTool(api.tool === "label" ? null : "label")} />}
                    {f.waterfall && <ToolButton name="waterfall" title={m.waterfall} text={m.waterfall} showText={showText} pressed={api.waterfall} onClick={() => api.setWaterfall(!api.waterfall)} />}
                </div>
            )}

            {(colorPicker || f.pause) && (
                <div className="rsa-group">
                    {colorPicker && (
                        <input
                            type="color"
                            className="rsa-swatch"
                            title={m.color}
                            aria-label={m.color}
                            value={api.colorHex}
                            onChange={(e) => api.setColor(e.target.value)}
                        />
                    )}
                    {f.pause && <ToolButton name={api.paused ? "play" : "pause"} title={api.paused ? m.resume : m.pause} pressed={api.paused} onClick={() => api.setPaused(!api.paused)} />}
                </div>
            )}

            {extra ? <div className="rsa-group">{extra}</div> : null}
        </div>
    );
}

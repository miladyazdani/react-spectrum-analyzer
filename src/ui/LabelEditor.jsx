import { useEffect, useRef, useState } from "react";

// Text field + color swatch, plus the delete button once the label exists.
const WIDTH_NEW = 170;
const WIDTH_EXISTING = 200;

/** Inline form for one label. An empty text removes the label (or drops a new one). */
export default function LabelEditor({ editor, box, scene, messages: m, onCommit, onDelete, onCancel, toHex }) {
    const formRef = useRef(null);
    const inputRef = useRef(null);
    const [text, setText] = useState(editor.text);
    const [color, setColor] = useState(editor.color);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const commit = () => onCommit(text.trim(), color);

    const commitRef = useRef(commit);
    commitRef.current = commit;

    // Not onBlur alone: Safari doesn't focus a clicked color input, so a blur
    // would close the form before the picker opens.
    useEffect(() => {
        const onDown = (e) => {
            if (!formRef.current?.contains(e.target)) commitRef.current();
        };
        document.addEventListener("pointerdown", onDown, true);
        return () => document.removeEventListener("pointerdown", onDown, true);
    }, []);

    const width = editor.id != null ? WIDTH_EXISTING : WIDTH_NEW;
    const lineX = box ? box.lineX : scene.freqToX(editor.freq);
    const left = Math.max(2, Math.min(lineX - width / 2, scene.width - width - 2));
    const top = Math.max(2, (box ? box.y + box.height : scene.plot.y) + 2);

    return (
        <form
            ref={formRef}
            className="rsa-editor"
            style={{ left, top, width }}
            onSubmit={(e) => {
                e.preventDefault();
                commit();
            }}
            onBlur={(e) => {
                // relatedTarget is set when focus moves on by keyboard.
                if (e.relatedTarget && !formRef.current?.contains(e.relatedTarget)) commit();
            }}
            onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") onCancel();
            }}
        >
            <input
                ref={inputRef}
                type="text"
                value={text}
                dir="auto"
                placeholder={m.labelPlaceholder}
                aria-label={m.labelPlaceholder}
                onChange={(e) => setText(e.target.value)}
            />
            <input
                type="color"
                className="rsa-swatch"
                title={m.labelColor}
                aria-label={m.labelColor}
                value={toHex(color)}
                onChange={(e) => setColor(e.target.value)}
            />
            {editor.id != null && (
                <button type="button" className="rsa-btn" title={m.deleteLabel} aria-label={m.deleteLabel} onClick={onDelete}>
                    ✕
                </button>
            )}
        </form>
    );
}

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Portaled to <body>: the chart's parent may clip or transform, which would trap a fixed menu.
export default function ContextMenu({ menu, title, items, style, onClose }) {
    const ref = useRef(null);
    const [pos, setPos] = useState({ left: menu.clientX, top: menu.clientY });

    useLayoutEffect(() => {
        const rect = ref.current.getBoundingClientRect();
        setPos({
            left: Math.max(4, Math.min(menu.clientX, window.innerWidth - rect.width - 4)),
            top: Math.max(4, Math.min(menu.clientY, window.innerHeight - rect.height - 4)),
        });
        ref.current.querySelector("button")?.focus();
    }, [menu.clientX, menu.clientY]);

    useEffect(() => {
        const onDown = (e) => {
            if (!ref.current?.contains(e.target)) onClose();
        };
        const onKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("pointerdown", onDown, true);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onDown, true);
            document.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    return createPortal(
        <div ref={ref} className="rsa-menu" role="menu" style={{ ...style, ...pos }} onContextMenu={(e) => e.preventDefault()}>
            <div className="rsa-menu-title">{title}</div>
            <hr />
            {items.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                        onClose();
                        item.onClick();
                    }}
                >
                    {item.label}
                </button>
            ))}
        </div>,
        document.body,
    );
}

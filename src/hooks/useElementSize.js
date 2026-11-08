import { useEffect, useState } from "react";

/** Integer content size of an element, coalesced to one update per frame. */
export function useElementSize(ref) {
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const element = ref.current;
        if (!element || typeof ResizeObserver === "undefined") return undefined;
        let raf = 0;
        const observer = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const next = { width: Math.floor(width), height: Math.floor(height) };
                setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
            });
        });
        observer.observe(element);
        return () => {
            cancelAnimationFrame(raf);
            observer.disconnect();
        };
    }, [ref]);

    return size;
}

/** Tracks the OS color scheme for `theme="auto"`. */
export function useSystemDark() {
    const [dark, setDark] = useState(() => (
        typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ));

    useEffect(() => {
        const media = window.matchMedia?.("(prefers-color-scheme: dark)");
        if (!media) return undefined;
        const onChange = (e) => setDark(e.matches);
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, []);

    return dark;
}

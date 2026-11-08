// Trace, hold, label, level and ruler hues keep this order: it is the one checked
// for colorblind separation. Override any of them through the `theme` prop.
export const LIGHT_THEME = {
    background: "#fcfcfb",
    surface: "#fcfcfb",
    text: "#0b0b0b",
    textSecondary: "#52514e",
    grid: "#e1e0d9",
    axis: "#c3c2b7",
    border: "rgba(11,11,11,0.16)",
    hover: "rgba(11,11,11,0.06)",
    crosshair: "#898781",
    trace: "#2a78d6",
    maxHold: "#eb6834",
    minHold: "#1baf7a",
    label: "#eda100",
    level: "#d55181",
    ruler: "#6250d6",
};

export const DARK_THEME = {
    background: "#1a1a19",
    surface: "#1a1a19",
    text: "#f0efec",
    textSecondary: "#c3c2b7",
    grid: "#2c2c2a",
    axis: "#383835",
    border: "rgba(255,255,255,0.18)",
    hover: "rgba(255,255,255,0.08)",
    crosshair: "#898781",
    trace: "#3987e5",
    maxHold: "#d95926",
    minHold: "#199e70",
    label: "#c98500",
    level: "#d55181",
    ruler: "#9085e9",
};

/** theme: "light" | "dark" | { base?: "light" | "dark", ...overrides } */
export function resolveTheme(theme, systemDark) {
    if (theme && typeof theme === "object") {
        const base = theme.base ?? (systemDark ? "dark" : "light");
        return { ...(base === "dark" ? DARK_THEME : LIGHT_THEME), ...theme };
    }
    const dark = theme === "dark" || (theme !== "light" && systemDark);
    return dark ? DARK_THEME : LIGHT_THEME;
}

export function themeVariables(theme) {
    return {
        "--rsa-bg": theme.background,
        "--rsa-surface": theme.surface,
        "--rsa-text": theme.text,
        "--rsa-text2": theme.textSecondary,
        "--rsa-border": theme.border,
        "--rsa-hover": theme.hover,
        "--rsa-accent": theme.trace,
    };
}

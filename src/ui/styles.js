// Shipped inside the component so consumers have no stylesheet to import.
export const CSS = `
.rsa-root { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; background: var(--rsa-bg); color: var(--rsa-text); font-family: inherit; font-size: 12px; }
.rsa-root *, .rsa-menu * { box-sizing: border-box; }
.rsa-plot { position: relative; flex: 1 1 0; min-height: 0; min-width: 0; overflow: hidden; }
.rsa-canvas { position: absolute; left: 0; top: 0; display: block; outline: none; touch-action: none; user-select: none; -webkit-user-select: none; }
.rsa-canvas:focus-visible { box-shadow: inset 0 0 0 2px var(--rsa-accent); }
.rsa-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; padding: 4px 6px; border-bottom: 1px solid var(--rsa-border); flex: 0 0 auto; }
.rsa-toolbar[data-position="bottom"] { order: 1; border-bottom: 0; border-top: 1px solid var(--rsa-border); }
.rsa-group { display: inline-flex; align-items: center; gap: 2px; }
.rsa-toolbar:not([data-compact="true"]) .rsa-group + .rsa-group { padding-left: 6px; border-left: 1px solid var(--rsa-border); }
.rsa-btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 26px; min-width: 26px; padding: 0 5px; border: 0; border-radius: 4px; background: transparent; color: var(--rsa-text2); font: inherit; cursor: pointer; white-space: nowrap; }
.rsa-btn:hover { background: var(--rsa-hover); color: var(--rsa-text); }
.rsa-btn:focus-visible, .rsa-field input:focus-visible, .rsa-swatch:focus-visible { outline: 2px solid var(--rsa-accent); outline-offset: -2px; }
.rsa-btn[aria-pressed="true"] { background: var(--rsa-hover); color: var(--rsa-text); box-shadow: inset 0 -2px 0 var(--rsa-accent); }
.rsa-btn svg { flex: none; }
.rsa-field { display: inline-flex; align-items: center; gap: 4px; color: var(--rsa-text2); padding-left: 4px; }
.rsa-field input { width: 52px; height: 24px; padding: 0 4px; border: 1px solid var(--rsa-border); border-radius: 4px; background: transparent; color: var(--rsa-text); font: inherit; font-variant-numeric: tabular-nums; }
.rsa-swatch { width: 26px; height: 24px; padding: 2px; border: 1px solid var(--rsa-border); border-radius: 4px; background: transparent; cursor: pointer; }
.rsa-swatch::-webkit-color-swatch-wrapper { padding: 0; }
.rsa-swatch::-webkit-color-swatch { border: 0; border-radius: 2px; }
.rsa-swatch::-moz-color-swatch { border: 0; border-radius: 2px; }
.rsa-hint { position: absolute; left: 50%; bottom: 34px; transform: translateX(-50%); padding: 3px 8px; border-radius: 4px; background: var(--rsa-surface); border: 1px solid var(--rsa-border); color: var(--rsa-text); pointer-events: none; white-space: nowrap; }
.rsa-editor { position: absolute; display: flex; align-items: center; gap: 4px; padding: 3px; border: 1px solid var(--rsa-border); border-radius: 4px; background: var(--rsa-surface); box-shadow: 0 2px 8px rgba(0,0,0,0.18); z-index: 2; }
.rsa-editor input[type="text"] { width: 130px; height: 24px; padding: 0 6px; border: 1px solid var(--rsa-border); border-radius: 4px; background: transparent; color: var(--rsa-text); font: inherit; outline: none; }
.rsa-editor input[type="text"]:focus { border-color: var(--rsa-accent); }
.rsa-menu { position: fixed; z-index: 1400; min-width: 180px; padding: 4px; border: 1px solid var(--rsa-border); border-radius: 6px; background: var(--rsa-surface); color: var(--rsa-text); box-shadow: 0 4px 16px rgba(0,0,0,0.24); font-size: 12px; font-family: inherit; }
.rsa-menu button { display: block; width: 100%; padding: 6px 8px; border: 0; border-radius: 4px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.rsa-menu button:hover, .rsa-menu button:focus-visible { background: var(--rsa-hover); outline: none; }
.rsa-menu hr { margin: 4px 0; border: 0; border-top: 1px solid var(--rsa-border); }
.rsa-menu-title { padding: 4px 8px; color: var(--rsa-text2); font-variant-numeric: tabular-nums; }
`;

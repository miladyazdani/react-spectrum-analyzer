# react-spectrum-analyzer

A responsive spectrum analyzer for React. It draws on a single canvas, has no runtime dependencies beyond React, and keeps up with high-rate FFT streams without re-rendering your app.

- **Averaging queue**: set a number and the display shows the mean of the last N frames, in dB or in linear power
- **Max and min hold**, plus a marker on the strongest bin in view
- **Zoom and pan**: wheel, pinch, buttons and keyboard, down to a set span
- **Trace color**: a single color, or a gradient by level with a color bar
- **Level line**: a horizontal line you drag to the level you want
- **Ruler**: reads center frequency, bandwidth and peak; drag its edges or body
- **Frequency labels**: text above the plot and a vertical line at the frequency; click to edit, drag to move
- **Waterfall**: optional history under the spectrum, sharing its frequency axis, zoom and level range
- **Responsive**: fills its parent and follows it through `ResizeObserver`
- **Optional everything**: each feature can be turned off, and each value can be controlled or left to the component

## Install

```sh
npm install react-spectrum-analyzer
```

React 17 or newer is required. There is no stylesheet to import.

## Quick start

The chart fills its parent, so give the parent a size.

```jsx
import { useRef } from "react";
import SpectrumAnalyzer from "react-spectrum-analyzer";

function Spectrum({ fft }) {
    return (
        <div style={{ width: "100%", height: 400 }}>
            <SpectrumAnalyzer
                data={fft}              // dB per bin, e.g. a Float32Array
                centerFreq={98e6}       // Hz: center of the range the bins cover
                span={20e6}             // Hz: width of the range the bins cover
                defaultAverage={16}
            />
        </div>
    );
}
```

`centerFreq` and `span` describe the incoming frame: the first bin is at `centerFreq - span / 2` and the last at `centerFreq + span / 2`. Zooming changes the view, not the data. When either value changes, the average and the holds restart, because frames from another tuning must not mix.

## Feeding data

| Way | Use it for |
| --- | --- |
| `data` prop | Low-rate data, or data already in React state. Each new array identity is one frame. |
| `dataRef` prop | Streams. The ref is polled once per animation frame, so nothing re-renders. |
| `ref.current.pushFrame(frame)` | Pushing from your own callback. Every frame counts toward the average. |

`dataRef.current` may be a level array or an object such as `{ spectrum, counter }`. If `counter` is present, a change in it marks a new frame, so a reused buffer works. Without it, a new array identity marks the frame.

```jsx
const dataRef = useRef(null);

useEffect(() => {
    const onMessage = (msg) => { dataRef.current = msg.data; };
    socket.on("stream", onMessage);
    return () => socket.off("stream", onMessage);
}, [socket]);

<SpectrumAnalyzer dataRef={dataRef} centerFreq={98e6} span={20e6} />
```

With `dataRef`, frames that arrive between two animation frames are skipped. If the average must see every frame of a stream faster than the display, use `pushFrame`.

## Choosing features

Every feature and every toolbar tool is on by default. Pass `false` for what you don't want; the toolbar button, the drawing and the gestures all go with it.

```jsx
<SpectrumAnalyzer
    data={fft}
    centerFreq={98e6}
    span={20e6}
    features={{ minHold: false, clearTraces: false, ruler: false }}
/>
```

| Key | Controls |
| --- | --- |
| `toolbar` | The toolbar. Gestures and the context menu keep working without it. It also hides by itself below 240 x 140 px, so a tiny parent still shows the plot. |
| `zoom` | Wheel, pinch and keyboard zoom. Off also removes the zoom in and out buttons. |
| `zoomIn`, `zoomOut` | The zoom buttons; the gestures stay |
| `resetZoom` | Reset zoom button, its context menu item and the `0` key |
| `fitLevels` | Fit levels button. `autoFitLevels` is separate from it. |
| `pan` | Dragging the plot and the axes, arrow keys |
| `average` | The averaging queue and its input |
| `maxHold`, `minHold` | Hold traces and their buttons |
| `clearTraces` | Clear traces button |
| `peak` | Marker on the strongest bin |
| `level` | The level line |
| `ruler` | The bandwidth ruler |
| `labels` | Frequency labels and the band above the plot |
| `crosshair` | Crosshair and value tooltip |
| `colorPicker` | Trace color input in the toolbar |
| `pause` | Pause button |
| `contextMenu` | Right-click menu |
| `grid`, `axes`, `legend` | Chart furniture |
| `colorBar` | Scale beside the level axis, shown with `colorStops` or while the waterfall is on |
| `waterfall` | The waterfall's toolbar button. See below for showing it. |

## Waterfall

The waterfall is off until you ask for it:

```jsx
<SpectrumAnalyzer dataRef={dataRef} centerFreq={98e6} span={20e6} defaultWaterfall />
```

`defaultWaterfall` starts it on and leaves a toolbar button to toggle it. Use `waterfall` and `onWaterfallChange` to control it yourself, or `features={{ waterfall: false }}` to remove it and its button altogether.

It sits below the frequency axis, in the same columns as the plot, so a frequency lines up in both. Zooming and panning move the whole history, because rows are stored in dB and repainted, and the colors follow the level range of the spectrum unless you set `waterfallLevels`. Ruler and label lines run through it, the left gutter shows elapsed time, and the tooltip reads the level and age of the row under the pointer. While it is on, the color bar beside the level axis shows its colors, so a color reads off as the level printed next to it.

The chart hides the waterfall when it can't fit at least 40 px of each. Rows record the raw frames, not the average, and stop while paused. Turning the waterfall off frees its memory, and its history restarts when you turn it back on, clear the traces, or retune.

## Gestures

| Action | Mouse or touch | Keyboard (chart focused) |
| --- | --- | --- |
| Zoom frequency | Wheel over the plot (keeps the point under the cursor), or pinch | `+` `-` |
| Zoom levels | Wheel over the level axis, or Shift+wheel | |
| Pan | Drag the plot or an axis; the waterfall pans frequency only | Arrow keys |
| Reset | Toolbar | `0` |
| Move the level line | Drag it | |
| Measure | Shift+drag, or drag the ruler's edges and body | |
| Add a label | Label button then click, or right-click | |
| Edit a label | Click it (empty text deletes it) | |
| Move a label | Drag it | |
| Move the crosshair | Pointer | Shift+Left, Shift+Right |

## Controlled or uncontrolled

Each stateful value comes as `x`, `defaultX` and `onXChange`. Pass `defaultX` and the component keeps the state; pass `x` and you do.

```jsx
const [level, setLevel] = useState(-60);
const [ruler, setRuler] = useState(null);
const [labels, setLabels] = useState([
    { id: 1, freq: 98.1e6, text: "Broadcast FM", color: "#eda100" },
]);

<SpectrumAnalyzer
    dataRef={dataRef}
    centerFreq={98e6}
    span={20e6}
    level={level}
    onLevelChange={setLevel}
    ruler={ruler}
    onRulerChange={setRuler}
    labels={labels}
    onLabelsChange={setLabels}
/>
```

## Props

### Data

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `data` | `ArrayLike<number> \| { spectrum, counter? }` | | Newest frame, in dB per bin |
| `dataRef` | ref of the same | | Polled once per animation frame |
| `centerFreq` | `number` | required | Center of the range the bins cover, in Hz |
| `span` | `number` | required | Width of that range, in Hz |
| `dbMin`, `dbMax` | `number` | `-120`, `0` | Level range before the first signal, and on reset when set |
| `autoFitLevels` | `boolean` | see below | Fits the level axis to the first frame with a signal, and again on reset |

Levels fit themselves by default, so the trace stays in view: once for the first signal, and again each time you reset the zoom. Levels you moved before the signal arrived stay where you put them, and the Fit levels button does the same fit at any time.

| You set | First signal | Reset zoom |
| --- | --- | --- |
| Nothing | Fits | Fits |
| A level in `view` or `defaultView` | Keeps it | Fits |
| `dbMin` or `dbMax` | Keeps them | Returns to them |
| `autoFitLevels={false}` | Keeps the range | Returns to the range |

### View

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `view`, `defaultView`, `onViewChange` | `{ centerFreq, span, dbMin, dbMax }` | full range | Partial values are allowed; missing ones follow the data |
| `minSpan` | `number` | `span / 10000`, at least 1 Hz | Narrowest zoom |
| `maxSpan` | `number` | `span` | Widest zoom |

### Traces

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `average`, `defaultAverage`, `onAverageChange` | `number` | `1` | Length of the queue; 1 means off |
| `averageMode` | `"db" \| "power"` | `"db"` | Mean of the dB values, or of linear power |
| `averageMax` | `number` | `1000` | Limit for `average`; memory is frames x bins x 4 bytes |
| `maxHold`, `defaultMaxHold`, `onMaxHoldChange` | `boolean` | `false` | |
| `minHold`, `defaultMinHold`, `onMinHoldChange` | `boolean` | `false` | |
| `peak`, `defaultPeak`, `onPeakChange` | `boolean` | `false` | Marker on the strongest bin |
| `paused`, `defaultPaused`, `onPausedChange` | `boolean` | `false` | Incoming frames are dropped while paused |
| `maxFps` | `number` | `60` | Caps drawing only |

Holds follow the raw frames, not the average, so they still catch short bursts.

### Waterfall

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `waterfall`, `defaultWaterfall`, `onWaterfallChange` | `boolean` | `false` | Whether it shows |
| `waterfallRatio` | `number` | `0.5` | Share of the height, 0 to 1 |
| `waterfallRows` | `number` | `1024` | Rows kept for repainting |
| `waterfallRowHeight` | `number` | `1` | CSS px per row; larger scrolls faster |
| `waterfallMaxBins` | `number` | `4096` | Wider frames keep their strongest bin per column; memory is rows x bins x 4 bytes |
| `waterfallColors` | `"jet" \| "viridis" \| "grayscale" \| { offset, color }[]` | `"jet"` | `"viridis"` reads better with color vision deficiency |
| `waterfallLevels` | `{ dbMin, dbMax }` | visible range | Level range of the colors |

### Appearance

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `color`, `defaultColor`, `onColorChange` | CSS color | `theme.trace` | Trace color |
| `colorStops` | `{ offset, color }[]` | | Colors the trace by level; offset 0 is the bottom of the view and 1 the top. Replaces `color`. |
| `lineWidth` | `number` | `1.5` | |
| `fill` | `number` | `0.1` | Opacity of the area under the trace; 0 turns it off |
| `theme` | `"auto" \| "light" \| "dark" \| object` | `"auto"` | An object overrides single tokens |
| `dbUnit` | `string` | `"dB"` | |
| `frequencyUnit` | `"Hz" \| "kHz" \| "MHz" \| "GHz"` | from the range | |
| `formatFrequency` | `(hz) => string` | | Replaces all frequency text, including ticks |
| `plotMargin` | `{ left, right, top, bottom }` | | Fixed margins in px |
| `toolbarPosition` | `"top" \| "bottom"` | `"top"` | |
| `toolbarExtra` | node | | Your own controls in the toolbar |
| `className`, `style` | | | On the root element |
| `minHeight` | `number \| string` | `160` | Floor for parents with no height |
| `ariaLabel` | `string` | | |

```jsx
<SpectrumAnalyzer theme={{ base: "dark", background: "transparent", trace: "#00e0a0" }} />
```

Theme tokens: `background`, `surface`, `text`, `textSecondary`, `grid`, `axis`, `border`, `hover`, `crosshair`, `trace`, `maxHold`, `minHold`, `label`, `level`, `ruler`.

### Level line, ruler, labels

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `level`, `defaultLevel`, `onLevelChange` | `number \| null` | `null` | `null` hides the line |
| `levelLabel` | `string` | | Text beside the value |
| `levelStep` | `number` | `0.5` | Dragging snaps to this step in dB |
| `ruler`, `defaultRuler`, `onRulerChange` | `{ centerFreq, bandwidth } \| null` | `null` | `null` hides the ruler |
| `labels`, `defaultLabels`, `onLabelsChange` | `{ id, freq, text, color?, readOnly? }[]` | `[]` | |
| `onLabelClick` | `(label) => void` | | |
| `maxLabelRows` | `number` | `3` | Crowded labels stack up to this many rows |

### Text and menu

| Prop | Type | |
| --- | --- | --- |
| `messages` | `Partial<typeof DEFAULT_MESSAGES>` | All UI text, for translation |
| `contextMenuItems` | `{ label, onClick({ freq, db }) }[]` | Your own right-click items, such as tuning a receiver. `db` is null over the waterfall. |

The chart itself stays left-to-right on right-to-left pages, because the frequency axis does.

### Events

| Prop | Argument | |
| --- | --- | --- |
| `onCursorChange` | `{ freq, db, level, ageMs? } \| null` | `db` is under the pointer; `level` is the trace at that frequency. Over the waterfall `db` is null, `level` is that row's, and `ageMs` its age. |
| `onFrequencyClick` | `freq` | A click without dragging |
| `onPlotAreaChange` | `{ left, right, top, bottom, width, height }` | The plot rectangle in px |

## Ref methods

```jsx
const chart = useRef(null);
<SpectrumAnalyzer ref={chart} /* ... */ />
```

| Method | |
| --- | --- |
| `pushFrame(frame)` | Adds one frame |
| `clearTraces()` | Restarts the queue and the holds |
| `zoomIn()`, `zoomOut()`, `resetZoom()` | |
| `fitLevels()` | Fits the level axis to the visible trace |
| `setView(partial)`, `getView()` | |
| `getTraces()` | `{ current, maxHold, minHold }` as `Float32Array` or `null` |
| `getPeak()` | `{ freq, db }` of the strongest bin in view |
| `toDataURL(type?, quality?)` | The chart as an image |
| `toCSV()` | One row per bin |

## Lining up with another chart

Fix the left and right margins, or read them from `onPlotAreaChange`, so that a frequency sits at the same x in both. Share the zoom through `onViewChange`.

```jsx
<SpectrumAnalyzer plotMargin={{ left: 58, right: 35 }} onViewChange={setView} /* ... */ />
<div style={{ paddingLeft: 58, paddingRight: 35 }}>
    <OccupancyChart view={view} />
</div>
```

## Notes

- Styles are injected by a `<style>` element in the component. A Content Security Policy must allow inline styles.
- The averaging classes, `FrameAverager` and `TraceProcessor`, are exported for use without the chart.

## Development

```sh
pnpm install
pnpm dev     # demo with a simulated signal
pnpm test
pnpm lint
pnpm build
```

## License

MIT

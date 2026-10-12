# Design Document: 16:9 Landscape Draggable Gift Jar Overlay with Live Studio Sync & Scale Controls

## 1. Intent & Context

TikTok Live streamers utilize broadcasting tools such as **TikTok LIVE Studio** and **OBS Studio**, which operate natively in standard **16:9 widescreen landscape (1920x1080)** resolution. Streamers have distinct layout requirements depending on their stream format:
* Webcam overlays (top-right or bottom-right)
* Game HUDs / minimaps (bottom-left or top-left)
* VTuber 2D/3D avatars
* On-screen chat feeds and sponsor alerts

Previously, the Gift Jar overlay rendered on a fixed, static vertical stage without user-customizable positioning. This design document specifies the architecture for:
1. Transforming the Gift Jar overlay into a native **16:9 Landscape** canvas.
2. Providing an interactive **click-and-drag preview stage** inside the Shing Live dashboard.
3. Providing a **Jar Size Slider** and an instant **Reset Position & Size Button**.
4. Synchronizing positioning and scaling changes in **real-time** across all connected clients (TikTok LIVE Studio and OBS Studio) via low-latency WebSockets with zero stream interruptions and zero browser-source reloads.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
* **Native 16:9 Landscape Canvas**: The overlay webpage (`desktop/overlays/jar.html`) supports full 16:9 viewport positioning (1920x1080 coordinate space) with transparent background.
* **Stream-Ready Widget Sizing**: Default base size occupies ~48% of stream height (`~518px` on 1080p), functioning as a clean stream overlay widget rather than dominating the entire broadcast canvas.
* **Interactive Drag-to-Position**: The streamer can click and drag the jar anywhere on the 16:9 stage in the desktop app's preview screen.
* **Real-Time Live Drag-Sync**: While dragging in the desktop app, position changes are broadcast over WebSockets (`jar:transform`) so the jar moves simultaneously in TikTok LIVE Studio.
* **Smooth Size Scaling**: A dedicated range slider in the dashboard adjusts the jar scale from 40% (0.4x) to 150% (1.5x), defaulting to 100% (1.0x).
* **Instant Reset Button**: A single click resets the jar to its default bottom-center position (`x: 50%`, `y: 82%`) and default scale (`1.0x`).
* **Physics & Graphic Entity Integrity**: All jar collision walls, glass graphics, falling gift physics, settled gifts, combo banners, and biggest gift spotlight remain anchored inside the jar stage.
* **Persistent Settings**: Selected coordinates (`x`, `y`) and `scale` persist in `userData/settings.json` across app and computer restarts.
* **Dynamic Boundary Clamping**: Prevents the jar from ever being dragged off-screen by calculating scale-aware margins.

### Non-Goals
* Free 360-degree rotation or tilting (the physics gravity model requires an upright jar orientation).
* Multiple simultaneous independent jars on screen.
* Drag-and-drop interaction inside TikTok LIVE Studio itself (TikTok Studio does not allow direct pointer events on browser sources; all adjustments occur within the Shing Live desktop app).

### Anti-Goals
* Never require the streamer to refresh or reload the browser source in TikTok LIVE Studio or OBS when moving or scaling the jar.
* Never reset or clear gifts currently resting inside the jar when the streamer adjusts its position or size.
* Never allow the jar to be dragged completely off-screen where it cannot be recovered.
* Never submerge the jar collision floor below the bottom edge of the stream.

---

## 3. Architecture & Technical Strategy

### 3.1 Localized Stage Coordinate Architecture & Responsive Viewport Sizing

#### The Sizing Model (Builder Call)
A 1024px-tall stage at raw 1:1 pixel scale would take up 95% of a 1080p stream. We establish a **Viewport-Relative Base Scale factor** of **0.48** (48% of screen height, ~518px on a 1080p canvas).
* At `scale: 1.0` (default): Jar is ~518px tall (48% of 1080p stream height).
* At `scale: 0.4` (minimum): Jar is ~207px tall (compact corner widget).
* At `scale: 1.5` (maximum): Jar is ~778px tall (large feature widget).

#### Unified Stage Positioning
Rather than recalculating Matter.js physics coordinates when moving, Matter.js runs in its stable native internal 764x1024 stage inside `#jar-stage`. The entire container is transformed via GPU-accelerated CSS:

```css
html, body {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: transparent;
}

#container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

#jar-stage {
  position: absolute;
  width: 764px;
  height: 1024px;
  transform-origin: center center;
  left: var(--jar-x, 50%);
  top: var(--jar-y, 82%);
  /* Responsive base scale (0.48 * viewport height / 1024px native height) multiplied by user scale */
  transform: translate(-50%, -50%) scale(calc(var(--jar-scale, 1.0) * (100vh / 1024px) * 0.48));
  pointer-events: none;
  transition: none;
}
```

#### Why This Works Identically across 1080p OBS, 1440p OBS, and 560x315 Dashboard Preview:
Because `100vh` automatically matches the iframe viewport height:
* On a 1080p stream (`100vh = 1080px`), the jar scales to `0.48 * 1080 = 518.4px`.
* On the dashboard preview iframe (`100vh = 315px`), the jar scales to `0.48 * 315 = 151.2px`.
* `left: var(--jar-x)%` and `top: var(--jar-y)%` place the jar at the **exact same proportional coordinates** in both!
* Zero distortion, zero iframe cropping, 100% WYSIWYG synchronization.

---

### 3.2 Dynamic Scale-Aware Boundary Clamping (Builder Call)

To satisfy the Anti-Goal ("Never allow the jar to be dragged off-screen") across all slider scales (`0.4x` to `1.5x`), we implement dynamic boundary clamping:

Given:
* Stage aspect ratio: `width / height = 764 / 1024 ≈ 0.746`
* Effective height as % of viewport: `hPct = 48 * scale`
* Effective width as % of viewport (on 16:9): `wPct = hPct * (764 / 1024) * (9 / 16) ≈ hPct * 0.42`
* Half-width margin: `marginXPct = (wPct / 2) + 2%` (padding)
* Half-height margin: `marginYPct = (hPct / 2) + 2%` (padding)

Clamping formula in dashboard drag logic:
```javascript
const minX = Math.max(5, marginXPct);
const maxX = Math.min(95, 100 - marginXPct);
const minY = Math.max(8, marginYPct);
const maxY = Math.min(96, 100 - marginYPct);

const clampedX = Math.max(minX, Math.min(maxX, rawX));
const clampedY = Math.max(minY, Math.min(maxY, rawY));
```

This guarantees that even at maximum scale (`1.5x`), the jar's glass edges and collision floor remain 100% inside the visible 16:9 stream area.

---

### 3.3 Real-Time WebSocket Synchronization Protocol

#### 1. Data Schema: `jar:transform`
```json
{
  "type": "jar:transform",
  "x": 50.0,
  "y": 82.0,
  "scale": 1.0
}
```

#### 2. Event Handling in `overlayServer.js`:
* On server initialization, default settings include:
  ```json
  "jar": {
    "transform": { "x": 50.0, "y": 82.0, "scale": 1.0 }
  }
  ```
* On `jar:transform`:
  1. Validates and clamps `x`, `y`, `scale`.
  2. Updates `this.settings.jar.transform = { x, y, scale }`.
  3. Broadcasts `{ type: 'jar:transform', x, y, scale }` to all connected clients.
  4. Debounces write to `settings.json` by 300ms.

#### 3. Overlay Consumption in `jar.html`:
```javascript
function applyJarTransform({ x, y, scale }) {
  if (typeof x === 'number') jarStage.style.setProperty('--jar-x', `${x}%`);
  if (typeof y === 'number') jarStage.style.setProperty('--jar-y', `${y}%`);
  if (typeof scale === 'number') jarStage.style.setProperty('--jar-scale', scale);
}
```

---

### 3.4 Dashboard Interactive 16:9 Drag Preview UI

In `desktop/renderer/index.html` under the **Jar tab**:

1. **16:9 Stage Preview Container**:
   * Replaces the static portrait preview card with a widescreen 16:9 stage:
     * `width: 100%`, `max-width: 580px`, `aspect-ratio: 16 / 9`.
     * Dotted dark stream-stage background (`#161024`).
     * Embedded live preview iframe (`src="http://localhost:3333/overlays/jar"`).
   * Transparent interaction layer overlaying the iframe with pointer event capture.

2. **Drag Handle Target**:
   * A visual bounding indicator positioned over the jar (`left: ${x}%; top: ${y}%`).
   * Directional drag cursor (`cursor: grab` / `cursor: grabbing`).
   * When dragging begins, captures pointer events via `setPointerCapture`.
   * Calculates relative percentage coordinates and broadcasts via WebSocket at display refresh rate (`requestAnimationFrame`).

3. **Size Slider Control**:
   * `<input type="range" id="jar-scale-slider" min="0.4" max="1.5" step="0.05" value="1.0">`
   * Percentage readout badge: e.g. `100% (Normal)`, `75% (Compact)`, `125% (Large)`.

4. **Reset Button**:
   * `<button id="jar-reset-transform-btn" class="btn btn-secondary">Reset Position & Size</button>`
   * Restores `x: 50%`, `y: 82%`, `scale: 1.0`.

---

## 4. Summary of Builder Calls Made

1. **Base Display Scale**: Set base scaling to `0.48 * 100vh` (~518px height on 1080p). This ensures the jar functions as a neat stream widget rather than occupying 95% of the screen.
2. **Responsive Viewport Architecture**: Used `100vh / 1024px * 0.48` CSS scaling. This gives 100% identical proportional sizing and placement across any display resolution (1080p stream, 1440p stream, and 560x315 dashboard preview) without duplicate rendering logic.
3. **Dynamic Boundary Clamping**: Derived scale-aware margin formulas to prevent clipping at both minimum (0.4x) and maximum (1.5x) scales.
4. **Default Vertical Anchor**: Set default `y` to `82%` so the jar collision floor sits cleanly near the bottom edge without submerging below the screen.

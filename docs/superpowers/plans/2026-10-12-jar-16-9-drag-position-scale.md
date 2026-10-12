# 16:9 Draggable Gift Jar Overlay with Live Studio Sync & Scale Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Gift Jar overlay into a widescreen 16:9 landscape canvas with an interactive click-and-drag preview, a jar size slider, an instant reset button, and real-time live synchronization to TikTok LIVE Studio and OBS Studio.

**Architecture:** Encapsulate the 764x1024 Matter.js physics simulation inside a single root `#jar-stage` positioned with GPU-accelerated CSS percentage coordinates (`left`, `top`) and responsive viewport scaling (`scale(calc(var(--jar-scale) * (100vh / 1024px) * 0.48))`). A 16:9 interactive preview stage in the Shing Live dashboard captures pointer drag events, calculates scale-aware clamped coordinates, and streams low-latency `jar:transform` WebSocket updates to all connected broadcast software instances.

**Tech Stack:** HTML5 / CSS3 (CSS Custom Properties, Viewport Units, Hardware-accelerated CSS Transforms), JavaScript (Pointer Events API, requestAnimationFrame), Matter.js physics engine, Node.js WebSocket Server (`ws`), Electron IPC.

**Spec:** [docs/superpowers/specs/2026-10-12-jar-16-9-drag-position-scale-design.md](file:///e:/download/shing/docs/superpowers/specs/2026-10-12-jar-16-9-drag-position-scale-design.md)

## Global Constraints

* Strictly no emojis in source code, option labels, HTML templates, comments, or data schemas.
* Preserve all existing gift collision models, drop funnel guidance, falling animations, combo badges, and spotlight banners.
* Never reset or clear settled gifts in the jar when moving or resizing the jar.
* Default transform: `x: 50.0%`, `y: 82.0%`, `scale: 1.0` (occupying ~48% of stream height).
* Allowed scale range: `0.4x` to `1.5x` in steps of `0.05`.
* Allowed coordinate boundaries: dynamically clamped based on scale so no part of the jar escapes off-screen.

## Review Focus

1. **High Scale Clamping**: At maximum scale (`1.5x`), the drag logic must prevent the jar from pushing its collision floor below the 100vh viewport bottom edge or past the horizontal boundaries.
2. **WebSocket Saturation during Rapid Dragging**: Dragging rapidly must throttle socket broadcasts via `requestAnimationFrame` and debounce disk writes by 300ms so the Node.js server does not stutter.
3. **Gift Spawning Alignment**: When the jar is translated to extreme screen edges (e.g. top-right or bottom-left), new gifts must continue dropping cleanly into the funnel mouth of the jar without spawning off-target.
4. **Initial Overlay Connect Race Condition**: If TikTok LIVE Studio connects after the overlay server has started, the server must transmit the persisted transform in the initial `init` payload so the jar renders at the correct coordinates immediately.
5. **Dashboard Preview Ratio Consistency**: Resizing the desktop application window must maintain the 16:9 preview aspect ratio and render the jar at the exact same proportional coordinates as OBS Studio.

---

### Task 1: Server Settings Schema & WebSocket Transform Handler

**Files:**
* Modify: `desktop/server/overlayServer.js:40-90, 680-720`
* Test: `desktop/tests/test-jar-transform-server.js`

**Interfaces:**
* Consumes: Existing `OverlayServer` WebSocket broadcast and settings persistence pipeline.
* Produces:
  * `settings.jar.transform = { x: 50.0, y: 82.0, scale: 1.0 }` in default settings.
  * Handling for incoming WebSocket messages with `data.type === 'jar:transform'`.
  * Outgoing broadcast: `{ type: 'jar:transform', x, y, scale }`.
  * Debounced persistence to `settings.json`.

- [ ] **Step 1: Write failing test script for server transform handling**

Create `desktop/tests/test-jar-transform-server.js`:
```javascript
const assert = require('assert');
const WebSocket = require('ws');

async function run() {
  const ws = new WebSocket('ws://localhost:3333');
  await new Promise(res => ws.on('open', res));

  let received = null;
  ws.on('message', raw => {
    const data = JSON.parse(raw);
    if (data.type === 'jar:transform') received = data;
  });

  ws.send(JSON.stringify({ type: 'jar:transform', x: 75.5, y: 80.0, scale: 1.25 }));

  await new Promise(res => setTimeout(res, 250));
  ws.close();

  assert(received !== null, 'Did not receive jar:transform broadcast');
  assert.strictEqual(received.x, 75.5);
  assert.strictEqual(received.y, 80.0);
  assert.strictEqual(received.scale, 1.25);
  console.log('Task 1 server transform test passed!');
}
run().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-jar-transform-server.js`
Expected: FAIL (assertion error or timeout because `jar:transform` is not handled).

- [ ] **Step 3: Implement `jar:transform` handling in `desktop/server/overlayServer.js`**

1. In default settings initialization: ensure `settings.jar.transform = { x: 50.0, y: 82.0, scale: 1.0 }`.
2. In `handleWsMessage(ws, data)`:
   ```javascript
   if (data.type === 'jar:transform') {
     const x = Math.max(5, Math.min(95, Number(data.x) || 50));
     const y = Math.max(8, Math.min(96, Number(data.y) || 82));
     const scale = Math.max(0.4, Math.min(1.5, Number(data.scale) || 1.0));
     if (!this.settings.jar) this.settings.jar = {};
     this.settings.jar.transform = { x, y, scale };
     this.broadcast({ type: 'jar:transform', x, y, scale });
     this.scheduleSettingsSave();
     return;
   }
   ```
3. In `scheduleSettingsSave()`: debounce `this.saveSettings()` by 300ms so drag events do not cause disk write thrashing.

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-jar-transform-server.js`
Expected: PASS ("Task 1 server transform test passed!").

- [ ] **Step 5: Commit Task 1**

```bash
git add desktop/server/overlayServer.js desktop/tests/test-jar-transform-server.js
git commit -m "feat(jar): add jar:transform schema and debounced websocket broadcast handler"
```

---

### Task 2: 16:9 Landscape Overlay Container & Responsive CSS Transform

**Files:**
* Modify: `desktop/overlays/jar.html:1-80, 720-770`
* Test: `desktop/tests/test-jar-overlay-transform.js`

**Interfaces:**
* Consumes: Outgoing WebSocket `{ type: 'jar:transform', x, y, scale }` and `{ type: 'init', settings: { jar: { transform } } }`.
* Produces:
  * Full 16:9 viewport `#container` (`width: 100vw; height: 100vh; overflow: hidden;`).
  * CSS Custom Properties `--jar-x`, `--jar-y`, `--jar-scale`.
  * Sizing formula: `scale(calc(var(--jar-scale, 1.0) * (100vh / 1024px) * 0.48))`.
  * JS function `applyJarTransform({ x, y, scale })`.

- [ ] **Step 1: Write test script checking overlay transform markup and logic**

Create `desktop/tests/test-jar-overlay-transform.js`:
```javascript
const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('desktop/overlays/jar.html', 'utf8');

assert(html.includes('--jar-x'), 'Missing --jar-x CSS variable in jar.html');
assert(html.includes('--jar-y'), 'Missing --jar-y CSS variable in jar.html');
assert(html.includes('--jar-scale'), 'Missing --jar-scale CSS variable in jar.html');
assert(html.includes('applyJarTransform'), 'Missing applyJarTransform function in jar.html');
assert(html.includes('jar:transform'), 'Missing jar:transform listener in jar.html');

console.log('Task 2 overlay transform test passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-jar-overlay-transform.js`
Expected: FAIL (assertion error for missing variables).

- [ ] **Step 3: Update `desktop/overlays/jar.html` styles and script**

1. Update `#container` and `#jar-stage` styles:
   ```css
   html, body {
     width: 100%; height: 100%;
     margin: 0; padding: 0;
     background: transparent;
     overflow: hidden;
     font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
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
     transform: translate(-50%, -50%) scale(calc(var(--jar-scale, 1.0) * (100vh / 1024px) * 0.48));
     pointer-events: none;
   }
   ```
2. In `jar.html` script:
   ```javascript
   function applyJarTransform(tf) {
     if (!tf || typeof tf !== 'object') return;
     if (typeof tf.x === 'number') jarStage.style.setProperty('--jar-x', `${tf.x}%`);
     if (typeof tf.y === 'number') jarStage.style.setProperty('--jar-y', `${tf.y}%`);
     if (typeof tf.scale === 'number') jarStage.style.setProperty('--jar-scale', tf.scale);
     needsRedraw = true;
   }
   ```
3. In `connectWS()`:
   * On `data.type === 'init'` or `settings:update`: if `data.settings?.jar?.transform`, call `applyJarTransform(data.settings.jar.transform)`.
   * On `data.type === 'jar:transform'`: call `applyJarTransform(data)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-jar-overlay-transform.js`
Expected: PASS ("Task 2 overlay transform test passed!").

- [ ] **Step 5: Commit Task 2**

```bash
git add desktop/overlays/jar.html desktop/tests/test-jar-overlay-transform.js
git commit -m "feat(jar): implement 16:9 responsive viewport transform in jar overlay"
```

---

### Task 3: Dashboard 16:9 Interactive Preview Stage, Scale Slider & Reset UI

**Files:**
* Modify: `desktop/renderer/index.html:785-805`
* Modify: `desktop/renderer/styles.css:960-1000`

**Interfaces:**
* Produces:
  * `#jar-preview-stage`: 16:9 aspect ratio container (`aspect-ratio: 16 / 9`, `max-width: 580px`).
  * `#jar-preview-iframe`: Live iframe showing the 16:9 overlay.
  * `#jar-drag-overlay`: Transparent interaction layer capturing pointer drag.
  * `#jar-drag-target`: Draggable visual box representing the jar with grab cursor.
  * `#jar-scale-slider`: Range slider (`min="0.4" max="1.5" step="0.05" value="1.0"`).
  * `#jar-scale-badge`: Text readout displaying current scale percentage (e.g. `100%`).
  * `#jar-reset-transform-btn`: "Reset Position & Size" button.

- [ ] **Step 1: Write validation test for dashboard preview elements**

Create `desktop/tests/test-jar-dashboard-elements.js`:
```javascript
const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('desktop/renderer/index.html', 'utf8');

assert(html.includes('id="jar-preview-stage"'), 'Missing jar-preview-stage');
assert(html.includes('id="jar-drag-target"'), 'Missing jar-drag-target');
assert(html.includes('id="jar-scale-slider"'), 'Missing jar-scale-slider');
assert(html.includes('id="jar-scale-badge"'), 'Missing jar-scale-badge');
assert(html.includes('id="jar-reset-transform-btn"'), 'Missing jar-reset-transform-btn');

console.log('Task 3 dashboard elements test passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-jar-dashboard-elements.js`
Expected: FAIL (missing elements).

- [ ] **Step 3: Update `desktop/renderer/index.html` and `desktop/renderer/styles.css`**

1. In `index.html` (Jar Live Stream Preview Card):
   ```html
   <div class="jar-live-preview-card">
     <div class="stage-header">
       <span class="preview-title">Jar 16:9 Live Stream Preview</span>
       <span class="stage-tag">Drag to Position</span>
     </div>

     <div class="jar-stage-preview-16-9" id="jar-preview-stage">
       <iframe id="jar-preview-iframe" src="http://localhost:3333/overlays/jar" class="jar-iframe-16-9" allowtransparency="true"></iframe>
       <div class="jar-drag-overlay" id="jar-drag-overlay">
         <div class="jar-drag-target" id="jar-drag-target" title="Click and drag to position jar">
           <div class="jar-drag-crosshair"></div>
           <span class="jar-drag-label">Jar</span>
         </div>
       </div>
     </div>

     <div class="jar-transform-controls">
       <div class="control-row">
         <label for="jar-scale-slider">Jar Size: <span id="jar-scale-badge" class="scale-badge">100%</span></label>
         <input type="range" id="jar-scale-slider" min="0.4" max="1.5" step="0.05" value="1.0">
       </div>
       <button class="btn btn-secondary btn-sm" id="jar-reset-transform-btn">Reset Position & Size</button>
     </div>
   </div>
   ```
2. In `styles.css`: Add styles for `.jar-stage-preview-16-9`, `.jar-iframe-16-9`, `.jar-drag-overlay`, `.jar-drag-target`, `.jar-transform-controls`, and `.scale-badge`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-jar-dashboard-elements.js`
Expected: PASS ("Task 3 dashboard elements test passed!").

- [ ] **Step 5: Commit Task 3**

```bash
git add desktop/renderer/index.html desktop/renderer/styles.css desktop/tests/test-jar-dashboard-elements.js
git commit -m "feat(jar): add 16:9 interactive preview card with drag handle, scale slider, and reset button"
```

---

### Task 4: Interactive Drag Engine & Live Studio Sync Logic

**Files:**
* Modify: `desktop/renderer/app.js:1400-1460, 2600-2650`
* Test: `desktop/tests/test-jar-drag-math.js`

**Interfaces:**
* Consumes: Pointer events on `#jar-drag-overlay` / `#jar-drag-target`, input events on `#jar-scale-slider`, click on `#jar-reset-transform-btn`.
* Produces:
  * `calculateClampedCoordinates(rawX, rawY, scale)` helper with dynamic scale-aware bounds.
  * Emission of `jar:transform` over WebSocket.
  * Visual repositioning of `#jar-drag-target` to match `{ x, y, scale }`.
  * Synchronization with loaded settings on startup.

- [ ] **Step 1: Write test for dynamic scale-aware clamping math**

Create `desktop/tests/test-jar-drag-math.js`:
```javascript
const assert = require('assert');

function calculateClampedCoordinates(rawX, rawY, scale = 1.0) {
  const hPct = 48 * scale;
  const wPct = hPct * (764 / 1024) * (9 / 16);
  const marginX = (wPct / 2) + 2;
  const marginY = (hPct / 2) + 2;

  const minX = Math.max(4, marginX);
  const maxX = Math.min(96, 100 - marginX);
  const minY = Math.max(6, marginY);
  const maxY = Math.min(96, 100 - marginY);

  const x = Math.max(minX, Math.min(maxX, rawX));
  const y = Math.max(minY, Math.min(maxY, rawY));
  return { x: +x.toFixed(1), y: +y.toFixed(1) };
}

// At scale 1.0, extreme values should be clamped inside margins
const c1 = calculateClampedCoordinates(0, 0, 1.0);
assert(c1.x > 10, 'Left margin was not clamped');
assert(c1.y > 15, 'Top margin was not clamped');

// At scale 1.5, bottom floor should stay on-screen
const c2 = calculateClampedCoordinates(50, 100, 1.5);
assert(c2.y < 65, 'Bottom floor at 1.5x scale pushed off-screen');

// Centered coordinates should remain centered
const c3 = calculateClampedCoordinates(50, 50, 1.0);
assert.strictEqual(c3.x, 50);
assert.strictEqual(c3.y, 50);

console.log('Task 4 drag math test passed!');
```

- [ ] **Step 2: Run test to verify math rules**

Run: `node desktop/tests/test-jar-drag-math.js`
Expected: PASS ("Task 4 drag math test passed!").

- [ ] **Step 3: Implement drag engine and event wiring in `desktop/renderer/app.js`**

1. Maintain local state: `jarTransform = { x: 50.0, y: 82.0, scale: 1.0 }`.
2. Add `updateJarTransformUI(x, y, scale)`:
   * Sets slider value to `scale`.
   * Sets `#jar-scale-badge` text to `Math.round(scale * 100) + '%'`.
   * Positions `#jar-drag-target`: `left: ${x}%; top: ${y}%; transform: translate(-50%, -50%) scale(${scale})`.
3. Add `sendJarTransform(x, y, scale)`:
   * Emits `{ type: 'jar:transform', x, y, scale }` via active WebSocket / IPC.
4. Implement pointer drag handling:
   * Pointer down on `#jar-drag-overlay` or `#jar-drag-target`: `setPointerCapture`.
   * Pointer move: throttle with `requestAnimationFrame`, compute `calculateClampedCoordinates`, update UI, and call `sendJarTransform`.
   * Pointer up: release capture.
5. Implement slider input handler:
   * Updates `scale`, re-clamps current coordinates, updates UI, and calls `sendJarTransform`.
6. Implement Reset button click:
   * Sets `x = 50.0`, `y = 82.0`, `scale = 1.0`, updates UI, and sends transform.
7. On settings load:
   * If `settings?.jar?.transform`, initialize `jarTransform` and update UI.

- [ ] **Step 4: Verify syntax and test**

Run: `node --check desktop/renderer/app.js`
Expected: PASS (no syntax errors).

- [ ] **Step 5: Commit Task 4**

```bash
git add desktop/renderer/app.js desktop/tests/test-jar-drag-math.js
git commit -m "feat(jar): implement pointer drag engine, dynamic clamping, and live transform sync"
```

---

### Task 5: End-to-End Verification, Version Bump (v1.4.0), & Release Packaging

**Files:**
* Modify: `desktop/package.json`
* Modify: `desktop/releases.json`
* Modify: `desktop/renderer/app.js`

- [ ] **Step 1: Run all unit and integration tests**

```bash
node desktop/tests/test-jar-transform-server.js
node desktop/tests/test-jar-overlay-transform.js
node desktop/tests/test-jar-dashboard-elements.js
node desktop/tests/test-jar-drag-math.js
```
Expected: All 4 tests PASS.

- [ ] **Step 2: Update version to 1.4.0 across project files**

1. In `desktop/package.json`: `"version": "1.4.0"`.
2. In `desktop/releases.json`: Add `v1.4.0` release notes highlighting 16:9 landscape canvas, draggable jar position, scale slider, and live Studio sync.
3. In `desktop/renderer/app.js`: Add `v1.4.0` changelog entry.

- [ ] **Step 3: Run package update and app sync**

```powershell
powershell -ExecutionPolicy Bypass -File .\sync-app.ps1 -Version "1.4.0" -CommitMessage "Release v1.4.0: 16:9 Landscape Draggable Gift Jar with live Studio sync and scale slider"
```
Expected: PASS (build archive created, syntax validated, committed and pushed to git origin main).

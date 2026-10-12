### Task 4: Interactive Drag Engine & Live Studio Sync Logic

**Files:**
* Modify: `desktop/renderer/app.js`
* Test: `desktop/tests/test-jar-drag-math.js`

**Interfaces:**
* Consumes:
  * DOM elements created in Task 3: `#jar-drag-overlay`, `#jar-drag-target`, `#jar-scale-slider`, `#jar-scale-badge`, `#jar-reset-transform-btn`, `#jar-preview-stage`.
  * WebSocket/IPC communication channel to `overlayServer` (`wsClient` in web fallback or `window.api.saveSettings` / direct WebSocket).
* Produces:
  * `calculateClampedCoordinates(rawX, rawY, scale)` helper with dynamic scale-aware bounds.
  * Emission of `jar:transform` over WebSocket/IPC.
  * Visual repositioning of `#jar-drag-target` to match `{ x, y, scale }`: `left: ${x}%; top: ${y}%; transform: translate(-50%, -50%) scale(${scale})`.
  * Synchronization with loaded settings on startup (`settings?.jar?.transform`).

**Steps:**
1. Write test for dynamic scale-aware clamping math:
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

2. Run test to verify math rules:
   Run: `node desktop/tests/test-jar-drag-math.js`
   Expected: PASS ("Task 4 drag math test passed!").

3. Implement drag engine and event wiring in `desktop/renderer/app.js`:
   - State variables:
     ```javascript
     let jarTransform = { x: 50.0, y: 82.0, scale: 1.0 };
     let isDraggingJar = false;
     let dragRafId = null;
     ```
   - Add `calculateClampedCoordinates(rawX, rawY, scale)` matching spec math.
   - Add `updateJarTransformUI(x, y, scale)`:
     - Sets slider value to `scale`.
     - Sets `#jar-scale-badge` text to `${Math.round(scale * 100)}%`.
     - Positions `#jar-drag-target`: `left: ${x}%; top: ${y}%; transform: translate(-50%, -50%) scale(${scale});`.
   - Add `sendJarTransform(x, y, scale)`:
     - Sends `{ type: 'jar:transform', x, y, scale }`. If WebSocket client `wsClient` is open, sends via `wsClient.send(...)`. If in Electron and `window.api` is available, sends through `window.api` / WebSocket. Ensure the overlay server receives the event so all overlays update live!
   - Pointer drag handling on `#jar-drag-overlay` and `#jar-drag-target`:
     - Listen to `pointerdown` on `#jar-drag-overlay`:
       ```javascript
       $('jar-drag-overlay')?.addEventListener('pointerdown', e => {
         isDraggingJar = true;
         $('jar-drag-overlay').setPointerCapture(e.pointerId);
         $('jar-drag-target')?.classList.add('dragging');
         handlePointerMove(e);
       });
       ```
     - On `pointermove`:
       ```javascript
       function handlePointerMove(e) {
         if (!isDraggingJar) return;
         if (dragRafId) cancelAnimationFrame(dragRafId);
         dragRafId = requestAnimationFrame(() => {
           const rect = $('jar-preview-stage').getBoundingClientRect();
           if (!rect.width || !rect.height) return;
           const rawX = ((e.clientX - rect.left) / rect.width) * 100;
           const rawY = ((e.clientY - rect.top) / rect.height) * 100;
           const clamped = calculateClampedCoordinates(rawX, rawY, jarTransform.scale);
           jarTransform.x = clamped.x;
           jarTransform.y = clamped.y;
           updateJarTransformUI(jarTransform.x, jarTransform.y, jarTransform.scale);
           sendJarTransform(jarTransform.x, jarTransform.y, jarTransform.scale);
         });
       }
       $('jar-drag-overlay')?.addEventListener('pointermove', handlePointerMove);
       ```
     - On `pointerup`, `pointercancel`:
       ```javascript
       const stopDrag = e => {
         if (isDraggingJar) {
           isDraggingJar = false;
           $('jar-drag-target')?.classList.remove('dragging');
           try { $('jar-drag-overlay')?.releasePointerCapture(e.pointerId); } catch (_) {}
         }
       };
       $('jar-drag-overlay')?.addEventListener('pointerup', stopDrag);
       $('jar-drag-overlay')?.addEventListener('pointercancel', stopDrag);
       ```
   - Slider input handling on `#jar-scale-slider`:
     - On `input`:
       ```javascript
       $('jar-scale-slider')?.addEventListener('input', e => {
         const newScale = Math.max(0.4, Math.min(1.5, Number(e.target.value) || 1.0));
         jarTransform.scale = +newScale.toFixed(2);
         const clamped = calculateClampedCoordinates(jarTransform.x, jarTransform.y, jarTransform.scale);
         jarTransform.x = clamped.x;
         jarTransform.y = clamped.y;
         updateJarTransformUI(jarTransform.x, jarTransform.y, jarTransform.scale);
         sendJarTransform(jarTransform.x, jarTransform.y, jarTransform.scale);
       });
       ```
   - Reset button handling on `#jar-reset-transform-btn`:
     - On `click`:
       ```javascript
       $('jar-reset-transform-btn')?.addEventListener('click', () => {
         jarTransform = { x: 50.0, y: 82.0, scale: 1.0 };
         updateJarTransformUI(jarTransform.x, jarTransform.y, jarTransform.scale);
         sendJarTransform(jarTransform.x, jarTransform.y, jarTransform.scale);
       });
       ```
   - On settings load / init:
     - If `appSettings?.jar?.transform`, initialize `jarTransform = Object.assign({}, appSettings.jar.transform)` and call `updateJarTransformUI(jarTransform.x, jarTransform.y, jarTransform.scale)`.
   - Also listen to incoming `jar:transform` WebSocket messages if broadcast externally to keep UI in sync.

4. Run tests:
   Run: `node desktop/tests/test-jar-drag-math.js`
   Run: `node --check desktop/renderer/app.js`
   Expected: PASS.

5. Commit Task 4:
   ```bash
   git add desktop/renderer/app.js desktop/tests/test-jar-drag-math.js
   git commit -m "feat(jar): implement pointer drag engine, dynamic clamping, and live transform sync"
   ```

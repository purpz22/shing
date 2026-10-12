### Task 3: Dashboard 16:9 Interactive Preview Stage, Scale Slider & Reset UI

**Files:**
* Modify: `desktop/renderer/index.html`
* Modify: `desktop/renderer/styles.css`
* Test: `desktop/tests/test-jar-dashboard-elements.js`

**Interfaces:**
* Produces:
  * `#jar-preview-stage`: 16:9 aspect ratio container (`aspect-ratio: 16 / 9`, `max-width: 580px`).
  * `#jar-preview-iframe`: Live iframe showing the 16:9 overlay (`class="jar-iframe-16-9"`).
  * `#jar-drag-overlay`: Transparent interaction layer capturing pointer drag.
  * `#jar-drag-target`: Draggable visual box representing the jar with grab cursor.
  * `#jar-scale-slider`: Range slider (`min="0.4" max="1.5" step="0.05" value="1.0"`).
  * `#jar-scale-badge`: Text readout displaying current scale percentage (e.g. `100%`).
  * `#jar-reset-transform-btn`: "Reset Position & Size" button.

**Steps:**
1. Write validation test for dashboard preview elements:
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

   const css = fs.readFileSync('desktop/renderer/styles.css', 'utf8');
   assert(css.includes('.jar-stage-preview-16-9'), 'Missing .jar-stage-preview-16-9 CSS rule');
   assert(css.includes('.jar-drag-target'), 'Missing .jar-drag-target CSS rule');
   assert(css.includes('.jar-drag-overlay'), 'Missing .jar-drag-overlay CSS rule');

   console.log('Task 3 dashboard elements test passed!');
   ```

2. Run test to verify it fails:
   Run: `node desktop/tests/test-jar-dashboard-elements.js`
   Expected: FAIL (missing elements and styles).

3. Update `desktop/renderer/index.html` and `desktop/renderer/styles.css`:
   - In `index.html` (under Jar Tab, replace `.jar-live-preview-card`):
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
           <label for="jar-scale-slider" class="control-label">Jar Size: <span id="jar-scale-badge" class="scale-badge">100%</span></label>
           <input type="range" id="jar-scale-slider" min="0.4" max="1.5" step="0.05" value="1.0" class="form-range">
         </div>
         <button class="btn btn-secondary btn-sm" id="jar-reset-transform-btn">Reset Position & Size</button>
       </div>
     </div>
     ```
   - In `styles.css`:
     Add modern, high-contrast styles matching the app theme for:
     - `.jar-live-preview-card`: ensure width accommodates the 16:9 stage (e.g. `width: 100%; max-width: 580px;`).
     - `.jar-stage-preview-16-9`: `position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: var(--radius-md); overflow: hidden; background: #181226 radial-gradient(circle, rgba(123, 63, 228, 0.18) 1.5px, transparent 1.5px); background-size: 18px 18px; border: 1.5px solid var(--border-color); box-shadow: inset 0 2px 8px rgba(0,0,0,0.4);`.
     - `.jar-iframe-16-9`: `position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; background: transparent; pointer-events: none;`.
     - `.jar-drag-overlay`: `position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: auto; touch-action: none; user-select: none; z-index: 5;`.
     - `.jar-drag-target`: `position: absolute; left: 50%; top: 82%; transform: translate(-50%, -50%) scale(1); width: 68px; height: 92px; border: 2px dashed #ff6fae; border-radius: 12px; background: rgba(255, 111, 174, 0.12); cursor: grab; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: box-shadow 0.15s, border-color 0.15s; pointer-events: auto; z-index: 6;`. When active/dragging: `cursor: grabbing; border-color: #7b3fe4; background: rgba(123, 63, 228, 0.22); box-shadow: 0 0 12px rgba(123, 63, 228, 0.5);`.
     - `.jar-drag-crosshair`: subtle crosshair icon or indicator.
     - `.jar-drag-label`: `font-size: 10px; font-weight: 700; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.8); text-transform: uppercase;`.
     - `.jar-transform-controls`: flex container with slider, label, and reset button.
     - `.scale-badge`: `display: inline-block; padding: 2px 8px; border-radius: 10px; font-weight: 700; font-size: 12px; background: var(--primary-light); color: var(--primary); margin-left: 6px;`.
   - Maintain the "Strictly no emojis" rule.

4. Run test to verify it passes:
   Run: `node desktop/tests/test-jar-dashboard-elements.js`
   Expected: PASS ("Task 3 dashboard elements test passed!").

5. Commit Task 3:
   ```bash
   git add desktop/renderer/index.html desktop/renderer/styles.css desktop/tests/test-jar-dashboard-elements.js
   git commit -m "feat(jar): add 16:9 interactive preview card with drag handle, scale slider, and reset button"
   ```

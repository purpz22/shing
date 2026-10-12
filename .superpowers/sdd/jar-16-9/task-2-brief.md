### Task 2: 16:9 Landscape Overlay Container & Responsive CSS Transform

**Files:**
* Modify: `desktop/overlays/jar.html`
* Test: `desktop/tests/test-jar-overlay-transform.js`

**Interfaces:**
* Consumes: Outgoing WebSocket `{ type: 'jar:transform', x, y, scale }` and `{ type: 'init', settings: { jar: { transform } } }`.
* Produces:
  * Full 16:9 viewport `#container` (`width: 100vw; height: 100vh; overflow: hidden;`).
  * CSS Custom Properties `--jar-x`, `--jar-y`, `--jar-scale`.
  * Responsive Sizing formula: `scale(calc(var(--jar-scale, 1.0) * (100vh / 1024px) * 0.48))`.
  * Anchor positioning: `left: var(--jar-x, 50%); top: var(--jar-y, 82%); transform: translate(-50%, -50%) scale(...)`.
  * JS function `applyJarTransform({ x, y, scale })`.
  * Real-time WebSocket listener applying `jar:transform` and `init/settings:update` transform settings.

**Steps:**
1. Write test script checking overlay transform markup, styles, and logic:
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
   assert(html.includes('100vw') && html.includes('100vh'), 'Missing 100vw/100vh container sizing');

   console.log('Task 2 overlay transform test passed!');
   ```

2. Run test to verify it fails:
   Run: `node desktop/tests/test-jar-overlay-transform.js`
   Expected: FAIL (assertion error for missing variables).

3. Update `desktop/overlays/jar.html` styles and script:
   - Update `#container` and `#jar-stage` styles:
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
   - In `jar.html` script:
     ```javascript
     function applyJarTransform(tf) {
       if (!tf || typeof tf !== 'object') return;
       if (typeof tf.x === 'number') jarStage.style.setProperty('--jar-x', `${tf.x}%`);
       if (typeof tf.y === 'number') jarStage.style.setProperty('--jar-y', `${tf.y}%`);
       if (typeof tf.scale === 'number') jarStage.style.setProperty('--jar-scale', tf.scale);
       needsRedraw = true;
     }
     ```
   - In `connectWS()`:
     - On `data.type === 'init'` or `settings:update`: if `data.settings?.jar?.transform`, call `applyJarTransform(data.settings.jar.transform)`.
     - On `data.type === 'jar:transform'`: call `applyJarTransform(data)`.

4. Run test to verify it passes:
   Run: `node desktop/tests/test-jar-overlay-transform.js`
   Expected: PASS ("Task 2 overlay transform test passed!").

5. Commit Task 2:
   ```bash
   git add desktop/overlays/jar.html desktop/tests/test-jar-overlay-transform.js
   git commit -m "feat(jar): implement 16:9 responsive viewport transform in jar overlay"
   ```

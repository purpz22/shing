### Task 1: Server Settings Schema & WebSocket Transform Handler

**Files:**
* Modify: `desktop/server/overlayServer.js`
* Test: `desktop/tests/test-jar-transform-server.js`

**Interfaces:**
* Consumes: Existing `OverlayServer` WebSocket broadcast and settings persistence pipeline.
* Produces:
  * `settings.jar.transform = { x: 50.0, y: 82.0, scale: 1.0 }` in default settings.
  * Handling for incoming WebSocket messages with `data.type === 'jar:transform'`.
  * Outgoing broadcast: `{ type: 'jar:transform', x, y, scale }`.
  * Debounced persistence to `settings.json`.

**Steps:**
1. Write failing test script for server transform handling:
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

     await new Promise(res => setTimeout(res, 350));
     ws.close();

     assert(received !== null, 'Did not receive jar:transform broadcast');
     assert.strictEqual(received.x, 75.5);
     assert.strictEqual(received.y, 80.0);
     assert.strictEqual(received.scale, 1.25);
     console.log('Task 1 server transform test passed!');
   }
   run().catch(err => { console.error(err); process.exit(1); });
   ```

2. Run test to verify it fails:
   Run: `node desktop/tests/test-jar-transform-server.js`
   Expected: FAIL (assertion error or timeout because `jar:transform` is not handled).

3. Implement `jar:transform` handling in `desktop/server/overlayServer.js`:
   - In default settings initialization (`defaultSettings` or constructor): ensure `settings.jar.transform = { x: 50.0, y: 82.0, scale: 1.0 }`.
   - In `handleWsMessage(ws, data)` or incoming message handler:
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
   - In `scheduleSettingsSave()`: debounce `this.saveSettings()` by 300ms so drag events do not cause disk write thrashing.
   - Ensure `saveSettings()` persists `this.settings` to `settings.json`.

4. Run test to verify it passes:
   Run: `node desktop/tests/test-jar-transform-server.js`
   Expected: PASS ("Task 1 server transform test passed!").

5. Commit Task 1:
   ```bash
   git add desktop/server/overlayServer.js desktop/tests/test-jar-transform-server.js
   git commit -m "feat(jar): add jar:transform schema and debounced websocket broadcast handler"
   ```

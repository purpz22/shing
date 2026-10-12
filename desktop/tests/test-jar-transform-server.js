'use strict';

const assert = require('assert');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const OverlayServer = require('../server/overlayServer');

async function run() {
  const testPort = 3334;
  const tempDir = path.join(__dirname, 'tmp-user-data');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const server = new OverlayServer(testPort, path.resolve(__dirname, '..'), tempDir);
  server.settings = server.getDefaultSettings();

  // Verify initial default settings schema includes transform
  assert(server.settings.jar, 'server.settings.jar should exist');
  assert.deepStrictEqual(server.settings.jar.transform, { x: 50.0, y: 82.0, scale: 1.0 });

  await server.start();

  try {
    const ws = new WebSocket(`ws://localhost:${testPort}`);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    let receivedQueue = [];
    ws.on('message', raw => {
      try {
        const data = JSON.parse(raw);
        if (data.type === 'jar:transform') receivedQueue.push(data);
      } catch (e) {}
    });

    // 1. Valid transform update
    ws.send(JSON.stringify({ type: 'jar:transform', x: 75.5, y: 80.0, scale: 1.25 }));
    await new Promise(resolve => setTimeout(resolve, 100));

    assert(receivedQueue.length === 1, 'Expected 1 received transform message');
    let received = receivedQueue[0];
    assert.strictEqual(received.x, 75.5);
    assert.strictEqual(received.y, 80.0);
    assert.strictEqual(received.scale, 1.25);
    assert.strictEqual(server.settings.jar.transform.x, 75.5);
    assert.strictEqual(server.settings.jar.transform.y, 80.0);
    assert.strictEqual(server.settings.jar.transform.scale, 1.25);

    // 2. Underflow clamping (x < 5, y < 8, scale < 0.4)
    ws.send(JSON.stringify({ type: 'jar:transform', x: -20, y: 2, scale: 0.1 }));
    await new Promise(resolve => setTimeout(resolve, 100));

    assert(receivedQueue.length === 2, 'Expected 2 received transform messages');
    received = receivedQueue[1];
    assert.strictEqual(received.x, 5);
    assert.strictEqual(received.y, 8);
    assert.strictEqual(received.scale, 0.4);

    // 3. Overflow clamping (x > 95, y > 96, scale > 1.5)
    ws.send(JSON.stringify({ type: 'jar:transform', x: 120, y: 150, scale: 3.5 }));
    await new Promise(resolve => setTimeout(resolve, 100));

    assert(receivedQueue.length === 3, 'Expected 3 received transform messages');
    received = receivedQueue[2];
    assert.strictEqual(received.x, 95);
    assert.strictEqual(received.y, 96);
    assert.strictEqual(received.scale, 1.5);

    // 4. Missing / invalid values fallback
    ws.send(JSON.stringify({ type: 'jar:transform', x: 'invalid', y: null, scale: undefined }));
    await new Promise(resolve => setTimeout(resolve, 100));

    assert(receivedQueue.length === 4, 'Expected 4 received transform messages');
    received = receivedQueue[3];
    assert.strictEqual(received.x, 50.0);
    assert.strictEqual(received.y, 82.0);
    assert.strictEqual(received.scale, 1.0);

    // Set final target position matching brief requirement: { x: 75.5, y: 80.0, scale: 1.25 }
    ws.send(JSON.stringify({ type: 'jar:transform', x: 75.5, y: 80.0, scale: 1.25 }));
    await new Promise(resolve => setTimeout(resolve, 100));

    ws.close();

    // Verify debounced persistence saved to disk after 300ms
    await new Promise(resolve => setTimeout(resolve, 350));
    const savedPath = server.getSettingsPath();
    assert(fs.existsSync(savedPath), 'settings.json should have been written to disk');
    const savedJson = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
    assert.strictEqual(savedJson.jar.transform.x, 75.5);
    assert.strictEqual(savedJson.jar.transform.y, 80.0);
    assert.strictEqual(savedJson.jar.transform.scale, 1.25);

    console.log('Task 1 server transform test passed!');
  } finally {
    server.stop();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

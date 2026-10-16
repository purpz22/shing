'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { WebSocket } = require('ws');

const OverlayServer = require('../server/overlayServer');

console.log('Testing PNGTuber Server Settings, Schema, and Real-Time State Sync...');

async function run() {
  const testPort = 3349;
  const tempDir = path.join(__dirname, 'tmp-pngtuber-test-data-' + Date.now());
  const tempBaseDir = path.join(tempDir, 'desktop-mock');
  const tempOverlaysDir = path.join(tempBaseDir, 'overlays');
  fs.mkdirSync(tempOverlaysDir, { recursive: true });

  const pngtuberOverlayPath = path.join(tempOverlaysDir, 'pngtuber.html');
  fs.writeFileSync(pngtuberOverlayPath, '<!DOCTYPE html><html><head><title>PNGTuber</title></head><body>PNGTuber Overlay</body></html>', 'utf8');

  // 1. Test Static Clamping Functions
  assert.strictEqual(OverlayServer.clampPngTuberScale(1.0), 1.0);
  assert.strictEqual(OverlayServer.clampPngTuberScale(0.2), 0.5);
  assert.strictEqual(OverlayServer.clampPngTuberScale(3.5), 2.5);
  assert.strictEqual(OverlayServer.clampPngTuberScale('invalid'), 1.0);
  assert.strictEqual(OverlayServer.clampPngTuberScale(null), 1.0);

  assert.strictEqual(OverlayServer.clampPngTuberThreshold(22), 22);
  assert.strictEqual(OverlayServer.clampPngTuberThreshold(-10), 1);
  assert.strictEqual(OverlayServer.clampPngTuberThreshold(150), 100);
  assert.strictEqual(OverlayServer.clampPngTuberThreshold('invalid'), 22);

  assert.strictEqual(OverlayServer.clampPngTuberHoldDelay(180), 180);
  assert.strictEqual(OverlayServer.clampPngTuberHoldDelay(10), 50);
  assert.strictEqual(OverlayServer.clampPngTuberHoldDelay(5000), 1000);
  assert.strictEqual(OverlayServer.clampPngTuberHoldDelay('invalid'), 180);

  assert.strictEqual(OverlayServer.clampPngTuberBounce(16), 16);
  assert.strictEqual(OverlayServer.clampPngTuberBounce(-5), 0);
  assert.strictEqual(OverlayServer.clampPngTuberBounce(100), 60);

  // 2. Test Default Settings Schema
  const server = new OverlayServer(testPort, tempBaseDir, tempDir);
  const defaults = server.getDefaultSettings();

  assert.ok(defaults.pngtuber, 'defaults.pngtuber should exist');
  assert.strictEqual(defaults.pngtuber.enabled, true);
  assert.strictEqual(defaults.pngtuber.preset, 'shing');
  assert.strictEqual(defaults.pngtuber.mode, 'multi-frame');
  assert.strictEqual(defaults.pngtuber.images.idle, '/assets/pngtuber/shing_idle.png');
  assert.strictEqual(defaults.pngtuber.images.talk, '/assets/pngtuber/shing_talk.png');
  assert.strictEqual(defaults.pngtuber.images.talkHalf, '/assets/pngtuber/shing_talk_half.png');
  assert.strictEqual(defaults.pngtuber.images.talkHalfBlink, '/assets/pngtuber/shing_talk_half_blink.png');
  assert.strictEqual(defaults.pngtuber.images.blink, '/assets/pngtuber/shing_blink.png');
  assert.strictEqual(defaults.pngtuber.images.talkBlink, '/assets/pngtuber/shing_talk_blink.png');
  assert.strictEqual(defaults.pngtuber.images.happy, '/assets/pngtuber/shing_happy.png');
  assert.strictEqual(defaults.pngtuber.threshold, 22);
  assert.strictEqual(defaults.pngtuber.holdDelay, 180);
  assert.strictEqual(defaults.pngtuber.bounceStyle, 'veadotube');
  assert.strictEqual(defaults.pngtuber.bounceHeight, 16);
  assert.strictEqual(defaults.pngtuber.scale, 1.0);
  assert.strictEqual(defaults.pngtuber.reactToGifts, true);

  // Test Auto-Migration of legacy popcat preset
  const legacyLoaded = server.loadSettings();
  assert.strictEqual(legacyLoaded.pngtuber.preset, 'shing');
  assert.strictEqual(legacyLoaded.pngtuber.images.idle, '/assets/pngtuber/shing_idle.png');
  assert.strictEqual(legacyLoaded.pngtuber.images.happy, '/assets/pngtuber/shing_happy.png');

  // 3. Test Clamping upon saveSettings
  server.saveSettings({
    pngtuber: {
      scale: 9.99,
      threshold: 999,
      holdDelay: 10,
      bounceHeight: -50
    }
  });

  assert.strictEqual(server.settings.pngtuber.scale, 2.5);
  assert.strictEqual(server.settings.pngtuber.threshold, 100);
  assert.strictEqual(server.settings.pngtuber.holdDelay, 50);
  assert.strictEqual(server.settings.pngtuber.bounceHeight, 0);

  // 4. Test Live WebSocket & HTTP API State Sync
  await server.start();

  const wsMessages = [];
  const ws = new WebSocket(`ws://localhost:${testPort}`);
  ws.on('message', raw => {
    try {
      wsMessages.push(JSON.parse(raw.toString()));
    } catch (_) {}
  });

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  // Verify Init packet includes pngtuber settings
  await new Promise(resolve => setTimeout(resolve, 150));
  const initMsg = wsMessages.find(m => m.type === 'init');
  assert.ok(initMsg, 'Client must receive init message');
  assert.ok(initMsg.settings.pngtuber, 'init message should include pngtuber settings');

  // Verify WebSocket state broadcast
  ws.send(JSON.stringify({
    type: 'pngtuber:state',
    talking: true,
    paused: true,
    volume: 78,
    state: 'paused'
  }));

  await new Promise(resolve => setTimeout(resolve, 150));
  const stateMsg = wsMessages.find(m => m.type === 'pngtuber:state' && m.talking === true);
  assert.ok(stateMsg, 'Client must receive broadcast pngtuber:state message');
  assert.strictEqual(stateMsg.volume, 78);
  assert.strictEqual(stateMsg.paused, true);
  assert.strictEqual(stateMsg.state, 'paused');

  // Verify HTTP POST /api/pngtuber/state
  const postData = JSON.stringify({ talking: true, paused: true, volume: 15, state: 'paused' });
  await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: testPort,
      path: '/api/pngtuber/state',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      assert.strictEqual(res.statusCode, 200);
      resolve();
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  await new Promise(resolve => setTimeout(resolve, 150));
  const httpStateMsg = wsMessages.find(m => m.type === 'pngtuber:state' && m.volume === 15);
  assert.ok(httpStateMsg, 'Client must receive HTTP triggered pngtuber:state message');
  assert.strictEqual(httpStateMsg.talking, true);
  assert.strictEqual(httpStateMsg.paused, true);
  assert.strictEqual(httpStateMsg.state, 'paused');

  ws.close();
  server.stop();

  if (fs.existsSync(tempDir)) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('All PNGTuber server settings and real-time state sync tests passed successfully!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

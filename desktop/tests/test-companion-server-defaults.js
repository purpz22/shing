'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const OverlayServer = require('../server/overlayServer');

console.log('Testing Companion Server Defaults Schema...');

// Test 1: getDefaultSettings includes bubbleFont and bubbleFontSize
const server = new OverlayServer(3890, path.resolve(__dirname, '..'));
const defaults = server.getDefaultSettings();

assert.ok(defaults.companion, 'defaults.companion must exist');
assert.strictEqual(defaults.companion.bubbleFont, 'Nunito', 'defaults.companion.bubbleFont must be Nunito');
assert.strictEqual(defaults.companion.bubbleFontSize, 18, 'defaults.companion.bubbleFontSize must be 18');

// Test 2: Constructor initializes missing bubbleFont and bubbleFontSize on existing partial settings
const dummyUserDataDir = path.join(__dirname, 'temp_user_data_' + Date.now());
fs.mkdirSync(dummyUserDataDir, { recursive: true });
fs.writeFileSync(path.join(dummyUserDataDir, 'settings.json'), JSON.stringify({
  companion: {
    hair: 'twintails',
    hc: '#7b3fe4',
    oc: '#9b5cf0',
    cats: ['purple']
  }
}), 'utf8');

const partialServer = new OverlayServer(3891, path.resolve(__dirname, '..'), dummyUserDataDir);
assert.strictEqual(partialServer.settings.companion.bubbleFont, 'Nunito', 'constructor must fallback bubbleFont to Nunito');
assert.strictEqual(partialServer.settings.companion.bubbleFontSize, 18, 'constructor must fallback bubbleFontSize to 18');

// Clean up temp dir
try {
  fs.rmSync(dummyUserDataDir, { recursive: true, force: true });
} catch (_) {}

console.log('Companion Server Defaults tests passed successfully!');

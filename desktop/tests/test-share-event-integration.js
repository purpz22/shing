'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const OverlayServer = require('../server/overlayServer');

console.log('Testing Share Event & Default Schema Integration...');

// Test 1: Verify getDefaultSettings().triggers has all 5 events and share properties
const server = new OverlayServer(3888, path.resolve(__dirname, '..'));
const defaults = server.getDefaultSettings();

assert.ok(defaults.triggers, 'defaults.triggers must exist');
assert.ok(defaults.triggers.events, 'defaults.triggers.events must exist');

const expectedKeys = ['follow', 'gift', 'gift_big', 'like', 'share'];
for (const key of expectedKeys) {
  assert.ok(defaults.triggers.events[key], `defaults.triggers.events.${key} must exist`);
  assert.strictEqual(defaults.triggers.events[key].active, true, `defaults.triggers.events.${key}.active must be true`);
}

assert.ok(defaults.triggers.shareMessage, 'defaults.triggers.shareMessage must be defined');
assert.ok(defaults.triggers.giftBigMessage, 'defaults.triggers.giftBigMessage must be defined');
assert.ok(defaults.triggers.sounds.share, 'defaults.triggers.sounds.share must be defined');
assert.ok(defaults.triggers.sounds.gift_big, 'defaults.triggers.sounds.gift_big must be defined');
assert.strictEqual(typeof defaults.triggers.shareMedia, 'string', 'shareMedia must be string');
assert.strictEqual(typeof defaults.triggers.giftBigMedia, 'string', 'giftBigMedia must be string');

// Test 2: Constructor fallbacks when loaded settings has empty triggers or missing events
const dummyUserDataDir = path.join(__dirname, 'temp_user_data_' + Date.now());
fs.mkdirSync(dummyUserDataDir, { recursive: true });
fs.writeFileSync(path.join(dummyUserDataDir, 'settings.json'), JSON.stringify({
  triggers: {
    alertDuration: 4
  }
}), 'utf8');

const partialServer = new OverlayServer(3889, path.resolve(__dirname, '..'), dummyUserDataDir);
assert.ok(partialServer.settings.triggers.events, 'partial settings must have triggers.events initialized');
for (const key of expectedKeys) {
  assert.ok(partialServer.settings.triggers.events[key], `partial settings must have events.${key}`);
  assert.strictEqual(partialServer.settings.triggers.events[key].active, true);
}
assert.ok(partialServer.settings.triggers.sounds.share, 'partial settings must have sounds.share initialized');
assert.ok(partialServer.settings.triggers.shareMessage, 'partial settings must have shareMessage initialized');

// Clean up temp dir
try {
  fs.rmSync(dummyUserDataDir, { recursive: true, force: true });
} catch (_) {}

// Test 3: Verify desktop/main.js has WebcastEvent.SHARE listener
const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
assert.ok(mainJs.includes('conn.on(WebcastEvent.SHARE'), 'main.js must listen to WebcastEvent.SHARE');
assert.ok(mainJs.includes("type: 'share'"), 'main.js must broadcast type: share');

console.log('All Share Event & Schema Integration tests passed!');

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const OverlayServer = require('../server/overlayServer');

console.log('Testing /pet Command Dashboard UI & Server Defaults...');

// Test 1: Markup elements exist in index.html
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
assert.ok(indexHtml.includes('id="headpat-on-command"'), 'index.html must have #headpat-on-command checkbox');
assert.ok(indexHtml.includes('id="test-headpat-cmd-btn"'), 'index.html must have #test-headpat-cmd-btn button');

// Test 2: Server defaults include triggerOnCommand
const server = new OverlayServer(3892, path.resolve(__dirname, '..'));
const defaults = server.getDefaultSettings();
assert.ok(defaults.headpat, 'defaults.headpat must exist');
assert.strictEqual(defaults.headpat.triggerOnCommand, true, 'defaults.headpat.triggerOnCommand must be true');

// Test 3: Constructor fallback for partial existing settings
const dummyUserDataDir = path.join(__dirname, 'temp_user_data_' + Date.now());
fs.mkdirSync(dummyUserDataDir, { recursive: true });
fs.writeFileSync(path.join(dummyUserDataDir, 'settings.json'), JSON.stringify({
  headpat: {
    triggerOnFollow: true,
    triggerOnGift: false
  }
}), 'utf8');

const partialServer = new OverlayServer(3893, path.resolve(__dirname, '..'), dummyUserDataDir);
assert.strictEqual(partialServer.settings.headpat.triggerOnCommand, true, 'constructor must fallback triggerOnCommand to true');

try {
  fs.rmSync(dummyUserDataDir, { recursive: true, force: true });
} catch (_) {}

console.log('All /pet Command UI & Server Defaults tests passed successfully!');

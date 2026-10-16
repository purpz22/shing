'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('Testing Phone Cast Dashboard UI, Markup & Logic Integration...');

// 1. Check icons.js
const iconsPath = path.join(__dirname, '..', 'assets', 'icons', 'icons.js');
assert.ok(fs.existsSync(iconsPath), 'icons.js must exist');
const icons = require(iconsPath);
assert.ok(icons.phone, 'icons.js must define phone SVG icon');
assert.ok(icons.cast, 'icons.js must define cast SVG icon');

// 2. Check index.html markup
const indexPath = path.join(__dirname, '..', 'renderer', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

// Sidebar nav
assert.ok(indexHtml.includes('data-tab="phone"'), 'index.html must include phone nav button in sidebar');
assert.ok(indexHtml.includes('data-icon="phone"'), 'Phone nav button must have data-icon="phone"');

// Overlays grid card
assert.ok(indexHtml.includes('data-goto="phone"'), 'index.html must include Phone Mirror overlay card in grid');
assert.ok(indexHtml.includes('http://localhost:3333/overlays/phone.html'), 'Overlay card must point to phone.html URL');

// Studio Tab Section
assert.ok(indexHtml.includes('id="tab-phone"'), 'index.html must define #tab-phone section');
assert.ok(indexHtml.includes('id="phone-studio-canvas"'), 'index.html must define #phone-studio-canvas');
assert.ok(indexHtml.includes('id="phone-qr-box"'), 'index.html must define #phone-qr-box');
assert.ok(indexHtml.includes('id="phone-status-pill"'), 'index.html must define #phone-status-pill');
assert.ok(indexHtml.includes('id="phone-status-text"'), 'index.html must define #phone-status-text');
assert.ok(indexHtml.includes('id="phone-device-name"'), 'index.html must define #phone-device-name');
assert.ok(indexHtml.includes('id="phone-telemetry-fps"'), 'index.html must define #phone-telemetry-fps');
assert.ok(indexHtml.includes('id="phone-telemetry-res"'), 'index.html must define #phone-telemetry-res');

// Settings inputs
assert.ok(indexHtml.includes('id="phone-frame-style"'), 'index.html must define #phone-frame-style');
assert.ok(indexHtml.includes('id="phone-orientation-mode"'), 'index.html must define #phone-orientation-mode');
assert.ok(indexHtml.includes('id="phone-auto-rotate"'), 'index.html must define #phone-auto-rotate');
assert.ok(indexHtml.includes('id="phone-show-info"'), 'index.html must define #phone-show-info');
assert.ok(indexHtml.includes('id="phone-stream-audio"'), 'index.html must define #phone-stream-audio');

// 3. Check styles.css
const stylesPath = path.join(__dirname, '..', 'renderer', 'styles.css');
const stylesCss = fs.readFileSync(stylesPath, 'utf8');
assert.ok(stylesCss.includes('.phone-studio-grid'), 'styles.css must style .phone-studio-grid');
assert.ok(stylesCss.includes('.phone-stage-panel'), 'styles.css must style .phone-stage-panel');
assert.ok(stylesCss.includes('.phone-qr-card'), 'styles.css must style .phone-qr-card');
assert.ok(stylesCss.includes('.phone-preview-box'), 'styles.css must style .phone-preview-box');

// 4. Check app.js exports and functions
const appJsPath = path.join(__dirname, '..', 'renderer', 'app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');
assert.ok(appJsContent.includes('initPhoneCastStudio'), 'app.js must implement initPhoneCastStudio');
assert.ok(appJsContent.includes('ensurePhoneSettings'), 'app.js must implement ensurePhoneSettings');
assert.ok(appJsContent.includes('populatePhoneSettings'), 'app.js must implement populatePhoneSettings');

global.window = {
  addEventListener: () => {},
  location: { hostname: 'localhost', port: '3333' },
  api: { saveSettings: () => {} }
};
global.document = {
  addEventListener: () => {},
  getElementById: () => null,
  querySelectorAll: () => []
};

const app = require(appJsPath);
assert.strictEqual(typeof app.ensurePhoneSettings, 'function', 'ensurePhoneSettings must be an exported function');
assert.strictEqual(typeof app.populatePhoneSettings, 'function', 'populatePhoneSettings must be an exported function');
assert.strictEqual(typeof app.initPhoneCastStudio, 'function', 'initPhoneCastStudio must be an exported function');

// Test ensurePhoneSettings default values
const testCfg = app.ensurePhoneSettings({});
assert.strictEqual(testCfg.enabled, true);
assert.strictEqual(testCfg.frameStyle, 'none');
assert.strictEqual(testCfg.orientation, 'landscape');
assert.strictEqual(testCfg.autoRotate, true);
assert.strictEqual(testCfg.showInfo, true);
assert.strictEqual(testCfg.streamAudio, true);

// 5. Zero Emoji Audit across all dashboard files
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
assert.strictEqual(emojiRegex.test(indexHtml), false, 'index.html must have 0 emojis');
assert.strictEqual(emojiRegex.test(stylesCss), false, 'styles.css must have 0 emojis');
assert.strictEqual(emojiRegex.test(appJsContent), false, 'app.js must have 0 emojis');
assert.strictEqual(emojiRegex.test(fs.readFileSync(iconsPath, 'utf8')), false, 'icons.js must have 0 emojis');

console.log('All Phone Cast Dashboard UI tests passed successfully!');

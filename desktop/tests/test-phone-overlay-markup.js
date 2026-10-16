'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('Testing Phone Cast Standalone Overlay Markup & WebCodecs Engine...');

const overlayPath = path.join(__dirname, '..', 'overlays', 'phone.html');
assert.ok(fs.existsSync(overlayPath), 'phone.html must exist in desktop/overlays/');

const content = fs.readFileSync(overlayPath, 'utf8');

// 1. Structure & DOM elements
assert.ok(content.includes('id="phone-stage"'), 'Must define #phone-stage wrapper');
assert.ok(content.includes('id="cast-canvas"'), 'Must define #cast-canvas for hardware video decode rendering');
assert.ok(content.includes('id="phone-waiting-card"'), 'Must define #phone-waiting-card when cast is inactive');
assert.ok(content.includes('id="phone-bezel"'), 'Must define #phone-bezel frame');
assert.ok(content.includes('id="cast-status-text"'), 'Must define #cast-status-text');

// 2. WebCodecs & Hardware Decoder Logic
assert.ok(content.includes('VideoDecoder'), 'Must implement WebCodecs VideoDecoder for hardware H.264 decoding');
assert.ok(content.includes('EncodedVideoChunk'), 'Must construct EncodedVideoChunk for hardware decoding');
assert.ok(content.includes('cast:register'), 'Must register receiver role over WebSocket');

// 3. Styling & Bezel Options
assert.ok(content.includes('.phone-frame-rounded'), 'Must support rounded frame styling');
assert.ok(content.includes('.phone-frame-bezel'), 'Must support device bezel frame styling');
assert.ok(content.includes('.phone-frame-none'), 'Must support borderless/raw frame styling');
assert.ok(content.includes('.orientation-portrait'), 'Must support portrait orientation');
assert.ok(content.includes('.orientation-landscape'), 'Must support landscape orientation');

// 4. Verify root mirror
const rootOverlayPath = path.join(__dirname, '..', '..', 'phone.html');
assert.ok(fs.existsSync(rootOverlayPath), 'phone.html must exist at root repository');
const rootContent = fs.readFileSync(rootOverlayPath, 'utf8');
assert.strictEqual(rootContent, content, 'phone.html at root must match desktop/overlays/phone.html exactly');

// 5. Strictly Zero Emojis
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
assert.strictEqual(emojiRegex.test(content), false, 'phone.html must contain strictly zero emojis');
assert.strictEqual(emojiRegex.test(rootContent), false, 'root phone.html must contain strictly zero emojis');

console.log('All Phone Cast overlay markup and decoder checks passed successfully!');


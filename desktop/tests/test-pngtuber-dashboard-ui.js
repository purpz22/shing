'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('Testing PNGTuber Desktop Dashboard UI, Audio Controls & State Bindings...');

const htmlPath = path.join(__dirname, '..', 'renderer', 'index.html');
const cssPath = path.join(__dirname, '..', 'renderer', 'styles.css');
const jsPath = path.join(__dirname, '..', 'renderer', 'app.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

// 1. Navigation & Overlay Grid Bindings
assert.ok(html.includes('data-tab="pngtuber"'), 'Must have sidebar nav button for pngtuber');
assert.ok(html.includes('data-goto="pngtuber"'), 'Must have overlay card for pngtuber');
assert.ok(html.includes('id="tab-pngtuber"'), 'Must have dedicated #tab-pngtuber section');
assert.ok(html.includes('http://localhost:3333/overlays/pngtuber.html'), 'Must link to correct OBS overlay URL');

// 2. Stage Viewport & Background Toggles
assert.ok(html.includes('id="pngtuber-stage-viewport"'), 'Must have #pngtuber-stage-viewport element');
assert.ok(html.includes('id="pngtuber-stage-img"'), 'Must have #pngtuber-stage-img element');
assert.ok(html.includes('data-bg="checkerboard"'), 'Must have checkerboard grid toggle');
assert.ok(html.includes('data-bg="green"'), 'Must have green screen toggle');

// 3. VU Meter & Microphone Activation
assert.ok(html.includes('id="pngtuber-vu-track"'), 'Must have #pngtuber-vu-track VU meter bar');
assert.ok(html.includes('id="pngtuber-vu-fill"'), 'Must have #pngtuber-vu-fill level fill');
assert.ok(html.includes('id="pngtuber-vu-marker"'), 'Must have #pngtuber-vu-marker draggable threshold');
assert.ok(html.includes('id="pngtuber-threshold-slider"'), 'Must have sensitivity threshold slider');
assert.ok(html.includes('id="pngtuber-hold-slider"'), 'Must have hold delay slider');
assert.ok(html.includes('id="pngtuber-mic-select"'), 'Must have microphone device dropdown');

// 4. Presets & 4-Frame Slots
assert.ok(html.includes('data-preset="shing"'), 'Must have Shing Chibi preset button');
assert.ok(!html.includes('data-preset="popcat"'), 'Must not have Pop Cat preset button');
assert.ok(html.includes('data-preset="pixelcat"'), 'Must have Cozy Pixel Cat preset button');
assert.ok(html.includes('data-preset="custom"'), 'Must have Custom Avatar preset button');
assert.ok(html.includes('data-slot="idle"'), 'Must have Idle state slot');
assert.ok(html.includes('data-slot="blink"'), 'Must have Blink state slot');
assert.ok(html.includes('data-slot="talk"'), 'Must have Talking state slot');
assert.ok(html.includes('data-slot="talkBlink"'), 'Must have Talking Blink state slot');

// 5. CSS Styles
assert.ok(css.includes('.pngtuber-studio-grid'), 'CSS must define .pngtuber-studio-grid');
assert.ok(css.includes('.vu-meter-track'), 'CSS must define .vu-meter-track');
assert.ok(css.includes('.vu-meter-fill'), 'CSS must define .vu-meter-fill');
assert.ok(css.includes('.stage-viewport'), 'CSS must define .stage-viewport');
assert.ok(css.includes('.avatar-slots-grid'), 'CSS must define .avatar-slots-grid');

// 6. JavaScript Bindings & Audio Logic
assert.ok(js.includes('initPngTuberStudio'), 'app.js must define initPngTuberStudio');
assert.ok(js.includes('clampPngTuberScale'), 'app.js must define clampPngTuberScale');
assert.ok(js.includes('clampPngTuberThreshold'), 'app.js must define clampPngTuberThreshold');
assert.ok(js.includes('pngtuber:state'), 'app.js must synchronize pngtuber:state over WebSocket');

// 7. Strictly Zero Emojis Check
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
assert.strictEqual(emojiRegex.test(html), false, 'index.html must contain strictly zero emojis');
assert.strictEqual(emojiRegex.test(css), false, 'styles.css must contain strictly zero emojis');
assert.strictEqual(emojiRegex.test(js), false, 'app.js must contain strictly zero emojis');

console.log('All PNGTuber dashboard UI and audio control tests passed successfully!');

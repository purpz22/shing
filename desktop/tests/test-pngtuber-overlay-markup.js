'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('Testing PNGTuber Standalone Overlay Markup, CSS Physics, and State Engine...');

const overlayPath = path.join(__dirname, '..', 'overlays', 'pngtuber.html');
const rootMirrorPath = path.join(__dirname, '..', '..', 'pngtuber.html');

assert.ok(fs.existsSync(overlayPath), 'desktop/overlays/pngtuber.html must exist');
assert.ok(fs.existsSync(rootMirrorPath), 'root pngtuber.html must exist for remote deployment');

const overlayContent = fs.readFileSync(overlayPath, 'utf8');
const rootContent = fs.readFileSync(rootMirrorPath, 'utf8');

assert.strictEqual(overlayContent, rootContent, 'root pngtuber.html must exactly mirror desktop/overlays/pngtuber.html');

// 1. DOM Elements
assert.ok(overlayContent.includes('id="pngtuber-root"'), 'Must have #pngtuber-root container');
assert.ok(overlayContent.includes('id="pngtuber-avatar-container"'), 'Must have #pngtuber-avatar-container');
assert.ok(overlayContent.includes('id="pngtuber-img"'), 'Must have #pngtuber-img element');

// 2. CSS Styling & Physics
assert.ok(overlayContent.includes('background: transparent'), 'Must have transparent background for OBS');
assert.ok(overlayContent.includes('--avatar-scale'), 'Must declare --avatar-scale CSS variable');
assert.ok(overlayContent.includes('--bounce-height'), 'Must declare --bounce-height CSS variable');
assert.ok(overlayContent.includes('.is-talking'), 'Must contain .is-talking animation style');
assert.ok(overlayContent.includes('transform: translate3d') || overlayContent.includes('translate'), 'Must use GPU accelerated transforms');

// 3. WebSocket and Event Logic
assert.ok(overlayContent.includes('pngtuber:state'), 'Must listen to pngtuber:state WebSocket messages');
assert.ok(overlayContent.includes('settings:update'), 'Must handle settings:update without reload');
assert.ok(overlayContent.includes('AudioContext') || overlayContent.includes('webkitAudioContext'), 'Must support local AudioContext fallback');
assert.ok(overlayContent.includes('idle') && overlayContent.includes('talk') && overlayContent.includes('happy'), 'Must support idle, talk, blink, and happy gift reaction state switching');
assert.ok(overlayContent.includes('showHappyFrame') && overlayContent.includes('isHappy'), 'Must trigger happy gift reaction on stream gifts');
assert.ok(overlayContent.includes('talkHalf') && overlayContent.includes('talkHalfBlink'), 'Must preload and support talkHalf and talkHalfBlink frames');
assert.ok(overlayContent.includes('mouthPhase') && overlayContent.includes('isPaused'), 'Must maintain mouthPhase and isPaused for conversational mouth flapping and resting mouth settle');
assert.ok(overlayContent.includes('TALK_FLAP_INTERVAL') || overlayContent.includes('talkFlapInterval'), 'Must define conversational mouth-flap cadence interval');
assert.ok(overlayContent.includes('multi-frame'), 'Must support multi-frame animation mode');
assert.ok(overlayContent.includes('fftSize = 256'), 'Must use lightweight fftSize = 256 for low-end PC efficiency');
assert.ok(!overlayContent.includes('filter: drop-shadow'), 'Must avoid GPU-heavy per-frame drop-shadow filter on animated avatar');

// 4. Zero Emojis Check
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
assert.strictEqual(emojiRegex.test(overlayContent), false, 'Overlay must contain strictly zero emojis');

console.log('All PNGTuber overlay markup and physics tests passed successfully!');

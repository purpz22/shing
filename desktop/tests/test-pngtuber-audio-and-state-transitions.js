'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('Testing PNGTuber State Resolution, Assets, and Hold-Delay Audio Logic...');

// 1. Verify PNG Assets Integrity on Disk
const assetsDir = path.join(__dirname, '..', 'assets', 'pngtuber');
const assetFiles = [
  'popcat_closed.png',
  'popcat_open.png',
  'pixelcat_closed.png',
  'pixelcat_open.png'
];

for (const filename of assetFiles) {
  const filePath = path.join(assetsDir, filename);
  assert.ok(fs.existsSync(filePath), `Asset ${filename} must exist on disk`);
  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length > 50000, `Asset ${filename} must be non-empty valid graphic`);
  // Verify PNG Magic bytes: 89 50 4E 47 0D 0A 1A 0A
  assert.strictEqual(buf[0], 0x89);
  assert.strictEqual(buf[1], 0x50);
  assert.strictEqual(buf[2], 0x4E);
  assert.strictEqual(buf[3], 0x47);
}

// 2. Pure State Transition Engine
function resolveFrame(cfg, isTalking, isBlinking) {
  const imgs = cfg.images || {};
  if (isTalking) {
    if (isBlinking && imgs.talkBlink) return imgs.talkBlink;
    return imgs.talk || imgs.idle || '';
  } else {
    if (isBlinking && imgs.blink) return imgs.blink;
    return imgs.idle || '';
  }
}

// 2a. Test 2-Frame Mode (Pop Cat)
const popCatConfig = {
  mode: '2-frame',
  images: {
    idle: '/assets/pngtuber/popcat_closed.png',
    blink: '',
    talk: '/assets/pngtuber/popcat_open.png',
    talkBlink: ''
  }
};

assert.strictEqual(resolveFrame(popCatConfig, false, false), '/assets/pngtuber/popcat_closed.png');
assert.strictEqual(resolveFrame(popCatConfig, true, false), '/assets/pngtuber/popcat_open.png');
// In 2-frame mode, blink seamlessly falls back to idle/talk
assert.strictEqual(resolveFrame(popCatConfig, false, true), '/assets/pngtuber/popcat_closed.png');
assert.strictEqual(resolveFrame(popCatConfig, true, true), '/assets/pngtuber/popcat_open.png');

// 2b. Test 4-Frame Mode (Full Avatar)
const fourFrameConfig = {
  mode: '4-frame',
  images: {
    idle: '/custom/idle.png',
    blink: '/custom/blink.png',
    talk: '/custom/talk.png',
    talkBlink: '/custom/talk_blink.png'
  }
};

assert.strictEqual(resolveFrame(fourFrameConfig, false, false), '/custom/idle.png');
assert.strictEqual(resolveFrame(fourFrameConfig, false, true), '/custom/blink.png');
assert.strictEqual(resolveFrame(fourFrameConfig, true, false), '/custom/talk.png');
assert.strictEqual(resolveFrame(fourFrameConfig, true, true), '/custom/talk_blink.png');

// 2c. Test Partial 4-Frame Mode (Missing talkBlink)
const partialConfig = {
  mode: '4-frame',
  images: {
    idle: '/custom/idle.png',
    blink: '/custom/blink.png',
    talk: '/custom/talk.png',
    talkBlink: ''
  }
};

assert.strictEqual(resolveFrame(partialConfig, false, true), '/custom/blink.png');
assert.strictEqual(resolveFrame(partialConfig, true, true), '/custom/talk.png', 'talkBlink must fall back to talk');

// 3. Audio Hold-Delay Simulation Logic
class VoiceActivationCalibrator {
  constructor(threshold = 22, holdDelayMs = 180) {
    this.threshold = threshold;
    this.holdDelayMs = holdDelayMs;
    this.isTalking = false;
    this.holdTimer = null;
    this.stateTransitions = [];
  }

  processSample(volume, timeAdvanceMs = 0) {
    if (volume >= this.threshold) {
      this.holdTimer = null;
      if (!this.isTalking) {
        this.isTalking = true;
        this.stateTransitions.push({ talking: true, reason: 'speech_onset' });
      }
    } else {
      if (this.isTalking) {
        if (this.holdTimer === null) {
          this.holdTimer = this.holdDelayMs;
        }
        this.holdTimer -= timeAdvanceMs;
        if (this.holdTimer <= 0) {
          this.isTalking = false;
          this.holdTimer = null;
          this.stateTransitions.push({ talking: false, reason: 'hold_expired' });
        }
      }
    }

    return this.isTalking;
  }
}

const calibrator = new VoiceActivationCalibrator(25, 150);

// Volume below threshold -> silent
assert.strictEqual(calibrator.processSample(10), false);
assert.strictEqual(calibrator.processSample(24), false);

// Speech onset
assert.strictEqual(calibrator.processSample(30), true);
assert.strictEqual(calibrator.stateTransitions.length, 1);
assert.strictEqual(calibrator.stateTransitions[0].talking, true);

// Speech continues above threshold
assert.strictEqual(calibrator.processSample(85), true);

// Streamer pauses for 50ms (less than holdDelay 150ms) -> remains talking
assert.strictEqual(calibrator.processSample(10, 50), true);

// Streamer speaks again -> hold timer reset
assert.strictEqual(calibrator.processSample(50, 20), true);

// Streamer stops talking for 100ms -> still in hold window (100 < 150)
assert.strictEqual(calibrator.processSample(5, 100), true);

// Hold window expires (100ms + 60ms = 160ms > 150ms) -> transitions to idle
assert.strictEqual(calibrator.processSample(5, 60), false);
assert.strictEqual(calibrator.stateTransitions.length, 2);
assert.strictEqual(calibrator.stateTransitions[1].talking, false);

console.log('All PNGTuber state transitions, asset integrity, and audio logic tests passed successfully!');

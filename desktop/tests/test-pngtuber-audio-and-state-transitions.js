'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('Testing PNGTuber State Resolution, Assets, and Hold-Delay Audio Logic...');

// 1. Verify PNG Assets Integrity on Disk
const assetsDir = path.join(__dirname, '..', 'assets', 'pngtuber');
const assetFiles = [
  'shing_idle.png',
  'shing_blink.png',
  'shing_talk_half.png',
  'shing_talk_half_blink.png',
  'shing_talk.png',
  'shing_talk_blink.png',
  'shing_happy.png',
  'pixelcat_idle.png',
  'pixelcat_blink.png',
  'pixelcat_talk_half.png',
  'pixelcat_talk_half_blink.png',
  'pixelcat_talk.png',
  'pixelcat_talk_blink.png',
  'pixelcat_happy.png'
];

for (const filename of assetFiles) {
  const filePath = path.join(assetsDir, filename);
  assert.ok(fs.existsSync(filePath), `Asset ${filename} must exist on disk`);
  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length > 500, `Asset ${filename} must be non-empty valid graphic`);
  assert.ok(buf.length < 100 * 1024, `Asset ${filename} must be lightweight (<100KB) for low-end PCs`);
  // Verify PNG Magic bytes: 89 50 4E 47 0D 0A 1A 0A
  assert.strictEqual(buf[0], 0x89);
  assert.strictEqual(buf[1], 0x50);
  assert.strictEqual(buf[2], 0x4E);
  assert.strictEqual(buf[3], 0x47);
}

// Verify distinct frames (idle !== blink, idle !== talk, idle !== happy, idle !== talk_half)
const idleBuf = fs.readFileSync(path.join(assetsDir, 'shing_idle.png'));
const blinkBuf = fs.readFileSync(path.join(assetsDir, 'shing_blink.png'));
const talkBuf = fs.readFileSync(path.join(assetsDir, 'shing_talk.png'));
const talkHalfBuf = fs.readFileSync(path.join(assetsDir, 'shing_talk_half.png'));
const happyBuf = fs.readFileSync(path.join(assetsDir, 'shing_happy.png'));
assert.strictEqual(idleBuf.equals(blinkBuf), false, 'shing_idle.png and shing_blink.png must be distinct images');
assert.strictEqual(idleBuf.equals(talkBuf), false, 'shing_idle.png and shing_talk.png must be distinct images');
assert.strictEqual(idleBuf.equals(talkHalfBuf), false, 'shing_idle.png and shing_talk_half.png must be distinct images');
assert.strictEqual(idleBuf.equals(happyBuf), false, 'shing_idle.png and shing_happy.png must be distinct images');

// 2. Pure Multi-Frame State Transition Engine
function resolveFrame(cfg, isTalking, isBlinking, isHappy = false, isPaused = false, mouthPhase = 0) {
  const imgs = cfg.images || {};
  if (isHappy && imgs.happy) {
    return imgs.happy;
  }
  const mode = cfg.mode || 'multi-frame';
  if (isTalking || isPaused) {
    if (mode === '2-frame') {
      return imgs.talk || imgs.idle || '';
    }
    if (mode === '4-frame') {
      if (isBlinking && imgs.talkBlink) return imgs.talkBlink;
      return imgs.talk || imgs.idle || '';
    }
    // multi-frame mode:
    const isHalf = isPaused || (mouthPhase === 0);
    if (isHalf) {
      if (isBlinking && imgs.talkHalfBlink) return imgs.talkHalfBlink;
      if (isBlinking && imgs.talkBlink) return imgs.talkBlink;
      return imgs.talkHalf || imgs.talk || imgs.idle || '';
    } else {
      if (isBlinking && imgs.talkBlink) return imgs.talkBlink;
      return imgs.talk || imgs.idle || '';
    }
  } else {
    if (isBlinking && imgs.blink && mode !== '2-frame') return imgs.blink;
    return imgs.idle || '';
  }
}

// 2a. Test Shing Multi-Frame Mode
const shingMultiConfig = {
  mode: 'multi-frame',
  images: {
    idle: '/assets/pngtuber/shing_idle.png',
    blink: '/assets/pngtuber/shing_blink.png',
    talkHalf: '/assets/pngtuber/shing_talk_half.png',
    talkHalfBlink: '/assets/pngtuber/shing_talk_half_blink.png',
    talk: '/assets/pngtuber/shing_talk.png',
    talkBlink: '/assets/pngtuber/shing_talk_blink.png',
    happy: '/assets/pngtuber/shing_happy.png'
  }
};

// Silent idle
assert.strictEqual(resolveFrame(shingMultiConfig, false, false, false, false, 0), '/assets/pngtuber/shing_idle.png');
// Silent blink
assert.strictEqual(resolveFrame(shingMultiConfig, false, true, false, false, 0), '/assets/pngtuber/shing_blink.png');
// Active talking phase 0 (parted lips)
assert.strictEqual(resolveFrame(shingMultiConfig, true, false, false, false, 0), '/assets/pngtuber/shing_talk_half.png');
// Active talking phase 1 (wide open mouth)
assert.strictEqual(resolveFrame(shingMultiConfig, true, false, false, false, 1), '/assets/pngtuber/shing_talk.png');
// Active talking blink in phase 0
assert.strictEqual(resolveFrame(shingMultiConfig, true, true, false, false, 0), '/assets/pngtuber/shing_talk_half_blink.png');
// Active talking blink in phase 1
assert.strictEqual(resolveFrame(shingMultiConfig, true, true, false, false, 1), '/assets/pngtuber/shing_talk_blink.png');
// Natural resting mouth pause (voice drops below threshold -> isPaused = true)
assert.strictEqual(resolveFrame(shingMultiConfig, true, false, false, true, 1), '/assets/pngtuber/shing_talk_half.png');
// Resting mouth pause with blink
assert.strictEqual(resolveFrame(shingMultiConfig, true, true, false, true, 1), '/assets/pngtuber/shing_talk_half_blink.png');
// Happy gift reaction priority
assert.strictEqual(resolveFrame(shingMultiConfig, true, true, true, true, 1), '/assets/pngtuber/shing_happy.png');

// 2b. Test Backward Compatibility: Missing talkHalf / talkHalfBlink fallback
const fallbackConfig = {
  mode: 'multi-frame',
  images: {
    idle: '/custom/idle.png',
    blink: '/custom/blink.png',
    talk: '/custom/talk.png',
    talkBlink: '/custom/talk_blink.png'
  }
};
assert.strictEqual(resolveFrame(fallbackConfig, true, false, false, false, 0), '/custom/talk.png', 'Must fall back to talk if talkHalf is missing');
assert.strictEqual(resolveFrame(fallbackConfig, true, true, false, false, 0), '/custom/talk_blink.png', 'Must fall back to talkBlink if talkHalfBlink is missing');

// 3. Audio Hold-Delay & Pause Settle Simulation Logic
class VoiceActivationCalibrator {
  constructor(threshold = 22, holdDelayMs = 180) {
    this.threshold = threshold;
    this.holdDelayMs = holdDelayMs;
    this.isTalking = false;
    this.isPaused = false;
    this.holdTimer = null;
    this.stateTransitions = [];
  }

  processSample(volume, timeAdvanceMs = 0) {
    if (volume >= this.threshold) {
      this.holdTimer = null;
      this.isPaused = false;
      if (!this.isTalking) {
        this.isTalking = true;
        this.stateTransitions.push({ talking: true, paused: false, reason: 'speech_onset' });
      }
    } else {
      if (this.isTalking) {
        if (this.holdTimer === null) {
          this.holdTimer = this.holdDelayMs;
          this.isPaused = true;
          this.stateTransitions.push({ talking: true, paused: true, reason: 'pause_settle' });
        }
        this.holdTimer -= timeAdvanceMs;
        if (this.holdTimer <= 0) {
          this.isTalking = false;
          this.isPaused = false;
          this.holdTimer = null;
          this.stateTransitions.push({ talking: false, paused: false, reason: 'hold_expired' });
        }
      }
    }

    return { talking: this.isTalking, paused: this.isPaused };
  }
}

const calibrator = new VoiceActivationCalibrator(25, 150);

// Volume below threshold -> silent
assert.deepStrictEqual(calibrator.processSample(10), { talking: false, paused: false });
assert.deepStrictEqual(calibrator.processSample(24), { talking: false, paused: false });

// Speech onset
assert.deepStrictEqual(calibrator.processSample(30), { talking: true, paused: false });
assert.strictEqual(calibrator.stateTransitions.length, 1);
assert.strictEqual(calibrator.stateTransitions[0].talking, true);
assert.strictEqual(calibrator.stateTransitions[0].paused, false);

// Speech continues above threshold
assert.deepStrictEqual(calibrator.processSample(85), { talking: true, paused: false });

// Streamer pauses for 50ms (less than holdDelay 150ms) -> enters resting mouth pause
assert.deepStrictEqual(calibrator.processSample(10, 50), { talking: true, paused: true });
assert.strictEqual(calibrator.stateTransitions.length, 2);
assert.strictEqual(calibrator.stateTransitions[1].reason, 'pause_settle');

// Streamer speaks again -> hold timer reset, resumes talking
assert.deepStrictEqual(calibrator.processSample(50, 20), { talking: true, paused: false });

// Streamer stops talking for 100ms -> still in hold window (100 < 150)
assert.deepStrictEqual(calibrator.processSample(5, 100), { talking: true, paused: true });

// Hold window expires (100ms + 60ms = 160ms > 150ms) -> transitions to idle
assert.deepStrictEqual(calibrator.processSample(5, 60), { talking: false, paused: false });
assert.strictEqual(calibrator.stateTransitions[calibrator.stateTransitions.length - 1].reason, 'hold_expired');

console.log('All PNGTuber state transitions, asset integrity, and audio logic tests passed successfully!');


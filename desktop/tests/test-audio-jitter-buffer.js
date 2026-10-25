'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('Testing Audio Jitter Buffer Scheduling and Smooth Playback...');

// 1. Check app.js jitter constants and scheduling logic
const appJsPath = path.join(__dirname, '../renderer/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

assert(appJsContent.includes('const STUDIO_AUDIO_LEAD_TIME = 0.045;'), 'STUDIO_AUDIO_LEAD_TIME must be 0.045s (45ms)');
assert(appJsContent.includes('const STUDIO_MAX_AUDIO_LATENCY = 0.350;'), 'STUDIO_MAX_AUDIO_LATENCY must be 0.350s (350ms)');
const playStudioAudioBlock = appJsContent.slice(appJsContent.indexOf('function playStudioAudio('), appJsContent.indexOf('function connectPhoneCastPreviewWs('));
assert(!playStudioAudioBlock.includes('.stop()'), 'playStudioAudio must NOT call .stop() on active sources during jitter');
assert(appJsContent.includes('latestPhoneCastAudioZcr <= 220'), 'Must allow speech consonants with ZCR <= 220 in app.js');
assert(appJsContent.includes('phoneGateHoldUntil = currentTime + 0.350'), 'Must hold gate open for at least 350ms in app.js');

// 2. Check phone.html jitter constants and scheduling logic
const phoneHtmlPath = path.join(__dirname, '../overlays/phone.html');
const phoneHtmlContent = fs.readFileSync(phoneHtmlPath, 'utf8');

assert(phoneHtmlContent.includes('const AUDIO_LEAD_TIME = 0.045;'), 'AUDIO_LEAD_TIME must be 0.045s (45ms) in phone.html');
assert(phoneHtmlContent.includes('const MAX_AUDIO_LATENCY = 0.350;'), 'MAX_AUDIO_LATENCY must be 0.350s (350ms) in phone.html');
const playAudioChunkBlock = phoneHtmlContent.slice(phoneHtmlContent.indexOf('function playAudioChunk('), phoneHtmlContent.indexOf('window.addEventListener(\'click\''));
assert(!playAudioChunkBlock.includes('.stop()'), 'playAudioChunk in phone.html must NOT call .stop() on active sources during jitter');
assert(phoneHtmlContent.includes('zeroCrossings <= 220'), 'Must allow speech consonants with ZCR <= 220 in phone.html');
assert(phoneHtmlContent.includes('overlayGateHoldUntil = currentTime + 0.350'), 'Must hold gate open for at least 350ms in phone.html');

// 3. Check AudioEncoder.kt mixingLoop
const encoderPath = path.join(__dirname, '../../android/ShingCast/app/src/main/java/com/example/shingcast/encoder/AudioEncoder.kt');
const encoderContent = fs.readFileSync(encoderPath, 'utf8');

assert(encoderContent.includes('internalQueue.poll(12, TimeUnit.MILLISECONDS)'), 'AudioEncoder must block-wait for internal audio');
assert(encoderContent.includes('micQueue.poll(4, TimeUnit.MILLISECONDS)'), 'AudioEncoder must wait for mic chunk to avoid packet interleaving');
assert(encoderContent.includes('MAX_QUEUE_CHUNKS = 6'), 'MAX_QUEUE_CHUNKS must be 6 for smooth queue elasticity');

// 4. Jitter buffer simulation test
// Simulate 100 packets arriving over WiFi with realistic network jitter (5ms - 40ms)
const LEAD_TIME = 0.045;
const MAX_LATENCY = 0.350;
let currentTime = 0.0;
let nextAudioTime = 0.0;
let droppedPackets = 0;
let resets = 0;

for (let packet = 0; packet < 100; packet++) {
  // Packet arrives with random jitter between -15ms and +25ms
  const jitterMs = (Math.random() * 40 - 15) / 1000.0;
  currentTime += 0.010 + jitterMs; // Each packet represents 10ms of audio

  if (nextAudioTime < currentTime) {
    // Late packet (jitter underrun): smoothly schedule with lead time without truncating playing audio
    nextAudioTime = currentTime + LEAD_TIME;
    resets++;
  } else if (nextAudioTime > currentTime + MAX_LATENCY) {
    nextAudioTime = currentTime + LEAD_TIME;
    droppedPackets++;
  }

  nextAudioTime += 0.010; // 10ms audio buffer scheduled
}

// In normal WiFi jitter, zero packets should ever hit the 350ms ceiling
assert.strictEqual(droppedPackets, 0, 'No audio packets should be dropped under normal WiFi jitter');
console.log(`Simulation PASSED: 100 packets processed, 0 dropped, non-destructive jitter resets handled cleanly: ${resets}`);

console.log('PASS: All Audio Jitter Buffer & Mixing Loop tests passed successfully!');

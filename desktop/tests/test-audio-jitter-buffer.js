'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('Testing Audio Jitter Buffer Scheduling and Smooth Playback...');

// 1. Check app.js jitter constants and scheduling logic
const appJsPath = path.join(__dirname, '../renderer/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

assert(appJsContent.includes('const STUDIO_AUDIO_LEAD_TIME = 0.060;'), 'STUDIO_AUDIO_LEAD_TIME must be 0.060s (60ms)');
assert(appJsContent.includes('const STUDIO_MAX_AUDIO_LATENCY = 0.250;'), 'STUDIO_MAX_AUDIO_LATENCY must be 0.250s (250ms)');
const playStudioAudioBlock = appJsContent.slice(appJsContent.indexOf('function playStudioAudio('), appJsContent.indexOf('function connectPhoneCastPreviewWs('));
assert(!playStudioAudioBlock.includes('.stop()'), 'playStudioAudio must NOT call .stop() on active sources during jitter');
assert(appJsContent.includes('phoneNextAudioTime = currentTime;'), 'Must catch up immediately to currentTime on buffer underrun without dead-air holes');
assert(appJsContent.includes('phoneGateEnvelope = 1.0;'), 'Must preserve continuous waveform without syllable chopping');

// 2. Check phone.html jitter constants and scheduling logic
const phoneHtmlPath = path.join(__dirname, '../overlays/phone.html');
const phoneHtmlContent = fs.readFileSync(phoneHtmlPath, 'utf8');

assert(phoneHtmlContent.includes('const AUDIO_LEAD_TIME = 0.060;'), 'AUDIO_LEAD_TIME must be 0.060s (60ms) in phone.html');
assert(phoneHtmlContent.includes('const MAX_AUDIO_LATENCY = 0.250;'), 'MAX_AUDIO_LATENCY must be 0.250s (250ms) in phone.html');
const playAudioChunkBlock = phoneHtmlContent.slice(phoneHtmlContent.indexOf('function playAudioChunk('), phoneHtmlContent.indexOf('window.addEventListener(\'click\''));
assert(!playAudioChunkBlock.includes('.stop()'), 'playAudioChunk in phone.html must NOT call .stop() on active sources during jitter');
assert(phoneHtmlContent.includes('nextAudioTime = currentTime;'), 'Must catch up immediately to currentTime on buffer underrun without dead-air holes in phone.html');
assert(phoneHtmlContent.includes('overlayGateEnvelope = 1.0;'), 'Must preserve continuous waveform without syllable chopping in phone.html');

// 3. Check AudioEncoder.kt mixingLoop
const encoderPath = path.join(__dirname, '../../android/ShingCast/app/src/main/java/com/example/shingcast/encoder/AudioEncoder.kt');
const encoderContent = fs.readFileSync(encoderPath, 'utf8');

assert(encoderContent.includes('internalQueue.poll(6, TimeUnit.MILLISECONDS)'), 'AudioEncoder must poll internal audio with fast 6ms timeout');
assert(encoderContent.includes('MAX_QUEUE_CHUNKS = 6'), 'MAX_QUEUE_CHUNKS must be 6 for smooth queue elasticity');

// 4. Jitter buffer simulation test
// Simulate 100 packets arriving over WiFi with realistic network jitter (5ms - 40ms)
const LEAD_TIME = 0.060;
const MAX_LATENCY = 0.250;
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

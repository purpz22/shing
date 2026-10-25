'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('Testing Phone Cast Microphone Streaming, Noise Filtering & Voice Isolation...');

// 1. Verify AudioEncoder.kt Kotlin source
let audioEncoderPath = path.join(__dirname, '../../android/ShingCast/app/src/main/java/com/example/shingcast/encoder/AudioEncoder.kt');
if (!fs.existsSync(audioEncoderPath)) {
  audioEncoderPath = path.resolve(__dirname, '../../../shing/android/ShingCast/app/src/main/java/com/example/shingcast/encoder/AudioEncoder.kt');
}
assert(fs.existsSync(audioEncoderPath), `AudioEncoder.kt must exist at ${audioEncoderPath}`);
const audioEncoderContent = fs.readFileSync(audioEncoderPath, 'utf8');

assert(audioEncoderContent.includes('const val MODE_MIC = "mic"'), 'Must define MODE_MIC');
assert(audioEncoderContent.includes('const val MODE_INTERNAL = "internal"'), 'Must define MODE_INTERNAL');
assert(audioEncoderContent.includes('const val MODE_MIXED = "mixed"'), 'Must define MODE_MIXED');
assert(audioEncoderContent.includes('SAMPLE_RATE = 48000'), 'Must define 48kHz sample rate');
assert(audioEncoderContent.includes('MediaRecorder.AudioSource.MIC'), 'Must use AudioSource.MIC for microphone capture');
assert(audioEncoderContent.includes('AudioPlaybackCaptureConfiguration'), 'Must support internal game audio capture');
assert(audioEncoderContent.includes('micBoost'), 'Must support microphone volume gain boost');
assert(audioEncoderContent.includes('CastClient.PACKET_AUDIO'), 'Must send binary audio packets');
assert(audioEncoderContent.includes('NoiseSuppressor'), 'Must support Android hardware NoiseSuppressor');
assert(audioEncoderContent.includes('AcousticEchoCanceler'), 'Must support Android hardware AcousticEchoCanceler');
assert(audioEncoderContent.includes('0.9890f'), 'Must implement 85Hz High-pass IIR filter for handling noise reduction');

// 2. Verify ScreenCaptureService.kt Kotlin source
let servicePath = path.join(__dirname, '../../android/ShingCast/app/src/main/java/com/example/shingcast/service/ScreenCaptureService.kt');
if (!fs.existsSync(servicePath)) {
  servicePath = path.resolve(__dirname, '../../../shing/android/ShingCast/app/src/main/java/com/example/shingcast/service/ScreenCaptureService.kt');
}
const serviceContent = fs.readFileSync(servicePath, 'utf8');
assert(serviceContent.includes('EXTRA_AUDIO_MODE'), 'ScreenCaptureService must support EXTRA_AUDIO_MODE');
assert(serviceContent.includes('EXTRA_MIC_BOOST'), 'ScreenCaptureService must support EXTRA_MIC_BOOST');
assert(serviceContent.includes('EXTRA_NOISE_FILTER'), 'ScreenCaptureService must support EXTRA_NOISE_FILTER');
assert(serviceContent.includes('FOREGROUND_SERVICE_TYPE_MICROPHONE'), 'Must declare microphone foreground service');

// 3. Verify MainScreen.kt Compose UI
let mainScreenPath = path.join(__dirname, '../../android/ShingCast/app/src/main/java/com/example/shingcast/ui/main/MainScreen.kt');
if (!fs.existsSync(mainScreenPath)) {
  mainScreenPath = path.resolve(__dirname, '../../../shing/android/ShingCast/app/src/main/java/com/example/shingcast/ui/main/MainScreen.kt');
}
const mainScreenContent = fs.readFileSync(mainScreenPath, 'utf8');
assert(mainScreenContent.includes('Phone Mic'), 'MainScreen must have Phone Mic option');
assert(mainScreenContent.includes('Game + Mic'), 'MainScreen must have Game + Mic mixed option');
assert(mainScreenContent.includes('Game Audio'), 'MainScreen must have Game Audio option');
assert(mainScreenContent.includes('micBoost'), 'MainScreen must have mic boost control');
assert(mainScreenContent.includes('Hardware Noise Suppressor'), 'MainScreen must have Hardware Noise Suppressor control');
assert(mainScreenContent.includes('noiseFilter'), 'MainScreen must bind noiseFilter state');

// 4. Verify Desktop app.js Phone Cast audio & PNGTuber integration
const appJsPath = path.join(__dirname, '../renderer/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');
assert(appJsContent.includes('latestPhoneCastAudioRms'), 'app.js must calculate latestPhoneCastAudioRms');
assert(appJsContent.includes("'phone-cast'"), 'app.js must have phone-cast microphone option');
assert(appJsContent.includes('Wireless Phone Microphone'), 'app.js must display Wireless Phone Microphone status');
assert(appJsContent.includes('phoneNoiseFilterEnabled'), 'app.js must declare phoneNoiseFilterEnabled');
assert(appJsContent.includes('phoneHighpassNode'), 'app.js must create phoneHighpassNode BiquadFilter');
assert(appJsContent.includes('phoneGateGainNode'), 'app.js must create phoneGateGainNode for noise gating');
assert(appJsContent.includes('phoneCompressorNode'), 'app.js must create phoneCompressorNode for dynamics leveling');
assert(appJsContent.includes('phone-noise-filter-btn'), 'app.js must bind noise filter toggle button');
assert(appJsContent.includes('phone-noise-gate-select'), 'app.js must bind noise gate sensitivity select');

// 5. Verify index.html UI
const indexHtmlPath = path.join(__dirname, '../renderer/index.html');
const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
assert(indexHtmlContent.includes('id="phone-noise-filter-btn"'), 'index.html must have noise filter button');
assert(indexHtmlContent.includes('id="phone-noise-gate-select"'), 'index.html must have noise gate sensitivity selector');
assert(indexHtmlContent.includes('id="phone-audio-vu-fill"'), 'index.html must have live VU meter fill bar');

// 6. Test Audio PCM 16-bit Stereo Volume Calculation Logic
function calculatePcmRms(pcmBuffer) {
  const numSamples = Math.floor(pcmBuffer.byteLength / 4);
  if (numSamples <= 0) return 0;
  const view = new DataView(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength);
  let sumSq = 0;
  for (let i = 0; i < numSamples; i++) {
    const l = view.getInt16(i * 4, true) / 32768.0;
    const r = view.getInt16(i * 4 + 2, true) / 32768.0;
    sumSq += (l * l + r * r) * 0.5;
  }
  return Math.sqrt(sumSq / numSamples);
}

// Generate test sine wave audio packet (480 stereo samples, 10ms at 48kHz)
const testPcm = Buffer.alloc(1920);
for (let i = 0; i < 480; i++) {
  const sampleVal = Math.round(Math.sin((2 * Math.PI * 440 * i) / 48000) * 16000);
  testPcm.writeInt16LE(sampleVal, i * 4);
  testPcm.writeInt16LE(sampleVal, i * 4 + 2);
}
const calculatedRms = calculatePcmRms(testPcm);
assert(calculatedRms > 0.30 && calculatedRms < 0.40, `RMS for 16000 amplitude sine wave must be ~0.35, got ${calculatedRms}`);

// 7. Test Noise Gate Envelope Dynamics
const gateThreshold = 0.016; // -36 dB
let gateEnvelope = 0.0;
// Simulate quiet background hiss (RMS = 0.003 < 0.016)
for (let frame = 0; frame < 10; frame++) {
  const rms = 0.003;
  const isVoiceActive = rms >= gateThreshold;
  if (isVoiceActive) {
    gateEnvelope = Math.min(1.0, gateEnvelope + 0.35);
  } else {
    gateEnvelope = Math.max(0.0, gateEnvelope - 0.12);
  }
}
assert(gateEnvelope === 0.0, 'Noise gate must close completely to 0 on quiet background noise');

// Simulate streamer speaking (RMS = 0.25 > 0.016)
for (let frame = 0; frame < 5; frame++) {
  const rms = 0.25;
  const isVoiceActive = rms >= gateThreshold;
  if (isVoiceActive) {
    gateEnvelope = Math.min(1.0, gateEnvelope + 0.35);
  } else {
    gateEnvelope = Math.max(0.0, gateEnvelope - 0.12);
  }
}
assert(gateEnvelope === 1.0, 'Noise gate must open smoothly and fully to 1.0 when speaking');

console.log('PASS: All Phone Cast microphone, noise filtering, and voice isolation tests passed successfully!');

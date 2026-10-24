'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('Testing Phone Cast Microphone Streaming & PNGTuber Voice Integration...');

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

// 2. Verify ScreenCaptureService.kt Kotlin source
let servicePath = path.join(__dirname, '../../android/ShingCast/app/src/main/java/com/example/shingcast/service/ScreenCaptureService.kt');
if (!fs.existsSync(servicePath)) {
  servicePath = path.resolve(__dirname, '../../../shing/android/ShingCast/app/src/main/java/com/example/shingcast/service/ScreenCaptureService.kt');
}
const serviceContent = fs.readFileSync(servicePath, 'utf8');
assert(serviceContent.includes('EXTRA_AUDIO_MODE'), 'ScreenCaptureService must support EXTRA_AUDIO_MODE');
assert(serviceContent.includes('EXTRA_MIC_BOOST'), 'ScreenCaptureService must support EXTRA_MIC_BOOST');
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

// 4. Verify Desktop app.js Phone Cast audio & PNGTuber integration
const appJsPath = path.join(__dirname, '../renderer/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');
assert(appJsContent.includes('latestPhoneCastAudioRms'), 'app.js must calculate latestPhoneCastAudioRms');
assert(appJsContent.includes("'phone-cast'"), 'app.js must have phone-cast microphone option');
assert(appJsContent.includes('Wireless Phone Microphone'), 'app.js must display Wireless Phone Microphone status');

// 5. Test Audio PCM 16-bit Stereo Volume Calculation Logic
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

console.log('PASS: All Phone Cast microphone and wireless voice streaming tests passed successfully!');

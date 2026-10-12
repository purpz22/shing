'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const OverlayServer = require('../server/overlayServer');

async function runTests() {
  console.log('Running Stream Timer Unit Tests...');

  // 1. Verify Default Settings
  const testUserData = path.join(__dirname, '..', '.tmp-test-timer-user-data');
  if (fs.existsSync(testUserData)) fs.rmSync(testUserData, { recursive: true, force: true });
  fs.mkdirSync(testUserData, { recursive: true });

  const server = new OverlayServer({
    port: 3338,
    baseDir: path.join(__dirname, '..'),
    userDataDir: testUserData
  });

  const defaults = server.getDefaultSettings();
  assert(defaults.timer, 'defaults must have timer configuration');
  assert.strictEqual(defaults.timer.durationMin, 30, 'default durationMin should be 30');
  assert.strictEqual(defaults.timer.addSecondsPerGift, 15, 'default addSecondsPerGift should be 15');
  assert.strictEqual(defaults.timer.reduceSecondsPerComment, 1, 'default reduceSecondsPerComment should be 1');
  assert.strictEqual(defaults.timer.reduceSecondsPerLike, 0.1, 'default reduceSecondsPerLike should be 0.1');
  assert.strictEqual(defaults.timer.theme, 'Purple', 'default theme should be Purple');
  assert.strictEqual(defaults.timer.scale, 1.0, 'default scale should be 1.0');

  // 2. Test Timer Initialization & Snapshot
  const initialSnapshot = server.getTimerSnapshot();
  assert.strictEqual(initialSnapshot.remainingSeconds, 1800, 'initial remainingSeconds should be 1800');
  assert.strictEqual(initialSnapshot.initialSeconds, 1800, 'initial initialSeconds should be 1800');
  assert.strictEqual(initialSnapshot.isRunning, false, 'timer should be initially paused');
  assert.strictEqual(initialSnapshot.theme, 'Purple', 'initial snapshot theme should be Purple');
  assert.strictEqual(initialSnapshot.scale, 1.0, 'initial snapshot scale should be 1.0');

  // 3. Test Setting Custom Time
  server.handleTimerControl('set', 45 * 60 + 15); // 45m 15s = 2715s
  let snap = server.getTimerSnapshot();
  assert.strictEqual(snap.remainingSeconds, 2715, 'custom time should be 2715 seconds');
  assert.strictEqual(snap.initialSeconds, 2715, 'initial time should update to 2715');

  // 4. Test Start & Pause
  server.handleTimerControl('start');
  snap = server.getTimerSnapshot();
  assert.strictEqual(snap.isRunning, true, 'timer should be running after start');

  server.handleTimerControl('pause');
  snap = server.getTimerSnapshot();
  assert.strictEqual(snap.isRunning, false, 'timer should be paused after pause');

  // 5. Test Comment Deduction while running
  server.handleTimerControl('start');
  server.onCommentDeduct();
  snap = server.getTimerSnapshot();
  assert.strictEqual(snap.remainingSeconds, 2714, 'comment should deduct 1 second');

  // 6. Test Like Accumulator with 0.1s per like
  // 5 likes = 0.5s -> accumulator is 0.5, no whole second deducted yet
  server.onLikeDeduct(5);
  snap = server.getTimerSnapshot();
  assert.strictEqual(snap.remainingSeconds, 2714, '5 likes (0.5s) should accumulate and not deduct whole second yet');

  // 5 more likes = 0.5s -> accumulator reaches 1.0 -> deducts 1 second
  server.onLikeDeduct(5);
  snap = server.getTimerSnapshot();
  assert.strictEqual(snap.remainingSeconds, 2713, '10 cumulative likes should deduct 1 second');

  // 20 likes burst = 2.0s -> deducts 2 seconds
  server.onLikeDeduct(20);
  snap = server.getTimerSnapshot();
  assert.strictEqual(snap.remainingSeconds, 2711, '20 likes burst should deduct 2 seconds');

  // 7. Test Gift Bonus
  server.onGiftBonus(2); // 2 gifts * 15s = +30s
  snap = server.getTimerSnapshot();
  assert.strictEqual(snap.remainingSeconds, 2741, '2 gifts should add 30 seconds');

  // 8. Test Quick Adjustments
  server.handleTimerControl('adjust', 60); // +1m
  snap = server.getTimerSnapshot();
  assert.strictEqual(snap.remainingSeconds, 2801, 'adjust +60 should add 60 seconds');

  server.handleTimerControl('adjust', -60); // -1m
  snap = server.getTimerSnapshot();
  assert.strictEqual(snap.remainingSeconds, 2741, 'adjust -60 should deduct 60 seconds');

  // 9. Test Reset
  server.handleTimerControl('reset');
  snap = server.getTimerSnapshot();
  assert.strictEqual(snap.remainingSeconds, 2715, 'reset should restore initial custom time');
  assert.strictEqual(snap.isRunning, false, 'reset should pause timer');

  // 10. Test Clamping to 00:00:00
  server.handleTimerControl('set', 2);
  server.handleTimerControl('start');
  server.onCommentDeduct(); // -1s -> 1
  server.onCommentDeduct(); // -1s -> 0
  server.onCommentDeduct(); // -1s -> clamped at 0
  snap = server.getTimerSnapshot();
  assert.strictEqual(snap.remainingSeconds, 0, 'timer should clamp at 0');
  assert.strictEqual(snap.isRunning, false, 'timer should stop running when reaching 0');

  // Cleanup
  server.stop();
  if (fs.existsSync(testUserData)) fs.rmSync(testUserData, { recursive: true, force: true });

  // 11. Check HTML, CSS, and JS file requirements
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
  assert(indexHtml.includes('id="timer-hours"'), 'index.html must have #timer-hours input');
  assert(indexHtml.includes('id="timer-minutes"'), 'index.html must have #timer-minutes input');
  assert(indexHtml.includes('id="timer-seconds"'), 'index.html must have #timer-seconds input');
  assert(indexHtml.includes('id="timer-deduct-comment"'), 'index.html must have #timer-deduct-comment input');
  assert(indexHtml.includes('id="timer-deduct-like"'), 'index.html must have #timer-deduct-like input');
  assert(indexHtml.includes('id="timer-sub1m-btn"'), 'index.html must have #timer-sub1m-btn button');
  assert(indexHtml.includes('id="timer-add5m-btn"'), 'index.html must have #timer-add5m-btn button');
  assert(indexHtml.includes('id="timer-theme"'), 'index.html must have #timer-theme select');
  assert(indexHtml.includes('id="timer-scale-slider"'), 'index.html must have #timer-scale-slider input');

  const timerOverlayHtml = fs.readFileSync(path.join(__dirname, '..', 'overlays', 'timer.html'), 'utf8');
  assert(timerOverlayHtml.includes('deduct-tag'), 'timer.html must support deduct-tag floating animations');
  assert(timerOverlayHtml.includes('timer:sync'), 'timer.html must handle timer:sync events');
  assert(timerOverlayHtml.includes('fit-content'), 'timer.html must use fit-content to avoid stretching');
  assert(timerOverlayHtml.includes('data-theme="Purple"'), 'timer.html must support data-theme="Purple"');
  assert(timerOverlayHtml.includes('--timer-scale'), 'timer.html must support --timer-scale');

  console.log('Stream timer tests passed successfully!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const OverlayServer = require('../server/overlayServer');

async function run() {
  const testPort = 3336;
  const tempDir = path.join(__dirname, 'tmp-ranking-test-data');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const server = new OverlayServer(testPort, path.resolve(__dirname, '..'));
  server.userDataDir = tempDir;
  // Initialize with clean default settings
  server.settings = server.getDefaultSettings();

  try {
    // 1. Verify default settings schema contains theme and scale properties
    assert(server.settings.rankings, 'server.settings.rankings must exist');
    assert.strictEqual(
      server.settings.rankings.topLikersTheme,
      'Purple',
      'Default topLikersTheme must be Purple'
    );
    assert.strictEqual(
      server.settings.rankings.topLikersScale,
      1.0,
      'Default topLikersScale must be 1.0'
    );
    assert.strictEqual(
      server.settings.rankings.viewerRankingTheme,
      'Purple',
      'Default viewerRankingTheme must be Purple'
    );
    assert.strictEqual(
      server.settings.rankings.viewerRankingScale,
      1.0,
      'Default viewerRankingScale must be 1.0'
    );

    // 2. Verify getRankingsSnapshot() includes validated theme and scale fields
    const defaultSnap = server.getRankingsSnapshot();
    assert.strictEqual(
      defaultSnap.topLikersTheme,
      'Purple',
      'Snapshot topLikersTheme must match default Purple'
    );
    assert.strictEqual(
      defaultSnap.topLikersScale,
      1.0,
      'Snapshot topLikersScale must match default 1.0'
    );
    assert.strictEqual(
      defaultSnap.viewerRankingTheme,
      'Purple',
      'Snapshot viewerRankingTheme must match default Purple'
    );
    assert.strictEqual(
      defaultSnap.viewerRankingScale,
      1.0,
      'Snapshot viewerRankingScale must match default 1.0'
    );

    // 2b. Test theme validation and fallback
    server.settings.rankings.topLikersTheme = 'Pink';
    server.settings.rankings.viewerRankingTheme = 'Dark';
    let snap = server.getRankingsSnapshot();
    assert.strictEqual(snap.topLikersTheme, 'Pink');
    assert.strictEqual(snap.viewerRankingTheme, 'Dark');

    // Invalid themes must fall back to 'Purple'
    server.settings.rankings.topLikersTheme = 'InvalidTheme';
    server.settings.rankings.viewerRankingTheme = 'NeonGreen';
    snap = server.getRankingsSnapshot();
    assert.strictEqual(snap.topLikersTheme, 'Purple', 'Invalid topLikersTheme must fallback to Purple');
    assert.strictEqual(snap.viewerRankingTheme, 'Purple', 'Invalid viewerRankingTheme must fallback to Purple');

    // 2c. Test scale validation, clamping [0.5, 1.5], and fallback
    server.settings.rankings.topLikersScale = 1.35;
    server.settings.rankings.viewerRankingScale = 0.75;
    snap = server.getRankingsSnapshot();
    assert.strictEqual(snap.topLikersScale, 1.35);
    assert.strictEqual(snap.viewerRankingScale, 0.75);

    // Underflow clamping (< 0.5)
    server.settings.rankings.topLikersScale = 0.1;
    snap = server.getRankingsSnapshot();
    assert.strictEqual(snap.topLikersScale, 0.5, 'topLikersScale underflow must clamp to 0.5');

    // Overflow clamping (> 1.5)
    server.settings.rankings.viewerRankingScale = 2.8;
    snap = server.getRankingsSnapshot();
    assert.strictEqual(snap.viewerRankingScale, 1.5, 'viewerRankingScale overflow must clamp to 1.5');

    // Non-numeric / NaN scale must fallback to 1.0
    server.settings.rankings.topLikersScale = 'not-a-number';
    server.settings.rankings.viewerRankingScale = null;
    snap = server.getRankingsSnapshot();
    assert.strictEqual(snap.topLikersScale, 1.0, 'Invalid topLikersScale must fallback to 1.0');
    assert.strictEqual(snap.viewerRankingScale, 1.0, 'Invalid viewerRankingScale must fallback to 1.0');

    // Reset settings for stay timer test
    server.settings = server.getDefaultSettings();

    // 3. Stay timer continuity test
    // Initial join
    server.processRankingEvent({ type: 'join', username: 'alice', nickname: 'Alice' });
    const alice = server.viewerStay.get('alice');
    assert(alice, 'alice must be tracked in viewerStay');
    assert.strictEqual(alice.isPresent, true, 'alice must be present');
    assert.strictEqual(alice.currentTimeSec, 0, 'Initial currentTimeSec must be 0');
    assert.strictEqual(alice.bestTimeSec, 0, 'Initial bestTimeSec must be 0');

    // Simulate 10 seconds of presence
    server.tickViewerRankings(10);
    assert.strictEqual(alice.currentTimeSec, 10, 'currentTimeSec must be 10 after 10s tick');
    assert.strictEqual(alice.bestTimeSec, 10, 'bestTimeSec must be 10 after 10s tick');

    // Simulate repeated TikTok member events (join event while already present)
    // Even if more than 15 seconds passed since lastSeenAt or rejoined: true
    const originalSessionStart = alice.sessionStartAt;
    alice.lastSeenAt = Date.now() - 25000; // 25 seconds ago

    server.processRankingEvent({ type: 'join', username: 'alice', nickname: 'Alice' });
    assert.strictEqual(alice.isPresent, true, 'alice must remain present');
    assert.strictEqual(
      alice.sessionStartAt,
      originalSessionStart,
      'sessionStartAt must NOT be wiped by repeated join event when viewer is present'
    );
    assert.ok(
      alice.currentTimeSec >= 10,
      `currentTimeSec must not be reset to 0 (was ${alice.currentTimeSec})`
    );

    // Tick another 5 seconds
    server.tickViewerRankings(5);
    assert.strictEqual(alice.currentTimeSec, 15, 'currentTimeSec must accumulate to 15');
    assert.strictEqual(alice.bestTimeSec, 15, 'bestTimeSec must accumulate to 15');

    // 4. Viewer leave event
    server.processRankingEvent({ type: 'leave', username: 'alice' });
    assert.strictEqual(alice.isPresent, false, 'alice must be marked not present after leave');
    assert.strictEqual(alice.bestTimeSec, 15, 'bestTimeSec must be preserved at 15 after leave');

    // 5. Reconnect after leaving starts a new session while preserving bestTimeSec
    server.processRankingEvent({ type: 'join', username: 'alice', nickname: 'Alice' });
    assert.strictEqual(alice.isPresent, true, 'alice must be marked present upon rejoin');
    assert.strictEqual(alice.currentTimeSec, 0, 'Rejoining viewer starts a new session with currentTimeSec = 0');
    assert.strictEqual(alice.bestTimeSec, 15, 'bestTimeSec must remain 15 when starting new session');

    // Tick new session for 5 seconds
    server.tickViewerRankings(5);
    assert.strictEqual(alice.currentTimeSec, 5, 'currentTimeSec should be 5 in new session');
    assert.strictEqual(alice.bestTimeSec, 15, 'bestTimeSec should still be 15 because 5 < 15');

    // Tick new session past bestTimeSec (12 more seconds -> 17s total)
    server.tickViewerRankings(12);
    assert.strictEqual(alice.currentTimeSec, 17, 'currentTimeSec should be 17');
    assert.strictEqual(alice.bestTimeSec, 17, 'bestTimeSec should update to 17 because 17 > 15');

    // 6. Timeout handling: viewer inactive exceeds leaveTimeoutMin
    server.settings.rankings.leaveTimeoutMin = 1;
    alice.lastSeenAt = Date.now() - 70000; // 70 seconds ago (> 1 min)
    server.tickViewerRankings();
    assert.strictEqual(alice.isPresent, false, 'alice must be marked not present after timeout');
    assert.strictEqual(alice.bestTimeSec, 17, 'bestTimeSec must be preserved after timeout');

    console.log('All ranking server settings and stay timer tests passed successfully!');
  } finally {
    try {
      if (server.server) server.stop();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

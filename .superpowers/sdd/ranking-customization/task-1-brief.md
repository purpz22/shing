# Task 1 Brief: Server Settings Schema & Stay Timer Continuity Fix

## Objective
Update `desktop/server/overlayServer.js` to:
1. Extend `rankings` settings with default theme and scale properties:
   - `topLikersTheme`: `'Purple'`
   - `topLikersScale`: `1.0`
   - `viewerRankingTheme`: `'Purple'`
   - `viewerRankingScale`: `1.0`
2. Include these four properties in `getRankingsSnapshot()`:
   - Validate theme against `['Purple', 'Pink', 'Blue', 'Green', 'Dark', 'Light']` (fallback to `'Purple'`).
   - Validate and clamp scale to `[0.5, 1.5]` (fallback to `1.0`).
3. Fix the stay timer continuity bug in `processRankingEvent(data)`:
   - If `v.isPresent` is `true`, a subsequent `join` event (such as repeated TikTok member messages) must NEVER wipe `v.sessionStartAt` or reset `v.currentTimeSec = 0`. It must only refresh `v.lastSeenAt = now`.
   - If `v.isPresent` is `false` (the viewer was marked offline or had left), reconnecting sets `v.isPresent = true`, starts a new session (`v.sessionStartAt = now`, `v.currentTimeSec = 0`, `v.lastSeenAt = now`), while preserving `v.bestTimeSec`.
4. Ensure `tickViewerRankings()` continues to run every second and update elapsed duration.
5. Provide unit test `desktop/tests/test-ranking-server-settings.js` verifying snapshot properties and timer continuity.

## Global Constraints
- Strictly NO emojis in source code, comments, or data schemas.
- Clean code and syntax (`node --check desktop/server/overlayServer.js`).

## Test Script
`desktop/tests/test-ranking-server-settings.js`:
Instantiate `OverlayServer(3336)` or check methods directly. Verify:
- `snap.topLikersTheme === 'Purple'`
- `snap.topLikersScale === 1.0`
- `snap.viewerRankingTheme === 'Purple'`
- `snap.viewerRankingScale === 1.0`
- Continuous accumulation of `currentTimeSec` across repeated join events without zeroing out.
- Leave/timeout stops session and preserves `bestTimeSec`.

## Deliverables
- Commit: `feat(rankings): add theme/scale schema and fix stay timer continuity in overlayServer`
- Report: `.superpowers/sdd/ranking-customization/task-1-report.md`
- Diff: `.superpowers/sdd/ranking-customization/task-1-review-package.diff`

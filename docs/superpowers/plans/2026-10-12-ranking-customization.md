# Ranking Overlays Customization & Stay Timer Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide Size Sliders (50% to 150%) and Plain Color Themes (`Purple`, `Pink`, `Blue`, `Green`, `Dark`, `Light`) for both Viewer Stay Ranking and Top Likers Ranking overlays with live Studio sync, real-time dashboard previews, and reliable stay timer persistence.

**Architecture:** Extend overlay server settings schema with theme and scale properties; fix stay timer logic so active viewers in room do not falsely reset on repeated join events; add GPU-accelerated CSS theme palettes and transforms to `viewerranking.html` and `toplikers.html`; add slider and dropdown controls to the dashboard with live preview synchronization.

**Tech Stack:** Node.js, WebSocket (`ws`), HTML5/CSS3 CSS variables, Vanilla JavaScript, Electron IPC.

**Spec:** [docs/superpowers/specs/2026-10-12-ranking-customization-design.md](file:///e:/download/shing/docs/superpowers/specs/2026-10-12-ranking-customization-design.md)

## Global Constraints

- Strictly NO emojis in source code, option labels, HTML templates, comments, or data schemas.
- Color themes must strictly use plain color names: `Purple` (Default), `Pink`, `Blue`, `Green`, `Dark`, `Light`.
- Size slider range: 50% (`0.5`) to 150% (`1.5`), step `0.05`, default `1.0`.
- Real-time live synchronization over WebSocket with zero latency.
- Existing leaderboard data structures and Matter.js jar logic remain intact.

## Review Focus

- Invalid theme names falling back gracefully to `Purple`.
- Scale slider values clamped within `[0.5, 1.5]` to prevent zero or negative dimensions.
- Active viewer stay duration continuously accumulating across multiple join/chat events without resetting.
- Viewer leaving/timing out stopping active timer and preserving `bestTimeSec`.
- Overlay WebSocket reconnection preserving currently selected theme and scale.

---

### Task 1: Server Settings Schema & Stay Timer Continuity Fix

**Files:**
- Modify: `desktop/server/overlayServer.js:230-385, 415-445`
- Test: `desktop/tests/test-ranking-server-settings.js`

**Interfaces:**
- Consumes: Incoming `settings:update` and `rankings:config` messages from WebSocket clients.
- Produces: `getRankingsSnapshot()` with `topLikersTheme`, `topLikersScale`, `viewerRankingTheme`, `viewerRankingScale`, and reliable session tracking without 15s reset bug.

- [ ] **Step 1: Write failing test for server settings schema and stay timer continuity**

Create `desktop/tests/test-ranking-server-settings.js`:
```javascript
const assert = require('assert');
const OverlayServer = require('../server/overlayServer');

const server = new OverlayServer(3336);
const snap = server.getRankingsSnapshot();

assert.strictEqual(snap.topLikersTheme, 'Purple', 'Default topLikersTheme should be Purple');
assert.strictEqual(snap.topLikersScale, 1.0, 'Default topLikersScale should be 1.0');
assert.strictEqual(snap.viewerRankingTheme, 'Purple', 'Default viewerRankingTheme should be Purple');
assert.strictEqual(snap.viewerRankingScale, 1.0, 'Default viewerRankingScale should be 1.0');

// Test stay timer continuity: multiple join events must NOT reset active viewer session
server.processRankingEvent({ type: 'join', username: 'TestViewer', nickname: 'TestViewer' });
const v1 = server.viewerStay.get('testviewer');
assert(v1, 'Viewer should exist in viewerStay map');
assert.strictEqual(v1.isPresent, true, 'Viewer should be present');

// Fast forward session
v1.sessionStartAt = Date.now() - 30000;
v1.currentTimeSec = 30;

// Re-send join event after 20 seconds (simulating TikTok repeated member event)
server.processRankingEvent({ type: 'join', username: 'TestViewer', nickname: 'TestViewer' });
const v2 = server.viewerStay.get('testviewer');
assert.strictEqual(v2.currentTimeSec, 30, 'Active viewer timer must not reset on subsequent join');

console.log('Task 1 ranking server test passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-ranking-server-settings.js`
Expected: FAIL (missing theme/scale fields or timer reset).

- [ ] **Step 3: Update `desktop/server/overlayServer.js`**

1. In `defaultSettings()`:
   ```javascript
   rankings: {
     topLikersCount: 3,
     topLikersTheme: 'Purple',
     topLikersScale: 1.0,
     viewerRankingCount: 3,
     viewerRankingTheme: 'Purple',
     viewerRankingScale: 1.0,
     leaveTimeoutMin: 5
   }
   ```
2. In `getRankingsSnapshot()`:
   Include `topLikersTheme`, `topLikersScale`, `viewerRankingTheme`, `viewerRankingScale`.
3. In `processRankingEvent()`:
   When `v.isPresent` is `true`, do not wipe `v.sessionStartAt` or reset `v.currentTimeSec = 0` on `join`. Only update `v.lastSeenAt = now`. If `v.isPresent === false`, reset session to begin a fresh timer.

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-ranking-server-settings.js`
Expected: PASS ("Task 1 ranking server test passed!").

- [ ] **Step 5: Commit Task 1**

```bash
git add desktop/server/overlayServer.js desktop/tests/test-ranking-server-settings.js
git commit -m "feat(rankings): add theme/scale schema and fix stay timer continuity in overlayServer"
```

---

### Task 2: Overlay Color Themes & GPU Scaling for Stay Ranking & Top Likers

**Files:**
- Modify: `desktop/overlays/viewerranking.html:15-110, 325-360`
- Modify: `desktop/overlays/toplikers.html:15-110, 285-325`
- Test: `desktop/tests/test-ranking-overlay-themes.js`

**Interfaces:**
- Consumes: `init`, `settings:update`, `rankings:update` WebSocket messages containing `theme` and `scale`.
- Produces: `data-theme` attribute on root container with styles for `Purple`, `Pink`, `Blue`, `Green`, `Dark`, `Light`, and `transform: scale(var(--ranking-scale))` scaling.

- [ ] **Step 1: Write test for overlay theme classes and CSS scaling**

Create `desktop/tests/test-ranking-overlay-themes.js`:
```javascript
const fs = require('fs');
const assert = require('assert');

const stayHtml = fs.readFileSync('desktop/overlays/viewerranking.html', 'utf8');
const likersHtml = fs.readFileSync('desktop/overlays/toplikers.html', 'utf8');

const themes = ['Purple', 'Pink', 'Blue', 'Green', 'Dark', 'Light'];

themes.forEach(theme => {
  assert(stayHtml.includes(`[data-theme="${theme}"]`), `viewerranking.html missing CSS for theme ${theme}`);
  assert(likersHtml.includes(`[data-theme="${theme}"]`), `toplikers.html missing CSS for theme ${theme}`);
});

assert(stayHtml.includes('--ranking-scale'), 'viewerranking.html missing --ranking-scale variable');
assert(likersHtml.includes('--ranking-scale'), 'toplikers.html missing --ranking-scale variable');

console.log('Task 2 overlay themes test passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-ranking-overlay-themes.js`
Expected: FAIL (missing theme selectors and variables).

- [ ] **Step 3: Update `desktop/overlays/viewerranking.html` and `desktop/overlays/toplikers.html`**

1. Add CSS rules for `[data-theme="Purple"]`, `[data-theme="Pink"]`, `[data-theme="Blue"]`, `[data-theme="Green"]`, `[data-theme="Dark"]`, `[data-theme="Light"]` on `#viewer-ranking-root` and `#toplikers-root`.
2. Apply `transform: scale(var(--ranking-scale, 1.0)); transform-origin: top left;`.
3. In `applySettings(s)`: read `s.rankings.viewerRankingTheme`, `s.rankings.viewerRankingScale`, `s.rankings.topLikersTheme`, `s.rankings.topLikersScale`, updating `dataset.theme` and `style.setProperty('--ranking-scale', scale)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-ranking-overlay-themes.js`
Expected: PASS ("Task 2 overlay themes test passed!").

- [ ] **Step 5: Commit Task 2**

```bash
git add desktop/overlays/viewerranking.html desktop/overlays/toplikers.html desktop/tests/test-ranking-overlay-themes.js
git commit -m "feat(rankings): add 6 plain color themes and GPU scaling to ranking overlays"
```

---

### Task 3: Dashboard Controls & Dynamic Preview Cards

**Files:**
- Modify: `desktop/renderer/index.html:280-350`
- Modify: `desktop/renderer/styles.css:1200-1350`
- Modify: `desktop/renderer/app.js:2390-2450`
- Test: `desktop/tests/test-ranking-dashboard-ui.js`

**Interfaces:**
- Consumes: Streamer input on theme dropdowns and scale sliders.
- Produces: Immediate visual update of `#ov-demo-viewerranking-rows` and `#ov-demo-toplikers-rows`, broadcast to overlay server, and persistence in `appSettings.rankings`.

- [ ] **Step 1: Write test for dashboard ranking elements and preview updates**

Create `desktop/tests/test-ranking-dashboard-ui.js`:
```javascript
const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('desktop/renderer/index.html', 'utf8');

assert(html.includes('id="ranking-toplikers-theme"'), 'Missing ranking-toplikers-theme select');
assert(html.includes('id="ranking-toplikers-scale"'), 'Missing ranking-toplikers-scale slider');
assert(html.includes('id="ranking-toplikers-scale-badge"'), 'Missing ranking-toplikers-scale-badge');
assert(html.includes('id="ranking-viewers-theme"'), 'Missing ranking-viewers-theme select');
assert(html.includes('id="ranking-viewers-scale"'), 'Missing ranking-viewers-scale slider');
assert(html.includes('id="ranking-viewers-scale-badge"'), 'Missing ranking-viewers-scale-badge');

const themes = ['Purple', 'Pink', 'Blue', 'Green', 'Dark', 'Light'];
themes.forEach(t => {
  assert(html.includes(`<option value="${t}"`), `Missing option for theme ${t}`);
});

console.log('Task 3 dashboard UI test passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-ranking-dashboard-ui.js`
Expected: FAIL (missing DOM elements).

- [ ] **Step 3: Update `index.html`, `styles.css`, and `app.js`**

1. In `index.html`: Add Theme dropdowns (`Purple`, `Pink`, `Blue`, `Green`, `Dark`, `Light`), Size Sliders (`0.5` to `1.5`, step `0.05`), and scale badges to both ranking cards.
2. In `styles.css`: Add styling for preview card themes (`.stay-theme[data-theme="..."]`, `.likers-theme[data-theme="..."]`), scale controls, and badges.
3. In `app.js`: Wire input/change events to update settings, update preview card themes and scales dynamically, and broadcast to server. Update preview rows on test events.

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-ranking-dashboard-ui.js`
Expected: PASS ("Task 3 dashboard UI test passed!").

- [ ] **Step 5: Commit Task 3**

```bash
git add desktop/renderer/index.html desktop/renderer/styles.css desktop/renderer/app.js desktop/tests/test-ranking-dashboard-ui.js
git commit -m "feat(rankings): add theme dropdowns, scale sliders, and dynamic dashboard previews"
```

---

### Task 4: End-to-End Verification, Version Bump (v1.4.1), & Release Packaging

**Files:**
- Modify: `desktop/package.json`
- Modify: `desktop/releases.json`
- Modify: `desktop/renderer/app.js`

- [ ] **Step 1: Run all unit and integration tests**

```bash
node desktop/tests/test-ranking-server-settings.js
node desktop/tests/test-ranking-overlay-themes.js
node desktop/tests/test-ranking-dashboard-ui.js
node desktop/tests/test-jar-transform-server.js
node desktop/tests/test-jar-overlay-transform.js
node desktop/tests/test-jar-dashboard-elements.js
node desktop/tests/test-jar-drag-math.js
```
Expected: All 7 tests PASS.

- [ ] **Step 2: Update version to 1.4.1**

1. `desktop/package.json`: `"version": "1.4.1"`
2. `desktop/releases.json`: Add `1.4.1` release entry documenting ranking size sliders, plain color themes, live sync, and stay timer fix.
3. `desktop/renderer/app.js`: Add `1.4.1` entry in fallback changelog.

- [ ] **Step 3: Package release archive and sync app**

```powershell
powershell -ExecutionPolicy Bypass -File desktop\package-update.ps1 -Version "1.4.1"
```
Expected: PASS (generates `shing-live-v1.4.1.zip` and updates `releases.json`).

- [ ] **Step 4: Commit Task 4**

```bash
git add desktop/package.json desktop/releases.json desktop/renderer/app.js desktop/updates/shing-live-v1.4.1.zip
git commit -m "chore(release): bump version to v1.4.1 and package ranking customization release archive"
```

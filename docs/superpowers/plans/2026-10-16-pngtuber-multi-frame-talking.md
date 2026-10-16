# Multi-Frame Conversational Talking Animation & Natural Resting Mouth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a natural multi-frame conversational mouth-flap animation cycle and resting mouth pause settle for the PNGTuber Studio in Shing Live, designed for soft-spoken streamers on low-end hardware.

**Architecture:** Extend the PNGTuber avatar state engine across the Electron Desktop App and OBS browser overlays to cycle between `talk_half` and `talk_open` at standard conversational cadence (~120ms) upon threshold trigger. When voice pauses, hold `talk_half` during `holdDelay` before returning to `idle`. Support concurrent eye blinks across all mouth states, add a 6-slot studio avatar grid and 3-mode toggle in the dashboard, and distribute state changes via WebSocket with zero drop-shadow repaints.

**Tech Stack:** Vanilla JavaScript (ES2022), HTML5 Canvas/DOM, Web Audio API (AnalyserNode FFT 256), WebSockets (`ws`), CSS Hardware Acceleration, Node.js.

**Spec:** `docs/superpowers/specs/2026-10-16-pngtuber-multi-frame-talking-design.md`

## Global Constraints
- Strictly ZERO emojis in source code, option labels, HTML templates, comments, or data schemas.
- Strictly ZERO mentions of the forbidden name "AkiWren".
- Zero external runtime image processing dependencies (pre-generate and commit static PNG assets <100 KB).
- Maximum memory and CPU efficiency for low-end PC streaming (25Hz audio poll, 256 FFT, zero drop-shadow filters, async `img.decode()`).
- Backward compatibility: Fall back cleanly to 2-frame or 4-frame behavior when custom avatars omit half-open frames.

## Review Focus
- Soft-spoken voice detection: Cadence mouth flapping activates based on threshold crossing rather than amplitude scaling to eliminate speech fluttering.
- Natural resting mouth pause: When volume drops below threshold, mouth settles into `talk_half` throughout the entire `holdDelay` buffer before closing to `idle`.
- Blink superposition: Blinking during speech shows `talkHalfBlink` when in `talk_half` and `talkBlink` when in `talk_open`.
- OBS browser source sync: Desktop app broadcasts `{ talking: true, paused: true, state: 'paused' }` so remote overlays stay synchronized with the rest pause.
- Mode toggle flexibility: Supports `2-frame`, `4-frame`, and `multi-frame` modes with clean state enforcement.

---

### Task 1: Multi-Frame PNG Assets Generation & Integrity Suite

**Files:**
- Create: `desktop/scripts/generate-pngtuber-talkhalf-assets.js`
- Create: `desktop/assets/pngtuber/shing_talk_half.png`
- Create: `desktop/assets/pngtuber/shing_talk_half_blink.png`
- Create: `desktop/assets/pngtuber/pixelcat_talk_half.png`
- Create: `desktop/assets/pngtuber/pixelcat_talk_half_blink.png`
- Create: `desktop/tests/test-pngtuber-assets-integrity.js`

**Interfaces:**
- Consumes: Existing base assets `desktop/assets/pngtuber/shing_idle.png`, `shing_talk.png`, `pixelcat_idle.png`, `pixelcat_talk.png`.
- Produces: 4 new static PNG assets (<100 KB each) with valid PNG magic headers and matching resolutions (520x430 for Shing, 496x472 for Pixel Cat).

- [ ] **Step 1: Write the failing asset integrity test**

```javascript
// desktop/tests/test-pngtuber-assets-integrity.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'assets', 'pngtuber');
const required = [
  'shing_idle.png', 'shing_blink.png', 'shing_talk_half.png', 'shing_talk_half_blink.png',
  'shing_talk.png', 'shing_talk_blink.png', 'shing_happy.png',
  'pixelcat_idle.png', 'pixelcat_blink.png', 'pixelcat_talk_half.png', 'pixelcat_talk_half_blink.png',
  'pixelcat_talk.png', 'pixelcat_talk_blink.png', 'pixelcat_happy.png'
];

for (const name of required) {
  const filePath = path.join(dir, name);
  assert.ok(fs.existsSync(filePath), `Asset ${name} must exist`);
  const buf = fs.readFileSync(filePath);
  assert.strictEqual(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name} must be a valid PNG`);
  assert.ok(buf.length < 100000, `${name} must be under 100 KB (got ${buf.length} bytes)`);
}
console.log('All PNGTuber assets verified successfully!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-pngtuber-assets-integrity.js`
Expected: FAIL with missing `shing_talk_half.png`.

- [ ] **Step 3: Implement asset synthesis script and generate the 4 new frames**

Implement `desktop/scripts/generate-pngtuber-talkhalf-assets.js` using Node.js Buffer and zlib to extract/composite the parted mouth frame:
- For `pixelcat_talk_half.png` and `pixelcat_talk_half_blink.png`: synthesize 1px parted mouth on the 64x64 grid.
- For `shing_talk_half.png` and `shing_talk_half_blink.png`: composite the cute parted lips mouth region (subtle upper tooth, gentle pink opening) onto `shing_idle.png` and `shing_blink.png` with crisp pixel fidelity.
Execute: `node desktop/scripts/generate-pngtuber-talkhalf-assets.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-pngtuber-assets-integrity.js`
Expected: PASS with 14 verified PNG assets.

- [ ] **Step 5: Commit**

```bash
git add desktop/assets/pngtuber/ desktop/scripts/generate-pngtuber-talkhalf-assets.js desktop/tests/test-pngtuber-assets-integrity.js
git commit -m "feat(pngtuber): generate and verify 7-frame multi-frame talking assets for Shing and Pixel Cat"
```

---

### Task 2: Backend Settings Schema & Overlay Server Protocol

**Files:**
- Modify: `desktop/server/overlayServer.js`
- Modify: `desktop/tests/test-pngtuber-server-settings.js`

**Interfaces:**
- Consumes: Asset paths from Task 1.
- Produces: Default settings schema with `talkHalf`, `talkHalfBlink`, mode `multi-frame`, and WebSocket broadcast supporting `{ talking, paused, state }`.

- [ ] **Step 1: Write the failing test for server settings and state broadcast**

Update `desktop/tests/test-pngtuber-server-settings.js` to assert:
- `getDefaultSettings().pngtuber.mode === 'multi-frame'`
- `getDefaultSettings().pngtuber.images.talkHalf === '/assets/pngtuber/shing_talk_half.png'`
- `getDefaultSettings().pngtuber.images.talkHalfBlink === '/assets/pngtuber/shing_talk_half_blink.png'`
- POST `/api/pngtuber/state` accepts `{ talking: true, paused: true, state: 'paused' }` and broadcasts `paused: true`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-pngtuber-server-settings.js`
Expected: FAIL due to missing `talkHalf` in default schema.

- [ ] **Step 3: Update `desktop/server/overlayServer.js`**

- In `getDefaultSettings()`: Add `talkHalf` and `talkHalfBlink` to `images`, set `mode: 'multi-frame'`, and define preset maps for `shing` and `pixelcat`.
- In `/api/pngtuber/state`: Validate `paused = Boolean(req.body.paused)` and include in WebSocket broadcast message.

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-pngtuber-server-settings.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/server/overlayServer.js desktop/tests/test-pngtuber-server-settings.js
git commit -m "feat(pngtuber): update server settings schema and websocket protocol for multi-frame talking and pause state"
```

---

### Task 3: Standalone OBS Overlay Conversational Animation Engine

**Files:**
- Modify: `desktop/overlays/pngtuber.html`
- Modify: `pngtuber.html` (root mirror)
- Modify: `desktop/tests/test-pngtuber-overlay-markup.js`
- Modify: `desktop/tests/test-pngtuber-audio-and-state-transitions.js`

**Interfaces:**
- Consumes: WebSocket `pngtuber:state` messages and `config.images` from Task 2.
- Produces: Smooth conversational mouth-flap cycle (~120ms cadence), resting mouth pause settle during `holdDelay`, and blink superposition.

- [ ] **Step 1: Write the failing overlay test**

Update `desktop/tests/test-pngtuber-overlay-markup.js` and `desktop/tests/test-pngtuber-audio-and-state-transitions.js` to assert:
- Preloading covers `talkHalf` and `talkHalfBlink`.
- State engine cycles mouth shapes (`0 = talk_half`, `1 = talk_open`) when `isTalking` is true.
- When `isPaused` is true, mouth pins to `talk_half` and maintains speaking bounce.
- Exact mirror match between `desktop/overlays/pngtuber.html` and root `pngtuber.html`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-pngtuber-overlay-markup.js`
Expected: FAIL due to missing mouth-flap cadence logic.

- [ ] **Step 3: Implement conversational animation engine in `desktop/overlays/pngtuber.html` and sync root mirror**

- Implement `talkFlapInterval = 120ms` cadence timer.
- Implement `resolveFrame()` matching Section 4.B of the design spec.
- Handle WebSocket `pngtuber:state` payload `{ talking, paused }`.
- Copy changes to root `pngtuber.html`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-pngtuber-overlay-markup.js`
Run: `node desktop/tests/test-pngtuber-audio-and-state-transitions.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/overlays/pngtuber.html pngtuber.html desktop/tests/test-pngtuber-overlay-markup.js desktop/tests/test-pngtuber-audio-and-state-transitions.js
git commit -m "feat(pngtuber): implement conversational mouth-flap cycle and resting mouth pause in obs overlay"
```

---

### Task 4: Desktop Dashboard Studio Integration

**Files:**
- Modify: `desktop/renderer/index.html`
- Modify: `desktop/renderer/app.js`
- Modify: `desktop/renderer/styles.css`
- Modify: `desktop/tests/test-pngtuber-dashboard-ui.js`

**Interfaces:**
- Consumes: Settings schema from Task 2 and overlay logic from Task 3.
- Produces: 6-slot avatar upload grid, 3-mode pill toggle (`2-Frame`, `4-Frame`, `Multi-Frame`), live stage preview mouth-flap sync, and pause-aware audio emission.

- [ ] **Step 1: Write the failing dashboard UI test**

Update `desktop/tests/test-pngtuber-dashboard-ui.js` to assert:
- `data-slot="talkHalf"` dropzone exists in `index.html`.
- `data-mode="multi-frame"` button exists in `index.html`.
- Status badge supports `PAUSED / REST`.
- Audio analyser logic emits `{ talking: true, paused: true, state: 'paused' }` during `holdDelay`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-pngtuber-dashboard-ui.js`
Expected: FAIL due to missing slot and mode button.

- [ ] **Step 3: Implement Dashboard UI and Audio Engine in `index.html`, `app.js`, and `styles.css`**

- In `desktop/renderer/index.html`:
  - Add `Multi-Frame Mode` button to `.mode-pill-toggle`.
  - Add Slot 3: `Talking Parted (Half-Open)` dropzone (`data-slot="talkHalf"`), positioning it between Blink Idle and Talking Full.
- In `desktop/renderer/styles.css`:
  - Adjust `.avatar-slots-grid` to accommodate 6 slots responsively.
  - Add `.badge-status-paused` styling.
- In `desktop/renderer/app.js`:
  - Update `initPngTuberStudio()` slot bindings for `talkHalf`.
  - Implement mouth-flap cadence and pause settle in the live stage preview.
  - Update mic monitoring loop: when volume drops below threshold, set `isPaused = true`, emit `{ talking: true, paused: true, state: 'paused' }`, and only emit `{ talking: false, paused: false, state: 'idle' }` after `holdDelay` expires.

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-pngtuber-dashboard-ui.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/renderer/index.html desktop/renderer/app.js desktop/renderer/styles.css desktop/tests/test-pngtuber-dashboard-ui.js
git commit -m "feat(pngtuber): add 6-slot studio grid, 3-mode toggle, and live stage multi-frame talking sync"
```

---

### Task 5: End-to-End Test Suite Verification & Version Bump

**Files:**
- Modify: `desktop/package.json`
- Modify: `desktop/releases.json`
- Test: All 5 test suites in `desktop/tests/`

**Interfaces:**
- Consumes: All components from Tasks 1-4.
- Produces: 100% test pass rate across all suites, zero emojis, verified deployment mirror, and version bump to v1.6.0.

- [ ] **Step 1: Run all test suites**

```bash
node desktop/tests/test-pngtuber-assets-integrity.js
node desktop/tests/test-pngtuber-server-settings.js
node desktop/tests/test-pngtuber-overlay-markup.js
node desktop/tests/test-pngtuber-audio-and-state-transitions.js
node desktop/tests/test-pngtuber-dashboard-ui.js
```
Expected: All 5 test suites pass with 100% success.

- [ ] **Step 2: Run zero-emojis forensic scan**

```powershell
Get-ChildItem -Path desktop/renderer, desktop/overlays, desktop/server, desktop/tests, pngtuber.html -Recurse -Include *.html,*.js,*.css | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    if ($content -match '[\uD83C-\uDBFF\uDC00-\uDFFF]') {
        Write-Error "Emoji detected in $($_.FullName)"
    }
}
```
Expected: Zero emojis detected.

- [ ] **Step 3: Update `package.json` and `releases.json` to v1.6.0**

- [ ] **Step 4: Commit**

```bash
git add desktop/package.json desktop/releases.json
git commit -m "release: bump version to v1.6.0 (multi-frame conversational talking and natural resting mouth)"
```

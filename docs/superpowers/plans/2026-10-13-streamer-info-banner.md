# Streamer Info Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide an independent 1:1 centered browser source overlay (`desktop/overlays/banner.html`) displaying the streamer's animated chibi avatar, bio blurb, and social handles, with selectable upper toppers (bear, ribbon, cat, none), continuous motion animations (float, sway, pulse, breathe, bounce), and live size slider controls synchronized via WebSocket.

**Architecture:** Add `banner` configuration to `desktop/server/overlayServer.js` and `desktop/settings.json`. Create `desktop/overlays/banner.html` as an independent 1:1 overlay connecting to the WebSocket server for real-time updates. Add a "Streamer Info Banner" card to the Overlays grid and a full customization panel with size slider in `desktop/renderer/index.html` and `app.js`. Sync to root `banner.html` for web hosting.

**Tech Stack:** Node.js, WebSocket (ws), Vanilla HTML5/CSS3, HTML5 Canvas 2D, Electron IPC.

**Spec:** `docs/superpowers/specs/2026-10-13-streamer-info-banner-design.md`

## Global Constraints
- Strictly 0 emojis in code, markup, styles, templates, comments, or schemas.
- 1:1 square aspect ratio centered within the stream viewport.
- Size slider scales from 0.50 to 1.50 with default 1.00 (step 0.05).
- Independent browser source served at `/overlays/banner.html`.
- Real-time updates via WebSocket `settings:update` without page reload.

## Review Focus
1. Scale slider boundary clamping: values below 0.50 or above 1.50 clamp gracefully to 0.50 and 1.50.
2. Missing or partial social handles: omitted or empty social links render cleanly without broken layout or empty icon boxes.
3. Topper selection switching: switching to `none` completely hides the topper element without leaving offset whitespace.
4. WebSocket reconnection resilience: if the overlay loads before the server or the server restarts, it reconnects automatically within 2 seconds.
5. Character customization synchronization: when hair or outfit colors change in companion settings, the banner avatar updates its palette immediately.

---

### Task 1: Backend Settings Schema & Overlay Server Integration

**Files:**
- Modify: `desktop/server/overlayServer.js`
- Modify: `desktop/settings.json`
- Test: `desktop/tests/test-banner-server-settings.js`

**Interfaces:**
- Produces: `settings.banner` object in `overlayServer.getDefaultSettings()` and `/api/settings` response.
- Produces: HTTP route `/overlays/banner.html` serving the overlay file.

- [ ] **Step 1: Write unit test for banner server settings**

Create `desktop/tests/test-banner-server-settings.js` verifying:
- `getDefaultSettings()` includes `banner` with `enabled`, `scale`, `topper`, `animation`, `name`, `subtitle`, `bio`, and `socials`.
- Scale boundary clamping logic (e.g. `clamp(scale, 0.5, 1.5)`).
- Route `/overlays/banner.html` responds with 200 OK.
- WebSocket `settings:update` payload includes `banner`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-banner-server-settings.js`
Expected: FAIL (banner settings not yet defined).

- [ ] **Step 3: Implement banner defaults and validation in `desktop/server/overlayServer.js`**

- In `desktop/server/overlayServer.js` under `getDefaultSettings()`:
  ```javascript
  banner: {
    enabled: true,
    scale: 1.0,
    topper: 'bear',
    animation: 'float',
    name: 'AkiWren',
    subtitle: 'Cozy Variety Streamer',
    bio: 'Welcome to the cozy corner! Streaming daily games, art, and chill chats.',
    socials: {
      twitch: 'AkiWren',
      tiktok: '@akiwren_live',
      discord: 'discord.gg/akiwren',
      twitter: '@akiwren',
      instagram: '',
      youtube: ''
    }
  }
  ```
- Ensure `settings.banner.scale` is clamped between `0.50` and `1.50`.
- Update `desktop/settings.json` to include the default `banner` block.

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-banner-server-settings.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/server/overlayServer.js desktop/settings.json desktop/tests/test-banner-server-settings.js
git commit -m "feat(banner): add banner settings schema and server defaults"
```

---

### Task 2: Standalone Overlay DOM, Animations, Vector Toppers & Chibi Avatar

**Files:**
- Create: `desktop/overlays/banner.html`
- Test: `desktop/tests/test-banner-overlay-markup.js`

**Interfaces:**
- Consumes: `settings.banner` and `settings.companion` from `/api/settings` and WebSocket `settings:update`.
- Produces: Fully interactive 1:1 centered overlay at `http://localhost:3333/overlays/banner.html`.

- [ ] **Step 1: Write markup and behavior test for `banner.html`**

Create `desktop/tests/test-banner-overlay-markup.js` verifying:
- Contains `#streamer-banner-container` with `aspect-ratio: 1 / 1` and `transform: translate(-50%, -50%)`.
- Contains SVG toppers for `bear`, `ribbon`, and `cat`, with proper visibility toggling.
- Contains CSS animation classes: `anim-float`, `anim-sway`, `anim-pulse`, `anim-breathe`, and `anim-bounce`.
- Contains `<canvas id="banner-avatar-canvas" width="64" height="64">`.
- Contains WebSocket client connecting to `/ws` with automatic reconnection.
- Contains zero emojis in text and markup.

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-banner-overlay-markup.js`
Expected: FAIL (file does not exist).

- [ ] **Step 3: Implement `desktop/overlays/banner.html`**

- Build clean, self-contained HTML page:
  - Fixed 100vw/100vh transparent viewport with centered `#streamer-banner-container`.
  - Scaled by `var(--banner-scale, 1)`.
  - Pixel-art styled card border with pastel glassmorphism background matching companion palette.
  - SVG Toppers positioned on the top border:
    - Little Bear with cute paws hugging the top edge.
    - Satin Ribbon bow tied at top center.
    - Cozy sleeping/peeking Cat.
  - Avatar canvas running an idle breathing/blinking loop with current companion colors (`settings.companion.hc`, `oc`, `hair`).
  - Streamer Name, Subtitle, Divider, and Bio text.
  - Socials grid dynamically displaying icons only for non-empty social handles.
  - CSS keyframes for 5 continuous motion styles: `float`, `sway`, `pulse`, `breathe`, `bounce`.
  - WebSocket handler for `settings:update` and fallback fetch `/api/settings`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-banner-overlay-markup.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/overlays/banner.html desktop/tests/test-banner-overlay-markup.js
git commit -m "feat(banner): create standalone 1:1 banner overlay with toppers and animations"
```

---

### Task 3: Desktop Dashboard Integration & Companion Controls

**Files:**
- Modify: `desktop/renderer/index.html`
- Modify: `desktop/renderer/app.js`
- Test: `desktop/tests/test-banner-dashboard-ui.js`

**Interfaces:**
- Consumes: `settings.banner` from `overlayServer`.
- Produces: Overlay card in "Browser Overlays" grid with Copy/Preview actions.
- Produces: Banner customization panel with real-time size slider, topper selector, motion selector, and text inputs.

- [ ] **Step 1: Write unit test for dashboard UI controls**

Create `desktop/tests/test-banner-dashboard-ui.js` verifying:
- `desktop/renderer/index.html` contains the "Streamer Info Banner" overlay card with copyable URL `http://localhost:3333/overlays/banner.html`.
- `desktop/renderer/index.html` contains `#banner-enable-toggle`, `#banner-scale-slider`, `#banner-scale-badge`, `#banner-topper-select`, and `#banner-anim-select`.
- `desktop/renderer/app.js` contains event binding for banner controls and triggers `saveSettingsDebounced()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-banner-dashboard-ui.js`
Expected: FAIL (dashboard elements not yet added).

- [ ] **Step 3: Implement dashboard UI in `index.html` and `app.js`**

- In `desktop/renderer/index.html`:
  - Add an overlay card to the "Browser Overlays" grid:
    - Title: "Streamer Info Banner"
    - Subtitle: "1:1 Centered About Me & Socials Widget"
    - URL: `http://localhost:3333/overlays/banner.html`
    - Action buttons: "Copy URL", "Preview".
  - Add a dedicated "Streamer Info Banner (1:1)" card to the Companion tab (or Overlays settings):
    - Checkbox: "Enable Banner on Stream" (`#banner-enable-toggle`)
    - Size slider: range 0.50 to 1.50, step 0.05 (`#banner-scale-slider`) with badge (`#banner-scale-badge`)
    - Dropdown: "Decorative Topper" (`bear`, `ribbon`, `cat`, `none`)
    - Dropdown: "Motion Style" (`float`, `sway`, `pulse`, `breathe`, `bounce`)
    - Text inputs: Name, Subtitle, Bio/Schedule, Twitch, TikTok, Discord, Twitter/X, Instagram, YouTube.
- In `desktop/renderer/app.js`:
  - Populate inputs from `settings.banner`.
  - Bind change/input listeners to update `settings.banner` and call `saveSettingsDebounced()`.
  - Update `#banner-scale-badge` text on slider input.

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-banner-dashboard-ui.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/renderer/index.html desktop/renderer/app.js desktop/tests/test-banner-dashboard-ui.js
git commit -m "feat(banner): add dashboard overlay card and customization controls"
```

---

### Task 4: Web Deployment Sync & End-to-End Verification

**Files:**
- Create: `banner.html` (root directory)
- Modify: `deploy.ps1`
- Test: `desktop/tests/test-banner-e2e-sync.js`

**Interfaces:**
- Produces: Standalone web-deployable `banner.html` in project root matching `desktop/overlays/banner.html`.

- [ ] **Step 1: Write test for web mirror sync and clean code audit**

Create `desktop/tests/test-banner-e2e-sync.js` verifying:
- Root `banner.html` exists and matches `desktop/overlays/banner.html` (with standalone fallback data if offline).
- `deploy.ps1` includes `banner.html` in deployment sync.
- Zero emojis exist across all newly created or modified files.

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-banner-e2e-sync.js`
Expected: FAIL.

- [ ] **Step 3: Create root `banner.html` and update `deploy.ps1`**

- Create `banner.html` in the root repository.
- Ensure `deploy.ps1` transfers `banner.html` to the remote FTP server.
- Run all banner test suites to confirm 100% pass rate.

- [ ] **Step 4: Run all tests to verify they pass**

Run:
```powershell
node desktop/tests/test-banner-server-settings.js
node desktop/tests/test-banner-overlay-markup.js
node desktop/tests/test-banner-dashboard-ui.js
node desktop/tests/test-banner-e2e-sync.js
```
Expected: All 4 test suites PASS.

- [ ] **Step 5: Commit**

```bash
git add banner.html deploy.ps1 desktop/tests/test-banner-e2e-sync.js
git commit -m "feat(banner): sync root banner.html for web hosting and complete test suite"
```

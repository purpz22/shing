# Purplez Live Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Purplez Live Studio in `e:\download\purplez`, a standalone desktop streaming application and OBS overlay suite for male TikTok Live streamer Purplez, featuring a simple dark-slate/violet theme, a diagonal banner slash trigger alert, a male chibi streamer accompanied by cute pixel cats, and complete transferred overlays from Shing Studio without modifying the original installation.

**Architecture:** Electron desktop host running an internal Node.js HTTP/WebSocket server (`OverlayServer`) that connects to TikTok Live (`tiktok-live-connector`) and serves real-time OBS browser source overlays. Overlays use lightweight hardware-accelerated CSS transforms (`clip-path`, `transform`), Canvas 2D/Matter.js physics, and Web Audio API synthesis for zero OBS overhead. Application settings and user data are isolated in `%APPDATA%\Purplez Live`.

**Tech Stack:** Electron 31, Node.js 20+, WebSocket (`ws`), Matter.js, Web Audio API, WebCodecs, vanilla HTML5/CSS3/ES2022.

**Spec:** [docs/superpowers/specs/2026-10-17-purplez-studio-design.md](file:///e:/download/shing/docs/superpowers/specs/2026-10-17-purplez-studio-design.md)

## Global Constraints

- Standalone target workspace root: `e:\download\purplez` (`e:\download\purplez\desktop`).
- Source installation in `e:\download\shing` must remain completely untouched.
- Zero emojis in source code, HTML templates, CSS styles, comments, or data schemas.
- App identity: name `"purplez-live"`, product name `"Purplez Live"`, app user model ID `"com.purplez.live"`, default username `"purplez"`, data directory `"Purplez Live"`.
- Default visual theme: Simple Obsidian Violet / Dark Slate (flat surfaces, `#12101b` / `#1f1b2e`, `#8b5cf6` primary, crisp 4px/8px/12px border radii, no pastel pink glows).
- Triggers alert banner: pop-up message entrance, hold for display duration, then diagonal slash exit splitting into top-left and bottom-right halves via CSS `clip-path`.
- Companion overlay: male chibi pixel sprite (streetwear hoodie, joggers, sneakers, 6 male hairstyles: `spiky`, `messy`, `undercut`, `parted`, `buzz`, `hoodup` with cat ears) walking alongside 4 cute pixel cat breeds (`purple`, `black`, `calico`, `white`).

## Review Focus

1. **Trigger Alert Timing During Rapid Combos**: When rapid gift streaks arrive while the alert is visible or slashing, verify in-place streak text/coin mutation without spawning orphaned overlay halves.
2. **Legacy Hairstyle Fallback**: When an older profile or test passes a female hairstyle name (e.g., `twintails`, `lowpigtails`, `bun`), verify graceful mapping to `spiky` without sprite renderer crash.
3. **Data Directory Collision**: Verify `resolveUserDataDir()` strictly resolves to `%APPDATA%\Purplez Live` and never mutates `%APPDATA%\Shing Live`.
4. **Web Audio Slash Sound on Muted Channels**: Verify `playSlashSound()` strictly respects universal volume and mute states without throwing audio context exceptions.
5. **Zero Emoji Integrity**: Verify automated test scans all `.js`, `.html`, `.css`, `.json`, and `.md` files in `e:\download\purplez` for non-ASCII emoji codepoints.

---

### Task 1: Scaffolding, Package Identity, and Assets Setup

**Files:**
- Create: `e:\download\purplez\package.json`
- Create: `e:\download\purplez\desktop\package.json`
- Create: `e:\download\purplez\desktop\.gitignore`
- Create: `e:\download\purplez\README.md`
- Create: `e:\download\purplez\desktop\tests\test-purplez-branding-and-assets.js`
- Copy/Link: `e:\download\shing\desktop\assets\` -> `e:\download\purplez\desktop\assets\`
- Link: `e:\download\shing\desktop\node_modules` -> `e:\download\purplez\desktop\node_modules`

**Interfaces:**
- Consumes: Spec Section 14 file manifest, asset structure.
- Produces: Base project structure and `test-purplez-branding-and-assets.js` test runner.

- [ ] **Step 1: Write the failing brand and asset test in `e:\download\purplez\desktop\tests\test-purplez-branding-and-assets.js`**

```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
assert.ok(fs.existsSync(pkgPath), 'package.json must exist');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
assert.strictEqual(pkg.name, 'purplez-live');
assert.strictEqual(pkg.productName, 'Purplez Live');
assert.strictEqual(pkg.author, 'Purplez');

console.log('PASS: package.json brand verification passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node e:\download\purplez\desktop\tests\test-purplez-branding-and-assets.js`
Expected: FAIL (directory or file does not exist).

- [ ] **Step 3: Create directory tree, copy assets and node_modules, write package.json and README.md**

Create `e:\download\purplez\desktop` structure, copy non-code assets (`gifts`, `icons`, `jar`, `petpet`, `pngtuber`, `sounds`), create directory junction for `node_modules` to avoid duplicate disk space, and write `package.json` with `"name": "purplez-live"`, `"productName": "Purplez Live"`, `"version": "1.0.0"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node e:\download\purplez\desktop\tests\test-purplez-branding-and-assets.js`
Expected: PASS with "package.json brand verification passed".

- [ ] **Step 5: Commit workspace setup**

```bash
git add .
git commit -m "feat(purplez): initialize Purplez Live standalone workspace scaffolding"
```

---

### Task 2: Electron Main Process, Preload API, and Overlay Server Settings Isolation

**Files:**
- Create: `e:\download\purplez\desktop\main.js`
- Create: `e:\download\purplez\desktop\preload.js`
- Create: `e:\download\purplez\desktop\server\overlayServer.js`
- Create: `e:\download\purplez\desktop\services\updater.js`
- Create: `e:\download\purplez\desktop\tests\test-purplez-server-settings.js`

**Interfaces:**
- Consumes: `package.json` configuration from Task 1.
- Produces: Isolated `%APPDATA%\Purplez Live` settings store, HTTP/WebSocket server, Electron IPC channels (`purplezAPI`).

- [ ] **Step 1: Write the failing server settings isolation test**

```javascript
const assert = require('assert');
const path = require('path');
const OverlayServer = require('../server/overlayServer');

const server = new OverlayServer(3335, path.resolve(__dirname, '..'));
assert.ok(server.userDataDir.includes('Purplez Live'), 'userDataDir must be in Purplez Live path');
const defaults = server.getDefaultSettings();
assert.strictEqual(defaults.username, 'purplez');
assert.strictEqual(defaults.banner.topper, 'cat');
assert.strictEqual(defaults.banner.name, 'Purplez');
assert.strictEqual(defaults.pngtuber.preset, 'pixelcat');
console.log('PASS: Purplez settings defaults verified');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node e:\download\purplez\desktop\tests\test-purplez-server-settings.js`
Expected: FAIL (`overlayServer.js` not found).

- [ ] **Step 3: Implement `main.js`, `preload.js`, and `overlayServer.js` with Purplez Live identity**

Implement `resolveUserDataDir()` targeting `Purplez Live`, default settings with `username: 'purplez'`, `banner.name: 'Purplez'`, `banner.topper: 'cat'`, `pngtuber.preset: 'pixelcat'`, `companion.cats: ['purple', 'black']`. In `main.js`, set `app.name = 'Purplez Live'`, `app.setAppUserModelId('com.purplez.live')`, window title `'Purplez Live'`. In `preload.js`, expose `window.purplezAPI` alongside `window.shingAPI` alias.

- [ ] **Step 4: Run test to verify it passes**

Run: `node e:\download\purplez\desktop\tests\test-purplez-server-settings.js`
Expected: PASS with "Purplez settings defaults verified".

- [ ] **Step 5: Commit server and main process changes**

```bash
git add desktop/main.js desktop/preload.js desktop/server/overlayServer.js desktop/services/updater.js desktop/tests/test-purplez-server-settings.js
git commit -m "feat(purplez): isolate overlay server settings and main process for Purplez Live"
```

---

### Task 3: Simple Purplez Theme System and Iconography

**Files:**
- Create: `e:\download\purplez\desktop\renderer\styles.css`
- Create: `e:\download\purplez\desktop\assets\icons\icons.js`
- Create: `e:\download\purplez\desktop\tests\test-purplez-theme-tokens.js`

**Interfaces:**
- Consumes: Spec Section 2 design tokens.
- Produces: Global CSS variables (`--bg-app: #12101b`, `--primary: #8b5cf6`, etc.) and vector icon catalog.

- [ ] **Step 1: Write the failing theme token test**

```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../renderer/styles.css'), 'utf8');
assert.ok(css.includes('--bg-app: #12101b') || css.includes('--bg-app: #0d0f14'), 'Default dark background required');
assert.ok(css.includes('--primary: #8b5cf6'), 'Primary purple token required');
assert.ok(!css.includes('#ffe6ee'), 'No Shing pastel pink tokens allowed in base stylesheet');
console.log('PASS: Theme tokens verified');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node e:\download\purplez\desktop\tests\test-purplez-theme-tokens.js`
Expected: FAIL (`styles.css` not found).

- [ ] **Step 3: Implement `styles.css` and `icons.js` with Purplez Simple Theme**

Define `:root`, `.theme-purple` (Obsidian Violet default), `.theme-slate`, `.theme-midnight`, `.theme-blue`, `.theme-green`, `.theme-crimson`. Implement flat card borders, 4px/8px/12px border radii, clean range sliders, dark custom scrollbars, and vector SVG definitions in `icons.js` (including cat and blade icons).

- [ ] **Step 4: Run test to verify it passes**

Run: `node e:\download\purplez\desktop\tests\test-purplez-theme-tokens.js`
Expected: PASS with "Theme tokens verified".

- [ ] **Step 5: Commit theme system**

```bash
git add desktop/renderer/styles.css desktop/assets/icons/icons.js desktop/tests/test-purplez-theme-tokens.js
git commit -m "feat(purplez): add Simple Obsidian Violet theme system and vector iconography"
```

---

### Task 4: Diagonal Slash Alert Banner Engine (`triggers.html`)

**Files:**
- Create: `e:\download\purplez\desktop\overlays\triggers.html`
- Create: `e:\download\purplez\desktop\tests\test-triggers-banner-slash.js`

**Interfaces:**
- Consumes: WebSocket events (`gift`, `follow`, `share`, `like`), Spec Section 5 clip-path geometry.
- Produces: Pop-up alert banner that holds for reading then slices in half diagonally on exit.

- [ ] **Step 1: Write the failing banner slash test**

```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../overlays/triggers.html'), 'utf8');
assert.ok(html.includes('polygon(0% 0%, 100% 0%, 100% 36%, 0% 64%)'), 'Top half clip-path required');
assert.ok(html.includes('polygon(0% 64%, 100% 36%, 100% 100%, 0% 100%)'), 'Bottom half clip-path required');
assert.ok(html.includes('triggerBannerSlash'), 'Slash function required');
assert.ok(html.includes('playSlashSound'), 'Slash audio synthesis function required');
console.log('PASS: Triggers slash markup and logic verified');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node e:\download\purplez\desktop\tests\test-triggers-banner-slash.js`
Expected: FAIL (`triggers.html` not found).

- [ ] **Step 3: Implement `triggers.html` with dual-layer clip-path and slash effects**

Implement `#alert-box` containing synchronized `#alert-half-top` and `#alert-half-bottom` layers. Add `#slash-beam` and `#slash-flash` elements. In script, implement:
1. Pop-up entrance (`0ms - 300ms`).
2. Readable hold window with in-place `streakKey` combo mutation.
3. `triggerBannerSlash()`: Web Audio synthesized slash SFX (`playSlashSound()`), `#slash-beam` streak at `-14deg`, `spawnSlashSparks()` on `#fx-canvas`, and `.slashing` split animation (top half slides up-left, bottom half slides down-right, then queue advances).

- [ ] **Step 4: Run test to verify it passes**

Run: `node e:\download\purplez\desktop\tests\test-triggers-banner-slash.js`
Expected: PASS with "Triggers slash markup and logic verified".

- [ ] **Step 5: Commit trigger slash overlay**

```bash
git add desktop/overlays/triggers.html desktop/tests/test-triggers-banner-slash.js
git commit -m "feat(purplez): implement diagonal banner slash trigger alert overlay"
```

---

### Task 5: Male Chibi and Cute Cat Companion Overlay (`companion.html` and root `index.html`)

**Files:**
- Create: `e:\download\purplez\desktop\overlays\companion.html`
- Create: `e:\download\purplez\index.html`
- Create: `e:\download\purplez\desktop\tests\test-companion-male-chibi-and-cats.js`

**Interfaces:**
- Consumes: Spec Section 6 pixel grid matrices, 6 male hairstyles, cat breed logic.
- Produces: 34x42 male chibi character walking with 26x24 cute pixel cats, dark speech bubbles, and event reactions.

- [ ] **Step 1: Write the failing male chibi and cat companion test**

```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../overlays/companion.html'), 'utf8');
const maleStyles = ['spiky', 'messy', 'undercut', 'parted', 'buzz', 'hoodup'];
for (const style of maleStyles) {
  assert.ok(html.includes(`'${style}'`), `HAIR_STYLES must include ${style}`);
}
assert.ok(html.includes('catPainter'), 'Cute cat pixel painter required');
assert.ok(html.includes('buildCatSprite'), 'Cat sprite builder required');
assert.ok(html.includes('LEGACY_HAIR_MAP'), 'Legacy hair style fallback map required');
console.log('PASS: Male chibi and cute cat companion verified');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node e:\download\purplez\desktop\tests\test-companion-male-chibi-and-cats.js`
Expected: FAIL (`companion.html` not found).

- [ ] **Step 3: Implement `companion.html` with male chibi sprite and cute pixel cats**

Implement `buildSprite(frame, eyes, mouth)` with male anatomy (streetwear hoodie, kangaroo pocket, joggers, sneakers, masculine eye matrices, zero ribbons/barrettes), 6 male hairstyles (`spiky`, `messy`, `undercut`, `parted`, `buzz`, `hoodup` with cat ears on hood), and `LEGACY_HAIR_MAP` fallback. Retain 4 cute cat breeds (`purple`, `black`, `calico`, `white`), 8-frame walk, 4-frame sitting idle, meow speech bubbles, and heart particles on events. Sync standalone root `index.html`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node e:\download\purplez\desktop\tests\test-companion-male-chibi-and-cats.js`
Expected: PASS with "Male chibi and cute cat companion verified".

- [ ] **Step 5: Commit male chibi companion overlay**

```bash
git add desktop/overlays/companion.html index.html desktop/tests/test-companion-male-chibi-and-cats.js
git commit -m "feat(purplez): implement male chibi streamer and cute cat companion overlay"
```

---

### Task 6: Transferred Interactive Overlays (Jar, Chat, LowerThird, Timer, Rankings, Headpat)

**Files:**
- Create: `e:\download\purplez\desktop\overlays\jar.html`
- Create: `e:\download\purplez\desktop\overlays\chat.html`
- Create: `e:\download\purplez\desktop\overlays\lowerthird.html`
- Create: `e:\download\purplez\desktop\overlays\timer.html`
- Create: `e:\download\purplez\desktop\overlays\toplikers.html`
- Create: `e:\download\purplez\desktop\overlays\viewerranking.html`
- Create: `e:\download\purplez\desktop\overlays\headpat.html`
- Create: `e:\download\purplez\desktop\tests\test-transferred-overlays-theme.js`

**Interfaces:**
- Consumes: Spec Sections 7, 8, 9; Matter.js physics; WebSocket server events.
- Produces: 7 fully functional OBS overlays with Simple Purplez Dark Theme styling.

- [ ] **Step 1: Write the failing transferred overlays theme test**

```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const overlaysDir = path.join(__dirname, '../overlays');
const files = ['jar.html', 'chat.html', 'lowerthird.html', 'timer.html', 'toplikers.html', 'viewerranking.html', 'headpat.html'];
for (const file of files) {
  assert.ok(fs.existsSync(path.join(overlaysDir, file)), `${file} must exist`);
  const content = fs.readFileSync(path.join(overlaysDir, file), 'utf8');
  assert.ok(!content.includes('#ffe6ee'), `${file} must not contain Shing pastel pink`);
}
console.log('PASS: Transferred overlays exist and use Purplez theme');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node e:\download\purplez\desktop\tests\test-transferred-overlays-theme.js`
Expected: FAIL (files not found).

- [ ] **Step 3: Implement all 7 overlays with Simple Purplez Dark Theme**

1. `jar.html`: Matter.js 2D physics, 20-segment collider vessel, 16:9 stage transform, smoked obsidian/violet glass styling.
2. `chat.html`: 8 dark/violet themes, font selector, avatar shapes/animations, SVG badges, 8s message grouping.
3. `lowerthird.html`: `@purplez` social rotator with brand SVGs and 3D card flip.
4. `timer.html`: Server-authoritative timer, gift bonuses, comment deductions, fractional like accumulator, dark purple cards.
5. `toplikers.html` & `viewerranking.html`: Server-side aggregation, Top 3/5/10 modes, rank medals, dark theme styling.
6. `headpat.html`: `!pet` command parsing, sprite squish math, dark violet frame.

- [ ] **Step 4: Run test to verify it passes**

Run: `node e:\download\purplez\desktop\tests\test-transferred-overlays-theme.js`
Expected: PASS with "Transferred overlays exist and use Purplez theme".

- [ ] **Step 5: Commit transferred overlays**

```bash
git add desktop/overlays/jar.html desktop/overlays/chat.html desktop/overlays/lowerthird.html desktop/overlays/timer.html desktop/overlays/toplikers.html desktop/overlays/viewerranking.html desktop/overlays/headpat.html desktop/tests/test-transferred-overlays-theme.js
git commit -m "feat(purplez): transfer jar, chat, lower third, timer, rankings, and headpat overlays with Simple theme"
```

---

### Task 7: Streamer Info Banner, PNGTuber Studio, and Phone Cast Overlays

**Files:**
- Create: `e:\download\purplez\desktop\overlays\banner.html`
- Create: `e:\download\purplez\banner.html`
- Create: `e:\download\purplez\desktop\overlays\pngtuber.html`
- Create: `e:\download\purplez\pngtuber.html`
- Create: `e:\download\purplez\desktop\overlays\phone.html`
- Create: `e:\download\purplez\phone.html`
- Create: `e:\download\purplez\desktop\renderer\qr.js`
- Create: `e:\download\purplez\desktop\scripts\generate-pngtuber-assets.js`
- Create: `e:\download\purplez\desktop\scripts\generate-pngtuber-talkhalf-assets.js`
- Create: `e:\download\purplez\desktop\tests\test-banner-pngtuber-phone.js`

**Interfaces:**
- Consumes: Spec Sections 10, 11, 12; UDP port 3334; WebCodecs; Web Audio analyzer.
- Produces: Streamer banner with cat topper, 7-frame PNGTuber with `pixelcat` default, low-latency Phone Cast receiver.

- [ ] **Step 1: Write the failing banner, pngtuber, and phone cast test**

```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const overlaysDir = path.join(__dirname, '../overlays');
const banner = fs.readFileSync(path.join(overlaysDir, 'banner.html'), 'utf8');
assert.ok(banner.includes('topper-cat'), 'Cat topper required in banner.html');
const pngtuber = fs.readFileSync(path.join(overlaysDir, 'pngtuber.html'), 'utf8');
assert.ok(pngtuber.includes('pixelcat'), 'pixelcat preset required in pngtuber.html');
const phone = fs.readFileSync(path.join(overlaysDir, 'phone.html'), 'utf8');
assert.ok(phone.includes('VideoDecoder') || phone.includes('canvas'), 'WebCodecs decoder canvas required in phone.html');
console.log('PASS: Banner, PNGTuber, and Phone Cast verified');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node e:\download\purplez\desktop\tests\test-banner-pngtuber-phone.js`
Expected: FAIL (files not found).

- [ ] **Step 3: Implement banner, pngtuber, phone overlays and generator scripts**

1. `banner.html` (and root): 5 dark templates (`Obsidian Violet`, `Dark Cat Cafe`, `Neon Katana`, `Cyber Slate`, `Royal Amethyst`), default `cat` topper, 3-scene rotator, paragraph rotator (`I am Purplez\nFollow for the cats`).
2. `pngtuber.html` (and root): Default `pixelcat` 7-frame preset, male streamer preset, 120ms conversational mouth flap, 180ms pause hold settle, Web Audio mic analyzer.
3. `phone.html` (and root): UDP discovery, binary cast frame decoder, QR pairing via `qr.js`, dark bezel frame.
4. PNGTuber generation scripts in `scripts/`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node e:\download\purplez\desktop\tests\test-banner-pngtuber-phone.js`
Expected: PASS with "Banner, PNGTuber, and Phone Cast verified".

- [ ] **Step 5: Commit banner, pngtuber, and phone cast overlays**

```bash
git add desktop/overlays/banner.html banner.html desktop/overlays/pngtuber.html pngtuber.html desktop/overlays/phone.html phone.html desktop/renderer/qr.js desktop/scripts/ desktop/tests/test-banner-pngtuber-phone.js
git commit -m "feat(purplez): implement banner with cat topper, PNGTuber with pixelcat default, and phone cast"
```

---

### Task 8: Desktop Dashboard Renderer UI Wiring (`index.html` & `app.js`)

**Files:**
- Create: `e:\download\purplez\desktop\renderer\index.html`
- Create: `e:\download\purplez\desktop\renderer\app.js`
- Create: `e:\download\purplez\desktop\tests\test-purplez-dashboard-ui.js`

**Interfaces:**
- Consumes: Spec Section 13 DOM architecture, IPC channels, WebSocket events.
- Produces: 11-tab Electron dashboard with live stage previews, volume bar, HUD stats, and simple theme controls.

- [ ] **Step 1: Write the failing dashboard UI test**

```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8');
assert.ok(html.includes('Purplez Live'), 'Brand title required in index.html');
assert.ok(html.includes('id="comp-hair"'), 'Companion hair selector required');
assert.ok(html.includes('value="spiky"'), 'Spiky hair option required');
assert.ok(html.includes('value="hoodup"'), 'Hoodup hair option required');
assert.ok(html.includes('id="test-trigger-btn"') || html.includes('triggers'), 'Trigger test controls required');
console.log('PASS: Dashboard UI markup verified');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node e:\download\purplez\desktop\tests\test-purplez-dashboard-ui.js`
Expected: FAIL (`index.html` not found).

- [ ] **Step 3: Implement `index.html` and `app.js` with Purplez Live branding and controls**

1. `#app-header`: Purplez Live branding, universal master volume slider/mute button, HUD counters (`Chat`, `Coins`, `Likes`), account pill (`@purplez`), minimize/connect buttons.
2. `#sidebar`: 11 navigation tabs with favorites pinning.
3. Tab panels:
   - `Overlays`: URL cards with copy buttons.
   - `Triggers`: Slash test controls, multi-tier templates, sound volume.
   - `Companion`: Male hairstyle dropdown (`Spiky`, `Messy Fringe`, `Undercut`, `Curtain Parted`, `Short Crop`, `Cat Hoodie`), cat checkboxes, live preview.
   - `Banner`: Cat topper toggle, theme picker, paragraph editor.
   - `PNGTuber`: Pixel cat and male streamer presets, mic test, bounce styles.
   - `Jar`, `Chat`, `Timer`, `Lower 3rd`, `Phone Cast`, `Settings`: Controls wired to `app.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node e:\download\purplez\desktop\tests\test-purplez-dashboard-ui.js`
Expected: PASS with "Dashboard UI markup verified".

- [ ] **Step 5: Commit dashboard UI**

```bash
git add desktop/renderer/index.html desktop/renderer/app.js desktop/tests/test-purplez-dashboard-ui.js
git commit -m "feat(purplez): wire desktop dashboard UI across all 11 tabs with Simple theme"
```

---

### Task 9: Full Automated Test Suite Adaptation, Zero-Emoji Audit, and Packaging Verification

**Files:**
- Create: `e:\download\purplez\desktop\tests\test-zero-emojis.js`
- Copy/Adapt: all existing 35 test files in `e:\download\shing\desktop\tests\` -> `e:\download\purplez\desktop\tests\`
- Create: `e:\download\purplez\desktop\build-exe.ps1`
- Create: `e:\download\purplez\desktop\build-installer.ps1`
- Create: `e:\download\purplez\desktop\package-update.ps1`
- Create: `e:\download\purplez\desktop\sync-app.ps1`
- Create: `e:\download\purplez\desktop\installer.iss`

**Interfaces:**
- Consumes: Spec Section 15 verification matrix.
- Produces: Passing 36-file test suite, zero-emoji audit pass, and operational build scripts.

- [ ] **Step 1: Write the failing zero-emoji audit test in `desktop/tests/test-zero-emojis.js`**

```javascript
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const targetDir = path.resolve(__dirname, '..');
const extList = ['.js', '.html', '.css', '.json', '.md'];

function scanDir(dir) {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      count += scanDir(full);
    } else if (extList.includes(path.extname(ent.name))) {
      const text = fs.readFileSync(full, 'utf8');
      const matches = text.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\uFE0F|[\u2600-\u27BF]/g);
      if (matches) {
        console.error(`Emoji violation in ${full}: ${matches.join(' ')}`);
        count += matches.length;
      }
    }
  }
  return count;
}

const emojiCount = scanDir(targetDir);
assert.strictEqual(emojiCount, 0, `Found ${emojiCount} emoji violations in ${targetDir}`);
console.log('PASS: Zero emoji audit passed');
```

- [ ] **Step 2: Run zero-emoji test to verify it executes and catches any violations**

Run: `node e:\download\purplez\desktop\tests\test-zero-emojis.js`
Expected: PASS (or identify any stray emojis).

- [ ] **Step 3: Copy and adapt all remaining 35 test files and PowerShell build scripts for Purplez Live**

Update test assertions (e.g., `username: 'purplez'`, `banner.name: 'Purplez'`, `Purplez Live` window title, male hairstyles) in test files. Rebrand `installer.iss`, `build-exe.ps1`, `package-update.ps1`, `sync-app.ps1` for Purplez Live.

- [ ] **Step 4: Run the complete test suite runner**

Run:
```powershell
Get-ChildItem -Path "e:\download\purplez\desktop\tests\test-*.js" | ForEach-Object {
    Write-Host "Running $($_.Name)..." -ForegroundColor Cyan
    $res = node $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Test failed: $($_.Name)" }
}
Write-Host "ALL TESTS PASSED!" -ForegroundColor Green
```
Expected: PASS with 36 out of 36 tests passing.

- [ ] **Step 5: Commit full test suite and build packaging**

```bash
git add desktop/tests/ desktop/build-*.ps1 desktop/package-update.ps1 desktop/sync-app.ps1 desktop/installer.iss
git commit -m "feat(purplez): adapt complete 36-file automated test suite and build scripts"
```

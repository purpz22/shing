# Purplez Live Studio Design Specification

## 1. Intent and Why

Purplez is a male TikTok Live streamer who likes cats and wants his own streaming companion app and OBS overlay suite based on Shing Studio. While the underlying features match Shing Studio, the visual identity, trigger alert animation, and companion character must fit Purplez:

1. **Simple Theme**: A clean, understated dark-purple and slate interface without pink pastel frills.
2. **Banner Slash Trigger Effect**: When a stream alert fires, a pop-up banner displays the message, then slices in half with a diagonal slash animation.
3. **Male Chibi and Cute Cat Companion**: The companion overlay keeps the interactive pixel cats and speech bubble system from Shing Studio, pairing the cats with a male chibi character instead of a female chibi girl.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Create a standalone application in `e:\download\purplez` (`e:\download\purplez\desktop`) so Shing Studio in `e:\download\shing` remains untouched.
- Rebrand the desktop app, tray/window titles, settings storage (`%APPDATA%\Purplez Live`), and default streamer profile to **Purplez Live** (`@purplez`).
- Apply a clean, minimal dark-slate and royal-purple default theme across the dashboard and overlays.
- Build the **Slash Alert Banner** in `desktop/overlays/triggers.html`: alerts pop in, stay readable for their hold duration, and then get cut diagonally by a bright slash beam and spark particles, splitting the banner into top-left and bottom-right halves that slide apart and fade out.
- Replace the female chibi sprite and female hairstyle list in `desktop/overlays/companion.html` and the dashboard Companion tab with a **male chibi pixel character** (hoodie, pants/sneakers, and male hairstyles) walking with the cute pixel cats (`purple`, `black`, `calico`, `white`).

### Non-Goals
- Altering any files inside `e:\download\shing\desktop`.
- Adding external native C++ dependencies or changing the Electron + local HTTP/WebSocket server architecture.

### Anti-Goals
- Leaving leftover "Shing", `@shimmy_ming`, female pigtails/ribbons, or hot-pink (`#ff6fae`) default borders in Purplez's app.
- Cutting the alert banner before the viewer has time to read the pop-up message.
- Including emojis anywhere in source code, HTML templates, CSS, comments, or JSON schemas.

---

## 3. Constraints

- **Platform and Stack**: Electron (`^31.0.2`), Node.js HTTP + WebSocket (`ws`) overlay server, vanilla HTML/CSS/JS overlays for zero-overhead OBS Browser Source rendering.
- **No Emojis Rule**: Zero emojis in code, UI labels, comments, or schemas; use SVG/vector icons and clean text only.
- **Low CPU/GPU Footprint**: Overlays must run smoothly at 60 FPS inside OBS alongside games using hardware-accelerated CSS transforms (`transform`, `clip-path`, `opacity`) and lightweight 2D canvas particles.

---

## 4. User Decisions

1. **Target Streamer**: Male streamer named **Purplez** who likes cats.
2. **Visual Theme**: Simple, clean theme (minimalist dark-purple and slate aesthetic).
3. **Trigger Alert Behavior**: A pop-up message banner appears on screen, then slashes in half with a cool slash effect.
4. **Companion Behavior**: Works the same way as Shing Studio (walking across the overlay, speech bubbles, cat meows, heart particles, and stream event reactions), featuring a **male chibi** walking with the **cute cats**.

---

## 5. Builder Calls and Technical Architecture

The following implementation details are settled as builder decisions (`[Builder Call]`):

### A. Project Location and Isolation `[Builder Call]`
- **Directory**: `e:\download\purplez\desktop` (cloned and adapted from `e:\download\shing\desktop`, linking or copying `node_modules` so it runs immediately without network stalls).
- **App Identity**:
  - `package.json`: `"name": "purplez-live"`, `"productName": "Purplez Live"`, `"author": "Purplez"`.
  - `main.js`: `app.name = 'Purplez Live'`, `app.setAppUserModelId('com.purplez.live')`, window title `'Purplez Live'`, `backgroundColor: '#13111c'`.
  - `overlayServer.js`: `resolveUserDataDir()` uses `path.join(appData, 'Purplez Live')` so settings never collide with Shing Live.
  - Default settings: `username: 'purplez'`, `lowerThird.tiktok: '@purplez'`, `banner.name: 'Purplez'`, `banner.subtitle: 'Live Streamer'`, `banner.topper: 'cat'`, `pngtuber.preset: 'pixelcat'` (defaults to the cute pixel cat PNGTuber rather than the female Shing portrait).
  - Server port remains `3333` by default (standard OBS overlay URL `http://localhost:3333/overlays/...`), configurable via options.

### B. Simple Purplez Theme `[Builder Call]`
- **Dashboard (`desktop/renderer/styles.css` & `index.html`)**:
  - Default `body` class is `theme-dark-purple` (or `theme-purple` restyled as a clean, flat dark-slate & violet palette):
    - `--bg-app: #12101b`
    - `--bg-sidebar: #181524`
    - `--bg-card: #1f1b2e`
    - `--border-color: #322b4a`
    - `--text-main: #f3f0ff`
    - `--text-muted: #9ca3af`
    - `--primary: #8b5cf6`
    - `--primary-hover: #7c3aed`
    - `--primary-light: #2a2240`
    - `--accent: #a78bfa` (replaces hot pink `#ff6fae` with electric violet/indigo)
  - Card borders use clean 1px/1.5px solid strokes (`--radius-md: 8px`, `--radius-lg: 12px`) with subtle shadows instead of heavy pastel glows.

### C. Trigger Banner Slash Effect (`desktop/overlays/triggers.html`) `[Builder Call]`
1. **Visual Layout**:
   - Clean, sharp rectangular/chamfered banner (`border-radius: 12px`, dark slate background `rgba(18, 16, 27, 0.96)`, 2px `#8b5cf6` border, subtle cat-ear silhouette or geometric accent badge) containing:
     - Sender avatar (`#alert-avatar`), bridge icon, gift icon (`#alert-gift-img`), tier badge (`#alert-title`), coin badge (`#alert-coins`), and alert message (`#alert-msg`).
   - To slice the banner cleanly into two physical halves without duplicating audio/video elements, `#alert-pill` is rendered with a synchronized clone layer (`#alert-pill-bottom-half`) during the slash phase, or `#alert-slash-stage` wraps two mirrored visual layers clipped along the diagonal slash line:
     - **Top-Left Half**: `clip-path: polygon(0 0, 100% 0, 100% 38%, 0 62%)`
     - **Bottom-Right Half**: `clip-path: polygon(0 62%, 100% 38%, 100% 100%, 0 100%)`
2. **Animation Timeline**:
   - **Phase 1: Pop-Up Entrance (`0ms - 320ms`)**:
     - `#alert-box` pops in smoothly (`scale(0.88) -> scale(1)`, `opacity: 0 -> 1`) and plays the event alert chime.
   - **Phase 2: Readable Hold (`320ms - duration`)**:
     - The message remains intact and legible for the configured `alertDuration` (default 5 seconds; streak updates mutate text/coins in place while intact).
   - **Phase 3: Diagonal Slash & Split (`duration -> duration + 650ms`)**:
     - At the end of the hold duration, `triggerBannerSlash()` fires:
       1. **Slash SFX**: Plays a crisp katana/claw slash sound effect (synthesized via Web Audio API noise-burst + resonant sweep so it works with zero external file failure, respecting `getEffectiveVolume()`).
       2. **Slash Beam**: A bright diagonal energy blade (`#slash-beam`, glowing white core `#ffffff` with `#a855f7` / `#38bdf8` outer glow) streaks across the banner from top-right to bottom-left in `120ms`.
       3. **Canvas Slash Sparks**: `spawnSlashSparks()` emits 36 directional velocity sparks along the diagonal cut line `y = H * (0.62 - 0.24 * (x / W))` on `#fx-canvas`.
       4. **Half Separation**: Immediately after the beam crosses (`90ms`), `#alert-box` enters `.slashing`:
          - The top-left half slides up-left and rotates slightly (`translate(-28px, -18px) rotate(-2.5deg)`, `opacity -> 0`).
          - The bottom-right half slides down-right and rotates (`translate(28px, 18px) rotate(2.5deg)`, `opacity -> 0`).
       5. **Queue Advance**: Once the split finishes (`650ms`), classes reset and `processQueue()` advances to the next alert.

### D. Male Chibi & Cute Cat Companion (`desktop/overlays/companion.html` & Dashboard) `[Builder Call]`
1. **Male Chibi Pixel Sprite (`buildSprite` in `companion.html`)**:
   - Same `34x42` pixel grid, 8-frame smooth walk cycle (`WALK`), blink state machine, happy bounce, and speech bubble system (`#bubble`).
   - Redesigned anatomy and clothing for a male streamer:
     - **Body**: Relaxed streetwear hoodie with front kangaroo pocket, drawstring cords, dark jeans/joggers, and sneakers.
     - **Face**: Clean anime boy eyes (`3x3` crisp pixel eyes with upper lash line and highlight), subtle expression mouth, no heavy pink cheek blush or hair ribbons/barrettes.
     - **Male Hairstyles (`HAIR_STYLES`)**:
       1. `spiky` (Default: classic anime spiky short hair with cat-ear-like tuft peaks)
       2. `messy` (Tousled layered fringe)
       3. `undercut` (Clean faded sides with swept top)
       4. `parted` (Center-parted curtain hair)
       5. `buzz` (Short cropped crew cut)
       6. `hoodup` (Streamer wearing a cat-eared hoodie hood up)
     - Legacy female hairstyle keys (if passed via old URL params or tests) safely map/fallback to `spiky`.
2. **Cute Cat Companions (`buildCatSprite` & `cats` in `companion.html`)**:
   - Retains all 4 pixel cat breeds (`purple`, `black`, `calico`, `white`) enabled by default with `['purple', 'black']`.
   - Retains 8-frame quadruped walk cycle, 4-frame sitting tail-wag idle, 2-frame happy bounce, periodic meow speech bubbles (`#cat-bubble`), meow audio, and heart particle emissions on stream events (`gift`, `follow`, `like`, `chat`) and `!pet` commands.
3. **Dashboard Companion Tab (`desktop/renderer/index.html` & `app.js`)**:
   - Updates the Hairstyle `<select id="comp-hair">` options to the 6 male hairstyles (`Spiky`, `Messy Fringe`, `Undercut`, `Curtain Parted`, `Short Crop`, `Cat Hoodie`).
   - Keeps Hair Color, Outfit Color, Cat Breed checkboxes (`Purple Cat`, `Black Cat`, `Calico Cat`, `White Cat`), Bubble Font, and Font Size controls synced with `overlayServer.js` and the live preview iframe.
4. **Standalone Root Overlays**:
   - Sync updated `banner.html`, `pngtuber.html`, and `index.html` (companion) at `e:\download\purplez\` root if present, matching the structure of `e:\download\shing`.

---

## 6. Verification Criteria

1. **Automated Test Suite (`e:\download\purplez\desktop\tests\`)**:
   - All adapted unit/integration tests pass.
   - New dedicated tests verify:
     - **Purplez Branding & Simple Theme**: `package.json`, `main.js`, `overlayServer.js` defaults (`username: 'purplez'`, `Purplez Live` userData dir, simple dark-purple theme variables).
     - **Trigger Banner Slash**: Pop-up message renders intact, `triggerBannerSlash()` activates diagonal beam, dual-half clip-path split elements (`#alert-half-top`, `#alert-half-bottom`), and slash particle burst on `#fx-canvas`.
     - **Male Chibi + Cute Cats Companion**: Male `HAIR_STYLES` (`spiky`, `messy`, `undercut`, `parted`, `buzz`, `hoodup`), zero hair ribbons, intact cat breed rendering (`purple`, `black`, `calico`, `white`), cat meow bubbles, and dashboard dropdown synchronization.
2. **Zero-Emoji Audit**:
   - Automated scan confirms zero emoji codepoints across all modified/created files.

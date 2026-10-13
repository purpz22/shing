# Design Specification: Streamer Info Banner Overlay (1:1 Independent Browser Source)

## 1. Intent & Problem Statement
Streamers using Shing Live want a dedicated, high-aesthetic info banner on stream to display key information about themselves—such as their name, animated chibi avatar, social media handles, and a cozy "about me" or schedule blurb.

The streamer has specified that this widget must be an **independent browser source** in OBS Studio and TikTok LIVE Studio (rather than bundled into the bottom walking companion overlay). This gives complete freedom to place, resize, and toggle the 1:1 banner anywhere in their streaming canvas.

Key requirements:
1. **Independent Browser Source**: Served at `http://localhost:3333/overlays/banner.html` with its own entry in the Electron dashboard's "Browser Overlays" grid (Copy URL, Open Preview).
2. **1:1 Square Ratio**: Centered within the overlay canvas to maintain balanced framing on Twitch, Kick, YouTube, and vertical TikTok layouts.
3. **Continuous Display**: Remains on screen continuously while enabled, with customizable smooth idle animations (Gentle Float, Cozy Sway, Heartbeat Pulse, Calm Breathe, Playful Bounce).
4. **Decorative Essentials (Upper Toppers)**: Resting along the top frame (Little Bear, Satin Ribbon, Cozy Cat, or None).
5. **Real-Time Settings Synchronization**: Stored in `settings.json` and broadcast over WebSocket (`settings:update`) via `overlayServer.js` so edits in the desktop dashboard update OBS instantly without browser source refreshes.
6. **Size Slider**: Range 50% to 150% (default 100%) in the dashboard controls with a real-time percentage badge.
7. **Clean Code**: Strictly 0 emojis in code, styles, templates, or schemas.

---

## 2. Goals
- **Standalone Overlay (`desktop/overlays/banner.html`)**:
  - Independent 1:1 centered widget container `#streamer-banner-container`.
  - Connects to `OverlayServer` WebSocket (`/ws`) for instant live updates.
  - Automatically loads and applies settings from `/api/settings` and WebSocket events.
- **Size Slider & Scaling**:
  - Scale slider in the dashboard (range 50% to 150%, step 5%, default 100%) with a live badge readout.
  - GPU-accelerated scaling via CSS `transform: translate(-50%, -50%) scale(var(--banner-scale))`.
- **Selectable Decorative Toppers (Upper Frame Essentials)**:
  - `bear`: Cute pixel bear with little paws resting over the top border.
  - `ribbon`: Classic satin ribbon bow centered on the upper border.
  - `cat`: Cozy sleeping or peeking cat matching the overlay companion cats.
  - `none`: Clean top border with no topper accent.
- **Card Content**:
  - **Animated Chibi Avatar**: 64x64 canvas displaying the streamer's customized chibi character with a gentle idle breathing loop.
  - **Streamer Identity**: Display name and subtitle/pronouns (e.g. "AkiWren", "Cozy Variety Streamer").
  - **Social Links**: Clean vector icon badges with handles (Twitch, TikTok, Discord, Twitter/X, Instagram, YouTube).
  - **About Me / Schedule Blurb**: Multi-line text block for bio, daily goals, or stream timetable.
- **Selectable Continuous Motion Styles**:
  - `float` (Default): Gentle vertical bob with soft easing.
  - `sway`: Soft rhythmic pendulum sway with gentle tilt.
  - `pulse`: Gentle heartbeat scale pulse with soft glow.
  - `breathe`: Subtle pastel glow fade and breathing cycle.
  - `bounce`: Playful bouncy spring cycle.
- **Desktop Dashboard Controls & Overlays Integration**:
  - Add "Streamer Info Banner" card to the "Browser Overlays" grid in `desktop/renderer/index.html` (URL `http://localhost:3333/overlays/banner.html`, 500x500 suggested OBS size).
  - Add dedicated banner customization section with live preview, input fields, topper dropdown, animation dropdown, and the size slider.
  - Persist settings via `POST /api/settings` and broadcast to active overlays.

---

## 3. Non-Goals
- Multi-page carousel or paginated slideshow (the banner remains a clean, unified 1:1 summary card).
- Modifying the bottom walking companion overlay (`companion.html`).
- Cloud database dependencies (all configuration resides locally on the streamer's computer in `desktop/settings.json`).

---

## 4. Architecture & Technical Design

### A. Settings Schema (`desktop/settings.json`)
The settings object is extended with the `banner` configuration:
```json
{
  "banner": {
    "enabled": true,
    "scale": 1.0,
    "topper": "bear",
    "animation": "float",
    "name": "AkiWren",
    "subtitle": "Cozy Variety Streamer",
    "bio": "Welcome to the cozy corner! Streaming daily games, art, and chill chats.",
    "socials": {
      "twitch": "AkiWren",
      "tiktok": "@akiwren_live",
      "discord": "discord.gg/akiwren",
      "twitter": "@akiwren"
    }
  }
}
```

### B. Overlay Server Integration (`desktop/server/overlayServer.js`)
- Expose route `http://localhost:3333/overlays/banner.html` serving `desktop/overlays/banner.html`.
- Initialize default `banner` configuration in `settings.json` if missing.
- Broadcast changes to all connected clients when `settings:update` is dispatched.

### C. Standalone Overlay DOM (`desktop/overlays/banner.html`)
```html
<div id="banner-stage">
  <div id="streamer-banner-container" data-animation="float" data-topper="bear">
    <div id="banner-topper">
      <!-- SVG vector for Bear / Ribbon / Cat -->
    </div>
    <div id="banner-card">
      <div class="banner-avatar-wrap">
        <canvas id="banner-avatar-canvas" width="64" height="64"></canvas>
      </div>
      <div class="banner-header">
        <div id="banner-name-text">AkiWren</div>
        <div id="banner-subtitle-text">Cozy Variety Streamer</div>
      </div>
      <div class="banner-divider"></div>
      <div id="banner-bio-text">Welcome to the cozy corner!</div>
      <div id="banner-socials-grid">
        <!-- Social badges -->
      </div>
    </div>
  </div>
</div>
```

### D. Overlay CSS & Scaling
```css
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
}

#banner-stage {
  position: relative;
  width: 100vw;
  height: 100vh;
}

#streamer-banner-container {
  position: fixed;
  top: 50%;
  left: 50%;
  width: 380px;
  height: 380px;
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%) scale(var(--banner-scale, 1));
  transform-origin: center center;
  will-change: transform;
}
```

### E. Dashboard Controls (`desktop/renderer/index.html` & `app.js`)
- Overlays grid card: Title "Streamer Info Banner", URL `http://localhost:3333/overlays/banner.html`, buttons "Copy URL" and "Open".
- Customization panel:
  - Toggle: "Enable Banner"
  - Size slider: 50% to 150% (step 5%) with real-time percentage badge.
  - Topper select: Little Bear, Satin Ribbon, Cozy Cat, None.
  - Animation select: Gentle Float, Cozy Sway, Heartbeat Pulse, Calm Breathe, Playful Bounce.
  - Text inputs: Streamer Name, Subtitle, Bio/Schedule blurb, Social Handles.
- Synchronized instantaneously to OBS via `saveSettingsDebounced()`.

---

## 5. Implementation Calls Made
1. **Target Architecture**: Independent browser source (`desktop/overlays/banner.html`), with an overlay card in the desktop dashboard and a direct route in `overlayServer.js`.
2. **Settings Synchronization**: Synchronized via `settings.json`, `/api/settings`, and WebSocket `settings:update` to ensure OBS Studio CEF renders changes immediately.
3. **Avatar Animation**: Animated 64x64 pixel canvas utilizing the existing chibi sprite generator with an idle breathing loop matching the streamer's configured outfit and hair colors.
4. **Clean Code**: Strictly zero emojis across all code, markup, CSS, and schemas.

---

## 6. Verification Plan
1. **Server & Route**: Verify `http://localhost:3333/overlays/banner.html` returns 200 OK.
2. **Dashboard Integration**: Verify the overlay card is present in the "Browser Overlays" grid with working "Copy URL" and "Open" actions.
3. **Size Slider**: Verify adjusting the slider updates `--banner-scale` in real-time from 50% to 150%.
4. **Topper Switching**: Verify switching between `bear`, `ribbon`, `cat`, and `none` accurately mounts the vector topper.
5. **Animation Styles**: Verify changing animation styles cleanly switches CSS keyframe animations (`float`, `sway`, `pulse`, `breathe`, `bounce`).
6. **Real-time OBS Synchronization**: Verify editing text in the dashboard instantly updates the active overlay page over WebSocket without needing a page refresh.
7. **Clean Code Audit**: Confirm zero emojis across all files.

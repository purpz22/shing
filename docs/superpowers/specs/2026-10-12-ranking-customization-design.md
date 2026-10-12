# Design Specification: Viewer Stay Ranking & Top Likers Customization

## 1. Intent & Problem Statement
Streamers using Shing Live currently cannot customize the visual presentation of the **Viewer Stay Ranking** (`viewerranking.html`) and **Top Likers Ranking** (`toplikers.html`) overlays. Both widgets are hardcoded to fixed widths and static dark purple hues, with only a count selector ("Show Top 1-10"). 

Furthermore:
1. Streamers need to adjust the overlay **Size** (scaling from compact to large) to fit their stream canvas in TikTok LIVE Studio and OBS Studio.
2. Streamers need to choose from distinct color **Themes** using clean color names (`Purple`, `Pink`, `Blue`, `Green`, `Dark`, `Light`) to match their stream graphics.
3. The dashboard cards currently render static HTML mockups and do not update in real time when settings or test events fire.
4. In `overlayServer.js`, repeated TikTok member events for active viewers can inadvertently wipe a viewer's active session time due to an overly aggressive 15-second re-join reset check.

## 2. Goals
- **Size Slider**: Add scale sliders (range 50% to 150%, step 5%) for both Viewer Stay Ranking and Top Likers Ranking.
- **Color Themes**: Add a theme selector for each ranking card using strictly plain color names:
  - `Purple` (Default)
  - `Pink`
  - `Blue`
  - `Green`
  - `Dark`
  - `Light`
- **Live Studio Synchronization**: Real-time broadcast over WebSocket with zero latency to all active browser source overlays in TikTok LIVE Studio and OBS.
- **Interactive Dashboard Previews**: Make the ranking preview cards in the desktop dashboard dynamically reflect the selected color theme, scale, and test events.
- **Stay Timer Stability**: Fix the session reset logic in `overlayServer.js` so active viewers continuously accumulate stay duration without premature resets.
- **Clean Code**: Strictly 0 emojis in source code, markup, styles, comments, or data schemas.

## 3. Non-Goals
- Changing the underlying leaderboard metrics (Stay Ranking tracks stay duration; Top Likers tracks gift/tap likes).
- Arbitrary freeform CSS hex code pickers (plain preset color names provide consistent typography and contrast).

## 4. Architecture & Technical Design

### A. Settings Schema (`settings.json`)
The settings object will be extended under `rankings`:
```json
{
  "rankings": {
    "topLikersCount": 3,
    "topLikersTheme": "Purple",
    "topLikersScale": 1.0,
    "viewerRankingCount": 3,
    "viewerRankingTheme": "Purple",
    "viewerRankingScale": 1.0,
    "leaveTimeoutMin": 5
  }
}
```

### B. Color Theme Palettes
Each theme defines CSS custom properties applied via a root `data-theme` attribute on the overlay container:

1. **Purple (Default)**
   - Background: `linear-gradient(160deg, rgba(24, 20, 40, 0.92) 0%, rgba(16, 14, 28, 0.96) 100%)`
   - Border: `rgba(187, 134, 252, 0.45)`
   - Primary Accent: `#c084fc`
   - Badge / Highlights: `#e9d5ff` / `rgba(187, 134, 252, 0.18)`
   - Text: `#ffffff`

2. **Pink**
   - Background: `linear-gradient(160deg, rgba(38, 20, 36, 0.92) 0%, rgba(26, 13, 25, 0.96) 100%)`
   - Border: `rgba(255, 126, 185, 0.45)`
   - Primary Accent: `#ff7eb9`
   - Badge / Highlights: `#ffd1e6` / `rgba(255, 126, 185, 0.18)`
   - Text: `#ffffff`

3. **Blue**
   - Background: `linear-gradient(160deg, rgba(16, 26, 46, 0.92) 0%, rgba(10, 18, 33, 0.96) 100%)`
   - Border: `rgba(72, 181, 255, 0.45)`
   - Primary Accent: `#48b5ff`
   - Badge / Highlights: `#cbe9ff` / `rgba(72, 181, 255, 0.18)`
   - Text: `#ffffff`

4. **Green**
   - Background: `linear-gradient(160deg, rgba(16, 36, 30, 0.92) 0%, rgba(10, 25, 21, 0.96) 100%)`
   - Border: `rgba(56, 211, 159, 0.45)`
   - Primary Accent: `#38d39f`
   - Badge / Highlights: `#c6f7e5` / `rgba(56, 211, 159, 0.18)`
   - Text: `#ffffff`

5. **Dark**
   - Background: `linear-gradient(160deg, rgba(18, 18, 22, 0.94) 0%, rgba(10, 10, 13, 0.98) 100%)`
   - Border: `rgba(255, 255, 255, 0.18)`
   - Primary Accent: `#cbd5e1`
   - Badge / Highlights: `#f1f5f9` / `rgba(255, 255, 255, 0.12)`
   - Text: `#ffffff`

6. **Light**
   - Background: `linear-gradient(160deg, rgba(255, 255, 255, 0.95) 0%, rgba(245, 243, 250, 0.96) 100%)`
   - Border: `rgba(140, 100, 200, 0.35)`
   - Primary Accent: `#7c3aed`
   - Badge / Highlights: `#5b21b6` / `rgba(124, 58, 237, 0.12)`
   - Text: `#1e1b4b` (Dark high-contrast typography)

### C. Scaling Implementation
Overlays apply scaling via CSS transforms on `#viewer-ranking-root` and `#toplikers-root`:
```css
transform: scale(var(--ranking-scale, 1.0));
transform-origin: top left;
```
When `scale` changes, the dimensions adapt cleanly on the GPU without pixelation.

### D. Stay Ranking Session Continuity Fix
In `desktop/server/overlayServer.js`:
- Currently, when `data.type === 'join'` is processed and `now - v.lastSeenAt > 15000`, the server resets `v.sessionStartAt = now` and `v.currentTimeSec = 0`. This wipes active timers for viewers who are simply lurking or receiving subsequent join events from TikTok.
- **Fix**: If `v.isPresent` is `true`, a subsequent `join` or chat event must **never** wipe `v.sessionStartAt` or reset `currentTimeSec`. It simply refreshes `v.lastSeenAt = now`.
- A timer reset only occurs if `v.isPresent` was `false` (the viewer had left or timed out past `leaveTimeoutMin`), preserving Best Time while beginning a fresh current session.

### E. Dashboard Controls & Live Previews
In `desktop/renderer/index.html` and `app.js`:
- Add `<select id="ranking-viewers-theme">` and `<select id="ranking-toplikers-theme">` with options:
  `Purple`, `Pink`, `Blue`, `Green`, `Dark`, `Light`.
- Add `<input type="range" id="ranking-viewers-scale">` and `<input type="range" id="ranking-toplikers-scale">` (0.5 to 1.5, step 0.05).
- Add scale readout badges (`#ranking-viewers-scale-badge`, `#ranking-toplikers-scale-badge`).
- Wire event listeners in `app.js` to dispatch `settings:update` and immediately re-render `#ov-demo-viewerranking-rows` and `#ov-demo-toplikers-rows` with the active theme and scale.

## 5. Verification Plan
- Unit test for `overlayServer.js`: Validate theme and scale properties in `getRankingsSnapshot()`, `settings:update` handling, and verify that active viewers do not reset stay duration on subsequent join events.
- DOM & CSS tests for `viewerranking.html` and `toplikers.html`: Validate all 6 themes render correct CSS variables and container scaling.
- Dashboard integration test: Validate presence of theme dropdowns, sliders, badges, and ensure live event updates mutate preview rows.

# Task 3 Brief: Dashboard Controls & Dynamic Preview Cards

## Objective
Update `desktop/renderer/index.html`, `desktop/renderer/styles.css`, and `desktop/renderer/app.js` to:
1. Provide UI controls on both ranking cards:
   - **Top Likers Ranking Card**:
     - Theme selector `<select id="ranking-toplikers-theme">`: `Purple` (Default), `Pink`, `Blue`, `Green`, `Dark`, `Light`.
     - Size slider `<input type="range" id="ranking-toplikers-scale" min="0.5" max="1.5" step="0.05" value="1.0">`.
     - Scale badge `<span id="ranking-toplikers-scale-badge" class="scale-badge">100%</span>`.
   - **Viewer Stay Ranking Card**:
     - Theme selector `<select id="ranking-viewers-theme">`: `Purple` (Default), `Pink`, `Blue`, `Green`, `Dark`, `Light`.
     - Size slider `<input type="range" id="ranking-viewers-scale" min="0.5" max="1.5" step="0.05" value="1.0">`.
     - Scale badge `<span id="ranking-viewers-scale-badge" class="scale-badge">100%</span>`.
2. Add CSS styles in `styles.css`:
   - Preview card theme support: `[data-theme="Purple"]`, `[data-theme="Pink"]`, `[data-theme="Blue"]`, `[data-theme="Green"]`, `[data-theme="Dark"]`, `[data-theme="Light"]` on `.demo-ranking-card`.
   - Responsive layouts for controls, sliders, and badges matching the application's dark purple theme.
3. Wire interaction logic in `desktop/renderer/app.js`:
   - Initialize selectors and slider values on startup from `appSettings.rankings`.
   - Update live dashboard preview cards (`#ov-demo-toplikers-card`, `#ov-demo-viewerranking-card`) immediately on theme change or scale input.
   - Save settings via `saveCurrentSettings()` and broadcast to overlay server (`settings:update`).
   - Dynamically render demo preview rows when test buttons ("Test Like", "Test Stay", "Test Leave", "Reset") are clicked.
4. Provide unit test `desktop/tests/test-ranking-dashboard-ui.js` validating the presence and behavior of all UI elements, options, badges, and handlers.

## Global Constraints
- Strictly NO emojis in source code, option labels, HTML templates, comments, or data schemas.
- Clean code and syntax (`node --check desktop/renderer/app.js`).

## Deliverables
- Commit: `feat(rankings): add theme dropdowns, scale sliders, and dynamic dashboard previews`
- Report: `.superpowers/sdd/ranking-customization/task-3-report.md`
- Diff: `.superpowers/sdd/ranking-customization/task-3-review-package.diff`

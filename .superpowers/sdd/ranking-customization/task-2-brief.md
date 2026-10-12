# Task 2 Brief: Overlay Color Themes & GPU Scaling for Stay Ranking & Top Likers

## Objective
Update both `desktop/overlays/viewerranking.html` and `desktop/overlays/toplikers.html` to:
1. Support 6 plain color themes via root container `data-theme` attribute:
   - `Purple` (Default): Violet accents (`#c084fc`), background `linear-gradient(160deg, rgba(24, 20, 40, 0.92) 0%, rgba(16, 14, 28, 0.96) 100%)`, border `rgba(187, 134, 252, 0.45)`.
   - `Pink`: Rose accents (`#ff7eb9`), background `linear-gradient(160deg, rgba(38, 20, 36, 0.92) 0%, rgba(26, 13, 25, 0.96) 100%)`, border `rgba(255, 126, 185, 0.45)`.
   - `Blue`: Sky blue accents (`#48b5ff`), background `linear-gradient(160deg, rgba(16, 26, 46, 0.92) 0%, rgba(10, 18, 33, 0.96) 100%)`, border `rgba(72, 181, 255, 0.45)`.
   - `Green`: Mint accents (`#38d39f`), background `linear-gradient(160deg, rgba(16, 36, 30, 0.92) 0%, rgba(10, 25, 21, 0.96) 100%)`, border `rgba(56, 211, 159, 0.45)`.
   - `Dark`: Silver accents (`#cbd5e1`), background `linear-gradient(160deg, rgba(18, 18, 22, 0.94) 0%, rgba(10, 10, 13, 0.98) 100%)`, border `rgba(255, 255, 255, 0.22)`.
   - `Light`: Deep purple text/accents (`#7c3aed`), background `linear-gradient(160deg, rgba(255, 255, 255, 0.95) 0%, rgba(245, 243, 250, 0.96) 100%)`, border `rgba(140, 100, 200, 0.35)`.
2. Support smooth GPU scaling:
   - Root elements `#viewer-ranking-root` and `#toplikers-root` must have:
     `transform: scale(var(--ranking-scale, 1.0));`
     `transform-origin: top left;`
3. Update WebSocket and settings handlers:
   - In `viewerranking.html`: read `viewerRankingTheme` and `viewerRankingScale` from `msg.settings?.rankings` or `msg.rankings`. Set `root.dataset.theme = theme` and `root.style.setProperty('--ranking-scale', scale)`.
   - In `toplikers.html`: read `topLikersTheme` and `topLikersScale` from `msg.settings?.rankings` or `msg.rankings`. Set `root.dataset.theme = theme` and `root.style.setProperty('--ranking-scale', scale)`.
   - Ensure updates work seamlessly across `init`, `settings:update`, and `rankings:update` WebSocket messages.
4. Provide unit test `desktop/tests/test-ranking-overlay-themes.js` validating theme rules, CSS variables, and settings handlers in both overlay files.

## Global Constraints
- Strictly NO emojis in source code, CSS, markup, or comments.
- Clean markup and verified script syntax.

## Deliverables
- Commit: `feat(rankings): add 6 plain color themes and GPU scaling to ranking overlays`
- Report: `.superpowers/sdd/ranking-customization/task-2-report.md`
- Diff: `.superpowers/sdd/ranking-customization/task-2-review-package.diff`

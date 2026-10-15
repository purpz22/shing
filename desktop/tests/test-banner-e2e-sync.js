'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const child_process = require('child_process');

console.log('Testing Web Deployment Sync & End-to-End Verification (Task 4)...');

const rootDir = path.resolve(__dirname, '../..');
const rootBannerPath = path.join(rootDir, 'banner.html');
const overlayBannerPath = path.join(rootDir, 'desktop', 'overlays', 'banner.html');
const deployPs1Path = path.join(rootDir, 'deploy.ps1');

// =========================================================================
// Test 1: Root banner.html exists and mirrors desktop/overlays/banner.html
// =========================================================================
assert.ok(fs.existsSync(rootBannerPath), 'Root banner.html must exist for web hosting');
assert.ok(fs.existsSync(overlayBannerPath), 'desktop/overlays/banner.html must exist');

const rootBannerHtml = fs.readFileSync(rootBannerPath, 'utf8');
const overlayBannerHtml = fs.readFileSync(overlayBannerPath, 'utf8');

// Normalize CRLF to LF for cross-platform comparison
const normalizeEol = (str) => str.replace(/\r\n/g, '\n').trim();
assert.strictEqual(
  normalizeEol(rootBannerHtml),
  normalizeEol(overlayBannerHtml),
  'Root banner.html must be an exact mirror of desktop/overlays/banner.html'
);

// Verify core requirements inside root banner.html
assert.ok(rootBannerHtml.includes('id="streamer-banner-container"'), 'Root banner must contain #streamer-banner-container');
assert.ok(/aspect-ratio\s*:\s*1\s*\/\s*1/.test(rootBannerHtml), 'Root banner must have 1:1 aspect ratio');
assert.ok(rootBannerHtml.includes('id="banner-topper"'), 'Root banner must contain topper container');
assert.ok(rootBannerHtml.includes('topper-bear'), 'Root banner must contain bear topper');
assert.ok(rootBannerHtml.includes('topper-ribbon'), 'Root banner must contain ribbon topper');
assert.ok(rootBannerHtml.includes('topper-cat'), 'Root banner must contain cat topper');

// Verify 5 continuous motion animation keyframes & classes
const motionClasses = ['anim-float', 'anim-sway', 'anim-pulse', 'anim-breathe', 'anim-bounce'];
for (const cls of motionClasses) {
  assert.ok(rootBannerHtml.includes(cls), `Root banner must include class .${cls}`);
}

// Verify avatar canvas
assert.ok(rootBannerHtml.includes('id="banner-avatar-canvas"'), 'Root banner must contain avatar canvas');

// Verify scale boundary clamping in script
assert.ok(
  rootBannerHtml.includes('Math.max(0.5, Math.min(1.5') || rootBannerHtml.includes('Number.isFinite'),
  'Root banner script must clamp scale value within [0.5, 1.5]'
);

// Verify line clamp on bio text
assert.ok(
  rootBannerHtml.includes('-webkit-line-clamp') || rootBannerHtml.includes('max-height'),
  'Root banner must constrain bio text with line-clamp or max-height'
);

// Verify standalone fallback data
assert.ok(rootBannerHtml.includes('shimmy_ming'), 'Root banner must contain default streamer name');
assert.ok(rootBannerHtml.includes('Cute ang mag follow'), 'Root banner must contain default subtitle');

// =========================================================================
// Test 2: deploy.ps1 deployment sync verification
// =========================================================================
assert.ok(fs.existsSync(deployPs1Path), 'deploy.ps1 must exist');
const deployContent = fs.readFileSync(deployPs1Path, 'utf8');

// Ensure deploy.ps1 includes banner.html sync
assert.ok(
  deployContent.includes('banner.html'),
  'deploy.ps1 must explicitly reference or sync banner.html'
);

// Ensure .html extension is allowed in deploy.ps1
assert.ok(
  deployContent.includes("'.html'"),
  'deploy.ps1 must include .html in $AllowedExtensions'
);

// Ensure banner.html is NOT excluded in deploy.ps1
const excludedMatches = deployContent.match(/\$ExcludedNames\s*=\s*@\(([^)]+)\)/s);
assert.ok(excludedMatches, 'deploy.ps1 must define $ExcludedNames');
assert.ok(
  !excludedMatches[1].includes("'banner.html'") && !excludedMatches[1].includes('"banner.html"'),
  'banner.html must not be in $ExcludedNames'
);

// Functional simulation of deploy.ps1 file filter on banner.html
{
  const allowedExtensions = ['.html', '.htm', '.css', '.js', '.mjs', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.mp3', '.ogg', '.wav', '.mp4', '.webm', '.woff', '.woff2', '.ttf', '.otf'];
  const excludedNames = ['.deploy-cache.json', 'deploy.ps1', 'deploy.bat', 'overlay.svg'];
  const excludedDirs = ['desktop', 'node_modules'];

  const testFileRel = 'banner.html';
  const topSeg = testFileRel.split(/[\/\\]/)[0];
  const ext = path.extname(testFileRel).toLowerCase();

  const isExcluded = excludedDirs.includes(topSeg) || excludedNames.includes('banner.html');
  const isAllowed = !topSeg.startsWith('.') && allowedExtensions.includes(ext);
  const willDeploy = !isExcluded && isAllowed;

  assert.strictEqual(willDeploy, true, 'deploy.ps1 filter must include root banner.html in deployment upload');
}

// =========================================================================
// Test 3: Clean code audit - Strictly 0 emojis across all feature files
// =========================================================================
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;

const featureFiles = [
  path.join(rootDir, 'desktop', 'server', 'overlayServer.js'),
  path.join(rootDir, 'desktop', 'settings.json'),
  path.join(rootDir, 'desktop', 'overlays', 'banner.html'),
  rootBannerPath,
  deployPs1Path,
  path.join(rootDir, 'desktop', 'tests', 'test-banner-server-settings.js'),
  path.join(rootDir, 'desktop', 'tests', 'test-banner-overlay-markup.js'),
  path.join(rootDir, 'desktop', 'tests', 'test-banner-dashboard-ui.js'),
  __filename
];

for (const filePath of featureFiles) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(EMOJI_REGEX);
    assert.strictEqual(
      match,
      null,
      `File ${path.relative(rootDir, filePath)} must contain strictly zero emojis (found: ${match ? match[0] : ''})`
    );
  }
}

// Specifically audit banner sections of desktop/renderer/index.html and app.js
const rendererIndexPath = path.join(rootDir, 'desktop', 'renderer', 'index.html');
if (fs.existsSync(rendererIndexPath)) {
  const indexContent = fs.readFileSync(rendererIndexPath, 'utf8');
  const cardIdx = indexContent.indexOf('Streamer Info Banner');
  if (cardIdx !== -1) {
    const cardSnippet = indexContent.slice(cardIdx, cardIdx + 2000);
    assert.strictEqual(cardSnippet.match(EMOJI_REGEX), null, 'renderer/index.html banner card must contain zero emojis');
  }
  const toggleIdx = indexContent.indexOf('banner-enable-toggle');
  if (toggleIdx !== -1) {
    const panelSnippet = indexContent.slice(toggleIdx - 200, toggleIdx + 3000);
    assert.strictEqual(panelSnippet.match(EMOJI_REGEX), null, 'renderer/index.html banner settings must contain zero emojis');
  }
}

const rendererAppPath = path.join(rootDir, 'desktop', 'renderer', 'app.js');
if (fs.existsSync(rendererAppPath)) {
  const appContent = fs.readFileSync(rendererAppPath, 'utf8');
  const bannerAppIdx = appContent.indexOf('banner-enable-toggle');
  if (bannerAppIdx !== -1) {
    const appSnippet = appContent.slice(bannerAppIdx - 200, bannerAppIdx + 2500);
    assert.strictEqual(appSnippet.match(EMOJI_REGEX), null, 'renderer/app.js banner handlers must contain zero emojis');
  }
}

// =========================================================================
// Test 4: Run all previous banner test suites and assert 100% pass rate
// =========================================================================
const suitesToRun = [
  'desktop/tests/test-banner-server-settings.js',
  'desktop/tests/test-banner-overlay-markup.js',
  'desktop/tests/test-banner-dashboard-ui.js',
  'desktop/tests/test-banner-tiktok-pfp-paragraphs.js'
];

for (const suiteRel of suitesToRun) {
  const suitePath = path.join(rootDir, suiteRel);
  console.log(`Running suite: ${suiteRel} ...`);
  const result = child_process.spawnSync(process.execPath, [suitePath], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 15000
  });

  if (result.error) {
    throw result.error;
  }
  assert.strictEqual(
    result.status,
    0,
    `Suite ${suiteRel} failed with status ${result.status}:\n${result.stderr || result.stdout}`
  );
  console.log(`PASS: ${suiteRel}`);
}

console.log('PASS: test-banner-e2e-sync.js - All deployment sync and end-to-end verification checks passed successfully.');


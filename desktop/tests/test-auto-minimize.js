'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Testing Auto-Minimize Feature and Window Management APIs...');

const rootDir = path.resolve(__dirname, '..');
const mainJsPath = path.join(rootDir, 'main.js');
const preloadJsPath = path.join(rootDir, 'preload.js');
const overlayServerPath = path.join(rootDir, 'server', 'overlayServer.js');
const settingsJsonPath = path.join(rootDir, 'settings.json');
const indexHtmlPath = path.join(rootDir, 'renderer', 'index.html');
const appJsPath = path.join(rootDir, 'renderer', 'app.js');
const stylesCssPath = path.join(rootDir, 'renderer', 'styles.css');

// 1. Check OverlayServer default settings
const OverlayServer = require(overlayServerPath);
const dummyServer = new OverlayServer(3349, rootDir);
const defaultSettings = dummyServer.getDefaultSettings();

assert(
  typeof defaultSettings.autoMinimizeOnConnect === 'boolean',
  'OverlayServer getDefaultSettings() must include autoMinimizeOnConnect boolean'
);
assert.strictEqual(
  defaultSettings.autoMinimizeOnConnect,
  false,
  'autoMinimizeOnConnect should default to false so users opt in deliberately'
);
console.log('PASS: OverlayServer default settings includes autoMinimizeOnConnect: false');

// 2. Check settings.json schema
const settingsRaw = fs.readFileSync(settingsJsonPath, 'utf8');
const settingsJson = JSON.parse(settingsRaw);
assert(
  'autoMinimizeOnConnect' in settingsJson,
  'desktop/settings.json must include autoMinimizeOnConnect property'
);
console.log('PASS: desktop/settings.json contains autoMinimizeOnConnect property');

// 3. Check desktop/main.js IPC handlers
const mainJsContent = fs.readFileSync(mainJsPath, 'utf8');
assert(
  mainJsContent.includes("'window:minimize'") || mainJsContent.includes('"window:minimize"'),
  'desktop/main.js must register window:minimize IPC handler'
);
assert(
  mainJsContent.includes("'window:restore'") || mainJsContent.includes('"window:restore"'),
  'desktop/main.js must register window:restore IPC handler'
);
assert(
  mainJsContent.includes("'window:is-minimized'") || mainJsContent.includes('"window:is-minimized"'),
  'desktop/main.js must register window:is-minimized IPC handler'
);
console.log('PASS: desktop/main.js registers window management IPC handlers');

// 4. Check desktop/preload.js API exposure
const preloadJsContent = fs.readFileSync(preloadJsPath, 'utf8');
assert(
  preloadJsContent.includes('minimizeWindow:'),
  'desktop/preload.js must expose minimizeWindow function on window.api'
);
assert(
  preloadJsContent.includes('restoreWindow:'),
  'desktop/preload.js must expose restoreWindow function on window.api'
);
assert(
  preloadJsContent.includes('isWindowMinimized:'),
  'desktop/preload.js must expose isWindowMinimized function on window.api'
);
console.log('PASS: desktop/preload.js exposes minimizeWindow, restoreWindow, and isWindowMinimized');

// 5. Check desktop/renderer/index.html UI elements
const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
assert(
  indexHtmlContent.includes('id="setting-auto-minimize"'),
  'desktop/renderer/index.html must include setting-auto-minimize checkbox'
);
assert(
  indexHtmlContent.includes('id="header-minimize-btn"'),
  'desktop/renderer/index.html must include header-minimize-btn action button'
);
console.log('PASS: desktop/renderer/index.html contains auto-minimize setting and header minimize button');

// 6. Check desktop/renderer/styles.css styling
const stylesCssContent = fs.readFileSync(stylesCssPath, 'utf8');
assert(
  stylesCssContent.includes('.header-minimize-btn'),
  'desktop/renderer/styles.css must style .header-minimize-btn'
);
console.log('PASS: desktop/renderer/styles.css styles .header-minimize-btn');

// 7. Check desktop/renderer/app.js wiring
const appJsContent = fs.readFileSync(appJsPath, 'utf8');
assert(
  appJsContent.includes('setting-auto-minimize'),
  'desktop/renderer/app.js must reference setting-auto-minimize'
);
assert(
  appJsContent.includes('scheduleAutoMinimize') || appJsContent.includes('minimizeWindow'),
  'desktop/renderer/app.js must implement auto-minimize logic upon connection'
);
assert(
  appJsContent.includes('header-minimize-btn'),
  'desktop/renderer/app.js must wire header-minimize-btn click event'
);
console.log('PASS: desktop/renderer/app.js wires auto-minimize setting, connection trigger, and button');

// 8. Strict constraints verification
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
const filesToCheck = [
  { name: 'main.js', content: mainJsContent },
  { name: 'preload.js', content: preloadJsContent },
  { name: 'overlayServer.js', content: fs.readFileSync(overlayServerPath, 'utf8') },
  { name: 'settings.json', content: settingsRaw },
  { name: 'index.html', content: indexHtmlContent },
  { name: 'styles.css', content: stylesCssContent },
  { name: 'app.js', content: appJsContent }
];

for (const f of filesToCheck) {
  assert(!emojiRegex.test(f.content), `File ${f.name} contains forbidden emoji characters`);
  assert(!/akiwren/i.test(f.content), `File ${f.name} contains forbidden keyword AkiWren`);
}
console.log('PASS: Zero emojis and zero AkiWren references in all modified files');

console.log('All auto-minimize tests passed successfully!');

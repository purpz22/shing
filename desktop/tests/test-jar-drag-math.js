const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function calculateClampedCoordinates(rawX, rawY, scale = 1.0) {
  const hPct = 48 * scale;
  const wPct = hPct * (764 / 1024) * (9 / 16);
  const marginX = (wPct / 2) + 2;
  const marginY = (hPct / 2) + 2;

  const minX = Math.max(4, marginX);
  const maxX = Math.min(96, 100 - marginX);
  const minY = Math.max(6, marginY);
  const maxY = Math.min(96, 100 - marginY);

  const x = Math.max(minX, Math.min(maxX, rawX));
  const y = Math.max(minY, Math.min(maxY, rawY));
  return { x: +x.toFixed(1), y: +y.toFixed(1) };
}

// At scale 1.0, extreme values should be clamped inside margins
const c1 = calculateClampedCoordinates(0, 0, 1.0);
assert(c1.x > 10, 'Left margin was not clamped');
assert(c1.y > 15, 'Top margin was not clamped');

// At scale 1.5, bottom floor should stay on-screen
const c2 = calculateClampedCoordinates(50, 100, 1.5);
assert(c2.y < 65, 'Bottom floor at 1.5x scale pushed off-screen');

// Centered coordinates should remain centered
const c3 = calculateClampedCoordinates(50, 50, 1.0);
assert.strictEqual(c3.x, 50);
assert.strictEqual(c3.y, 50);

// Additional edge cases:
// Check scale min (0.4) and max (1.5)
const c4 = calculateClampedCoordinates(-50, -50, 0.4);
assert(c4.x >= 4, 'Scale 0.4 minX bound failed');
assert(c4.y >= 6, 'Scale 0.4 minY bound failed');

const c5 = calculateClampedCoordinates(150, 150, 0.4);
assert(c5.x <= 96, 'Scale 0.4 maxX bound failed');
assert(c5.y <= 96, 'Scale 0.4 maxY bound failed');

// Verify app.js contains the implemented drag engine, clamping math, and event wiring
const appJsPath = path.resolve(__dirname, '../renderer/app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');

assert(appJs.includes('function calculateClampedCoordinates(rawX, rawY, scale = 1.0)'), 'app.js missing calculateClampedCoordinates function');
assert(appJs.includes('function updateJarTransformUI(x, y, scale)'), 'app.js missing updateJarTransformUI function');
assert(appJs.includes('function sendJarTransform(x, y, scale)'), 'app.js missing sendJarTransform function');
assert(appJs.includes('jar-drag-overlay'), 'app.js missing jar-drag-overlay wiring');
assert(appJs.includes('jar-drag-target'), 'app.js missing jar-drag-target wiring');
assert(appJs.includes('jar-scale-slider'), 'app.js missing jar-scale-slider wiring');
assert(appJs.includes('jar-scale-badge'), 'app.js missing jar-scale-badge wiring');
assert(appJs.includes('jar-reset-transform-btn'), 'app.js missing jar-reset-transform-btn wiring');
assert(appJs.includes('jar-preview-stage'), 'app.js missing jar-preview-stage wiring');
assert(appJs.includes('setPointerCapture'), 'app.js missing setPointerCapture');
assert(appJs.includes('releasePointerCapture'), 'app.js missing releasePointerCapture');
assert(appJs.includes('requestAnimationFrame'), 'app.js missing requestAnimationFrame');
assert(appJs.includes("type: 'jar:transform'"), 'app.js missing jar:transform message dispatch');

// Verify that the function in app.js performs the exact same math
const match = appJs.match(/function calculateClampedCoordinates[\s\S]*?\n\}/);
assert(match, 'Failed to extract calculateClampedCoordinates from app.js');
const sandbox = {};
vm.runInNewContext(match[0] + '; sandboxFn = calculateClampedCoordinates;', sandbox);

const t1 = sandbox.sandboxFn(0, 0, 1.0);
assert.strictEqual(t1.x, c1.x);
assert.strictEqual(t1.y, c1.y);

const t2 = sandbox.sandboxFn(50, 100, 1.5);
assert.strictEqual(t2.x, c2.x);
assert.strictEqual(t2.y, c2.y);

const t3 = sandbox.sandboxFn(50, 50, 1.0);
assert.strictEqual(t3.x, c3.x);
assert.strictEqual(t3.y, c3.y);

const t4 = sandbox.sandboxFn(-50, -50, 0.4);
assert.strictEqual(t4.x, c4.x);
assert.strictEqual(t4.y, c4.y);

const t5 = sandbox.sandboxFn(150, 150, 0.4);
assert.strictEqual(t5.x, c5.x);
assert.strictEqual(t5.y, c5.y);

console.log('Task 4 drag math test passed!');

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const targetPath = fs.existsSync(path.resolve(__dirname, '../overlays/jar.html'))
  ? path.resolve(__dirname, '../overlays/jar.html')
  : path.resolve('desktop/overlays/jar.html');

const html = fs.readFileSync(targetPath, 'utf8');

// Assert CSS properties & rules
assert(html.includes('--jar-x'), 'Missing --jar-x CSS variable in jar.html');
assert(html.includes('--jar-y'), 'Missing --jar-y CSS variable in jar.html');
assert(html.includes('--jar-scale'), 'Missing --jar-scale CSS variable in jar.html');
assert(html.includes('100vw') && html.includes('100vh'), 'Missing 100vw/100vh container sizing');
assert(html.includes('scale(calc(var(--jar-scale'), 'Missing responsive scale calc formula');

// Assert JS function & WebSocket listeners
assert(html.includes('applyJarTransform'), 'Missing applyJarTransform function in jar.html');
assert(html.includes('jar:transform'), 'Missing jar:transform listener in jar.html');

// Test functional behavior of applyJarTransform in isolation
const fnMatch = html.match(/function\s+applyJarTransform\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/);
assert(fnMatch, 'Could not extract applyJarTransform function body');

const mockJarStage = {
  style: {
    props: {},
    setProperty(k, v) { this.props[k] = String(v); }
  }
};
let needsRedraw = false;

const applyJarTransform = new Function('tf', 'jarStage', 'needsRedraw', `
  ${fnMatch[1]}
  return { jarStage, needsRedraw };
`);

// Test valid transform
let res = applyJarTransform({ x: 45.5, y: 70.2, scale: 1.2 }, mockJarStage, false);
assert.strictEqual(mockJarStage.style.props['--jar-x'], '45.5%');
assert.strictEqual(mockJarStage.style.props['--jar-y'], '70.2%');
assert.strictEqual(mockJarStage.style.props['--jar-scale'], '1.2');
assert.strictEqual(res.needsRedraw, true);

// Test null/undefined resilience
mockJarStage.style.props = {};
res = applyJarTransform(null, mockJarStage, false);
assert.deepStrictEqual(mockJarStage.style.props, {});

console.log('Task 2 overlay transform test passed!');

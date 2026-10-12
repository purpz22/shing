'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing Companion Speech Bubble Markup in index.html...');

const indexPath = path.join(__dirname, '..', 'renderer', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

// Test 1: Bubble font select exists with required fonts
assert.ok(indexHtml.includes('id="comp-bubble-font"'), '#comp-bubble-font select must exist');
assert.ok(indexHtml.includes('value="Nunito"'), 'Bubble font select must have Nunito option');
assert.ok(indexHtml.includes('value="Quicksand"'), 'Bubble font select must have Quicksand option');
assert.ok(indexHtml.includes('value="Fredoka"'), 'Bubble font select must have Fredoka option');
assert.ok(indexHtml.includes('value="Segoe UI"'), 'Bubble font select must have Segoe UI option');
assert.ok(indexHtml.includes('value="VT323"'), 'Bubble font select must have VT323 option');
assert.ok(indexHtml.includes('value="Courier New"'), 'Bubble font select must have Courier New option');

// Test 2: Bubble size slider exists with range and value badge
assert.ok(indexHtml.includes('id="comp-bubble-size"'), '#comp-bubble-size range input must exist');
assert.ok(indexHtml.includes('id="comp-bubble-size-val"'), '#comp-bubble-size-val badge must exist');
assert.ok(indexHtml.includes('min="14"'), 'Size slider must have min 14');
assert.ok(indexHtml.includes('max="28"'), 'Size slider must have max 28');

console.log('Companion Speech Bubble Markup tests passed successfully!');

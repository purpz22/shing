'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing Companion Bubble Overlay Dynamic Font & Size Engine...');

const companionHtmlPath = path.join(__dirname, '..', 'overlays', 'companion.html');
const companionHtml = fs.readFileSync(companionHtmlPath, 'utf8');

// Test 1: Google Fonts link includes Nunito, Quicksand, Fredoka, VT323
assert.ok(companionHtml.includes('fonts.googleapis.com'), 'companion.html must load Google Fonts');
assert.ok(companionHtml.includes('Nunito'), 'companion.html must include Nunito in Google Fonts');
assert.ok(companionHtml.includes('Quicksand'), 'companion.html must include Quicksand in Google Fonts');
assert.ok(companionHtml.includes('Fredoka'), 'companion.html must include Fredoka in Google Fonts');
assert.ok(companionHtml.includes('VT323'), 'companion.html must include VT323 in Google Fonts');

// Test 2: CSS defines custom properties for bubble font and size
assert.ok(companionHtml.includes('--bubble-font'), 'companion.html CSS must define --bubble-font');
assert.ok(companionHtml.includes('--bubble-font-size'), 'companion.html CSS must define --bubble-font-size');
assert.ok(companionHtml.includes('var(--bubble-font'), 'companion.html #bubble must use var(--bubble-font)');
assert.ok(companionHtml.includes('var(--bubble-font-size'), 'companion.html #bubble must use var(--bubble-font-size)');

// Test 3: applyCompanionSettings handles bubbleFont and bubbleFontSize
assert.ok(companionHtml.includes('bubbleFont'), 'applyCompanionSettings must handle bubbleFont');
assert.ok(companionHtml.includes('bubbleFontSize'), 'applyCompanionSettings must handle bubbleFontSize');

// Test 4: Verify root index.html also includes the font link and bubble font variables
const rootIndexPath = path.join(__dirname, '..', '..', 'index.html');
if (fs.existsSync(rootIndexPath)) {
  const rootIndexHtml = fs.readFileSync(rootIndexPath, 'utf8');
  assert.ok(rootIndexHtml.includes('fonts.googleapis.com'), 'root index.html must load Google Fonts');
  assert.ok(rootIndexHtml.includes('--bubble-font'), 'root index.html must define --bubble-font');
  assert.ok(rootIndexHtml.includes('--bubble-font-size'), 'root index.html must define --bubble-font-size');
}

console.log('All Companion Bubble Overlay tests passed successfully!');

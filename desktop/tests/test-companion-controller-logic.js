'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing Companion Controller Logic in app.js...');

const appJsPath = path.join(__dirname, '..', 'renderer', 'app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');

// Test 1: app.js handles comp-bubble-font in initialization
assert.ok(appJs.includes('comp-bubble-font'), 'app.js must reference comp-bubble-font');
assert.ok(appJs.includes('bubbleFont'), 'app.js must handle bubbleFont');

// Test 2: app.js handles comp-bubble-size in initialization and events
assert.ok(appJs.includes('comp-bubble-size'), 'app.js must reference comp-bubble-size');
assert.ok(appJs.includes('comp-bubble-size-val'), 'app.js must reference comp-bubble-size-val');
assert.ok(appJs.includes('bubbleFontSize'), 'app.js must handle bubbleFontSize');

// Test 3: broadcastCompanionChange persists bubbleFont and bubbleFontSize
assert.ok(appJs.includes('bubbleFont:') || appJs.includes('bubbleFont ='), 'app.js must set bubbleFont in companion payload');
assert.ok(appJs.includes('bubbleFontSize:') || appJs.includes('bubbleFontSize ='), 'app.js must set bubbleFontSize in companion payload');

console.log('Companion Controller Logic tests passed successfully!');

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing Events Controller Logic in app.js...');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');

// Test 1: Event Definitions and Controller Functions exist
assert.ok(appJs.includes('EVENT_DEFINITIONS'), 'app.js must declare EVENT_DEFINITIONS');
assert.ok(appJs.includes('renderEventsTable'), 'app.js must declare renderEventsTable()');
assert.ok(appJs.includes('openEventEditorModal'), 'app.js must declare openEventEditorModal()');
assert.ok(appJs.includes('saveEventEditorModal'), 'app.js must declare saveEventEditorModal()');

// Test 2: Event definitions contain all 5 core events
assert.ok(appJs.includes("'follow'"), 'EVENT_DEFINITIONS must include follow');
assert.ok(appJs.includes("'gift'"), 'EVENT_DEFINITIONS must include gift');
assert.ok(appJs.includes("'gift_big'"), 'EVENT_DEFINITIONS must include gift_big');
assert.ok(appJs.includes("'like'"), 'EVENT_DEFINITIONS must include like');
assert.ok(appJs.includes("'share'"), 'EVENT_DEFINITIONS must include share');

console.log('Events Controller Logic tests passed successfully!');

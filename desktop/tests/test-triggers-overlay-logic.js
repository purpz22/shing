const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing Triggers Overlay Logic & Event Rules...');

const overlayHtml = fs.readFileSync(path.join(__dirname, '..', 'overlays', 'triggers.html'), 'utf8');

// Test 1: Verify 'join' is NOT handled as an alert popup in triggers.html
assert.strictEqual(
  overlayHtml.includes("data.type === 'join'"),
  false,
  'Error: triggers.html still handles data.type === join. Join alerts must be completely removed!'
);

// Test 2: Verify active checks exist for all 5 events
assert.ok(
  overlayHtml.includes('events.follow') || overlayHtml.includes("events?.follow"),
  'triggers.html should check follow active state'
);
assert.ok(
  overlayHtml.includes('events[eventKey]') || overlayHtml.includes('events.gift') || overlayHtml.includes("events?.gift"),
  'triggers.html should check gift active state'
);
assert.ok(
  overlayHtml.includes('events[eventKey]') || overlayHtml.includes('events.gift_big') || overlayHtml.includes("events?.gift_big"),
  'triggers.html should check gift_big active state'
);
assert.ok(
  overlayHtml.includes('events.like') || overlayHtml.includes("events?.like"),
  'triggers.html should check like active state'
);
assert.ok(
  overlayHtml.includes('events.share') || overlayHtml.includes("events?.share"),
  'triggers.html should check share active state'
);

// Test 3: Verify share event handling is present
assert.ok(
  overlayHtml.includes("data.type === 'share'"),
  'triggers.html should handle data.type === share'
);

console.log('All Triggers Overlay tests passed successfully!');

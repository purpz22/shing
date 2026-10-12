const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing Events Table & Event Editor Modal Markup...');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');

// Test 1: Events table elements
assert.ok(indexHtml.includes('id="tab-triggers"'), '#tab-triggers must exist');
assert.ok(indexHtml.includes('id="events-table"'), '#events-table must exist');
assert.ok(indexHtml.includes('id="events-table-body"'), '#events-table-body must exist');
assert.ok(indexHtml.includes('class="events-table-wrapper"'), '.events-table-wrapper must exist');

// Test 2: General settings card exists in #tab-triggers
assert.ok(indexHtml.includes('id="trig-duration"'), '#trig-duration must exist');
assert.ok(indexHtml.includes('id="trig-likes-thresh"'), '#trig-likes-thresh must exist');
assert.ok(indexHtml.includes('id="trig-volume"'), '#trig-volume must exist');
assert.ok(indexHtml.includes('id="trig-sound-enabled"'), '#trig-sound-enabled must exist');
assert.ok(indexHtml.includes('id="save-triggers-btn"'), '#save-triggers-btn must exist');

// Test 3: Event Editor Modal elements
assert.ok(indexHtml.includes('id="modal-event-editor"'), '#modal-event-editor must exist');
assert.ok(indexHtml.includes('id="event-modal-title"'), '#event-modal-title must exist');
assert.ok(indexHtml.includes('id="event-modal-close"'), '#event-modal-close must exist');
assert.ok(indexHtml.includes('id="event-modal-msg"'), '#event-modal-msg must exist');
assert.ok(indexHtml.includes('id="event-modal-sound"'), '#event-modal-sound must exist');
assert.ok(indexHtml.includes('id="event-modal-sound-test"'), '#event-modal-sound-test must exist');
assert.ok(indexHtml.includes('id="event-modal-sound-search"'), '#event-modal-sound-search must exist');
assert.ok(indexHtml.includes('id="event-modal-sound-upload"'), '#event-modal-sound-upload must exist');
assert.ok(indexHtml.includes('id="event-modal-media-status"'), '#event-modal-media-status must exist');
assert.ok(indexHtml.includes('id="event-modal-media-preview"'), '#event-modal-media-preview must exist');
assert.ok(indexHtml.includes('id="event-modal-upload-media-btn"'), '#event-modal-upload-media-btn must exist');
assert.ok(indexHtml.includes('id="event-modal-clear-media-btn"'), '#event-modal-clear-media-btn must exist');
assert.ok(indexHtml.includes('id="event-modal-test-btn"'), '#event-modal-test-btn must exist');
assert.ok(indexHtml.includes('id="event-modal-save-btn"'), '#event-modal-save-btn must exist');

console.log('Events Table & Modal Markup tests passed successfully!');

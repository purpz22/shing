const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing Events Table & Event Editor Modal Markup and DOM structure...');

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
assert.ok(indexHtml.includes('id="event-modal-desc"'), '#event-modal-desc must exist');
assert.ok(indexHtml.includes('id="event-modal-icon-wrap"'), '#event-modal-icon-wrap must exist');
assert.ok(indexHtml.includes('id="event-modal-close"'), '#event-modal-close must exist');
assert.ok(indexHtml.includes('id="event-modal-msg"'), '#event-modal-msg must exist');
assert.ok(indexHtml.includes('id="event-modal-hint"'), '#event-modal-hint must exist');
assert.ok(indexHtml.includes('id="event-modal-sound"'), '#event-modal-sound must exist');
assert.ok(indexHtml.includes('id="event-modal-sound-test"'), '#event-modal-sound-test must exist');
assert.ok(indexHtml.includes('id="event-modal-sound-search"'), '#event-modal-sound-search must exist');
assert.ok(indexHtml.includes('id="event-modal-sound-upload"'), '#event-modal-sound-upload must exist');
assert.ok(indexHtml.includes('id="event-modal-media-box"'), '#event-modal-media-box must exist');
assert.ok(indexHtml.includes('id="event-modal-media-status"'), '#event-modal-media-status must exist');
assert.ok(indexHtml.includes('id="event-modal-media-preview"'), '#event-modal-media-preview must exist');
assert.ok(indexHtml.includes('id="event-modal-upload-media-btn"'), '#event-modal-upload-media-btn must exist');
assert.ok(indexHtml.includes('id="event-modal-clear-media-btn"'), '#event-modal-clear-media-btn must exist');
assert.ok(indexHtml.includes('id="event-modal-likes-row"'), '#event-modal-likes-row must exist');
assert.ok(indexHtml.includes('id="event-modal-likes-input"'), '#event-modal-likes-input must exist');
assert.ok(indexHtml.includes('id="event-modal-test-btn"'), '#event-modal-test-btn must exist');
assert.ok(indexHtml.includes('id="event-modal-save-btn"'), '#event-modal-save-btn must exist');
assert.ok(indexHtml.includes('id="event-modal-cancel-btn"'), '#event-modal-cancel-btn must exist');

// Test 4: Verify modal isolation and balanced div tags
// modal-sound-search must be cleanly closed BEFORE modal-event-editor
const soundModalStart = indexHtml.indexOf('id="modal-sound-search"');
const eventModalStart = indexHtml.indexOf('id="modal-event-editor"');
assert.ok(soundModalStart !== -1, 'modal-sound-search must exist');
assert.ok(eventModalStart !== -1, 'modal-event-editor must exist');
assert.ok(soundModalStart < eventModalStart, 'modal-sound-search must precede modal-event-editor');

const sliceBetween = indexHtml.substring(soundModalStart, eventModalStart);
const opensInSound = (sliceBetween.match(/<div(\s|>)/g) || []).length;
const closesInSound = (sliceBetween.match(/<\/div>/g) || []).length;
assert.strictEqual(opensInSound, closesInSound,
  `modal-sound-search must have perfectly balanced <div> tags (opens: ${opensInSound}, closes: ${closesInSound})`);

// Test 5: Verify modal-event-editor div balance
const nextModalStart = indexHtml.indexOf('id="modal-custom-alert"');
assert.ok(nextModalStart !== -1, 'modal-custom-alert must exist');
const sliceEventModal = indexHtml.substring(eventModalStart, nextModalStart);
const opensInEvent = (sliceEventModal.match(/<div(\s|>)/g) || []).length;
const closesInEvent = (sliceEventModal.match(/<\/div>/g) || []).length;
assert.strictEqual(opensInEvent, closesInEvent,
  `modal-event-editor must have perfectly balanced <div> tags (opens: ${opensInEvent}, closes: ${closesInEvent})`);

// Test 6: Verify CSS pointer-events none on table action button SVG and modal z-indices
const stylesCss = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'styles.css'), 'utf8');
assert.ok(stylesCss.includes('.btn-icon-table svg'), 'btn-icon-table svg selector must exist');
assert.ok(stylesCss.includes('pointer-events: none'), 'pointer-events: none must exist');
assert.ok(stylesCss.includes('#modal-sound-search'), '#modal-sound-search z-index rule must exist');
assert.ok(stylesCss.includes('#modal-custom-alert'), '#modal-custom-alert z-index rule must exist');

// Test 7: Verify app.js logic and simulated modal lifecycle
const appJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
assert.ok(appJs.includes('openEventEditorModal'), 'openEventEditorModal must be defined');
assert.ok(appJs.includes('closeEventEditorModal'), 'closeEventEditorModal must be defined');
assert.ok(appJs.includes('saveEventEditorModal'), 'saveEventEditorModal must be defined');
assert.ok(appJs.includes('populateEventModalSoundSelect'), 'populateEventModalSoundSelect must be defined');
assert.ok(appJs.includes('renderEventModalMediaUI'), 'renderEventModalMediaUI must be defined');

// Test 8: Emoji check
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
assert.ok(!emojiRegex.test(indexHtml), 'index.html must not contain emojis');
assert.ok(!emojiRegex.test(stylesCss), 'styles.css must not contain emojis');
assert.ok(!emojiRegex.test(appJs), 'app.js must not contain emojis');

console.log('Events Table & Modal Markup tests passed successfully!');

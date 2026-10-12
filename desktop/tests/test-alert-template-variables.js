'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing Alert Template Variables ({name}, {user}, {username})...');

// Test 1: Verify triggers.html formatAlertMessage logic
const triggersHtml = fs.readFileSync(path.join(__dirname, '..', 'overlays', 'triggers.html'), 'utf8');
assert.ok(triggersHtml.includes('function formatAlertMessage'), 'triggers.html must declare formatAlertMessage');

// Extract formatAlertMessage using eval in isolated scope
const funcMatch = triggersHtml.match(/function formatAlertMessage\([\s\S]*?\n\}/);
assert.ok(funcMatch, 'formatAlertMessage function must be extractable');
const formatAlertMessage = new Function(`${funcMatch[0]}; return formatAlertMessage;`)();

const testViewer = {
  nickname: 'SakuraChan',
  uniqueId: 'sakurachan99',
  user: 'SakuraChan',
  giftName: 'Galaxy',
  count: 2
};

// Test {name} replaces with viewer display name (nickname)
assert.strictEqual(
  formatAlertMessage('Thank you {name} for following!', testViewer, ''),
  'Thank you SakuraChan for following!'
);

// Test {user} backward-compatibility replaces with viewer display name
assert.strictEqual(
  formatAlertMessage('Thank you {user} for following!', testViewer, ''),
  'Thank you SakuraChan for following!'
);

// Test {username} replaces with TikTok unique handle
assert.strictEqual(
  formatAlertMessage('Hello @{username} ({name})!', testViewer, ''),
  'Hello @sakurachan99 (SakuraChan)!'
);

// Test case insensitivity ({NAME}, {User})
assert.strictEqual(
  formatAlertMessage('{NAME} sent {gift} x{count}!', testViewer, ''),
  'SakuraChan sent Galaxy x2!'
);
assert.strictEqual(
  formatAlertMessage('{User} sent {GIFT} x{COUNT}!', testViewer, ''),
  'SakuraChan sent Galaxy x2!'
);

// Test fallback when nickname is missing
assert.strictEqual(
  formatAlertMessage('Thank you {name} for following!', { uniqueId: 'soloviewer' }, ''),
  'Thank you soloviewer for following!'
);

// Test 2: Verify app.js hints say 'name' instead of 'username'
const appJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
assert.ok(
  appJs.includes("hint: 'Use {name} (or {user}) to display the follower name.'"),
  'app.js follow hint must state follower name'
);
assert.ok(
  appJs.includes("hint: 'Use {name} (or {user}) to display the sharer name.'"),
  'app.js share hint must state sharer name'
);
assert.ok(
  !appJs.includes("follower username"),
  'app.js must not say follower username'
);
assert.ok(
  !appJs.includes("sharer username"),
  'app.js must not say sharer username'
);

// Test 3: Verify index.html hint says 'name' instead of 'username'
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
assert.ok(
  indexHtml.includes('Use {name} (or {user}) to display the follower name.'),
  'index.html hint must state follower name'
);
assert.ok(
  !indexHtml.includes("follower's username"),
  'index.html must not say follower username'
);

// Test 4: Verify overlayServer default settings use {name}
const OverlayServer = require('../server/overlayServer');
const server = new OverlayServer(3991, path.resolve(__dirname, '..'));
const defaults = server.getDefaultSettings();
assert.ok(defaults.triggers.followMessage.includes('{name}'), 'followMessage must use {name}');
assert.ok(defaults.triggers.giftMessage.includes('{name}'), 'giftMessage must use {name}');
assert.ok(defaults.triggers.giftBigMessage.includes('{name}'), 'giftBigMessage must use {name}');
assert.ok(defaults.triggers.shareMessage.includes('{name}'), 'shareMessage must use {name}');

// Test 5: Verify zero emojis in all modified files
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
assert.ok(!emojiRegex.test(triggersHtml), 'triggers.html must not contain emojis');
assert.ok(!emojiRegex.test(appJs), 'app.js must not contain emojis');
assert.ok(!emojiRegex.test(indexHtml), 'index.html must not contain emojis');

console.log('All Alert Template Variables tests passed successfully!');

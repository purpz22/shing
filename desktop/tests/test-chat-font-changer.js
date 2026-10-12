'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing Cute Chat Font Changer implementation...');

// 1. Verify overlayServer.js default settings and fallback
const OverlayServer = require('../server/overlayServer');
const defaultSettings = OverlayServer.prototype.getDefaultSettings();
assert.ok(defaultSettings.chat, 'defaultSettings must have chat object');
assert.strictEqual(defaultSettings.chat.fontFamily, 'quicksand', 'default chat.fontFamily must be quicksand');

// Test constructor fallback when settings has empty chat object
const serverInstance = new OverlayServer({
  server: { port: 3399 },
  triggers: {},
  timer: {},
  chat: {}
});
assert.strictEqual(serverInstance.settings.chat.fontFamily, 'quicksand', 'server must fallback chat.fontFamily to quicksand');

// 2. Verify overlays/chat.html
const chatHtml = fs.readFileSync(path.join(__dirname, '..', 'overlays', 'chat.html'), 'utf8');
assert.ok(chatHtml.includes('family=Comfortaa'), 'chat.html must load Comfortaa font');
assert.ok(chatHtml.includes('family=DynaPuff'), 'chat.html must load DynaPuff font');
assert.ok(chatHtml.includes('family=Fredoka'), 'chat.html must load Fredoka font');
assert.ok(chatHtml.includes('family=Itim'), 'chat.html must load Itim font');
assert.ok(chatHtml.includes('family=Nunito'), 'chat.html must load Nunito font');
assert.ok(chatHtml.includes('family=Press+Start+2P'), 'chat.html must load Press Start 2P font');
assert.ok(chatHtml.includes('family=Quicksand'), 'chat.html must load Quicksand font');
assert.ok(chatHtml.includes('family=Sniglet'), 'chat.html must load Sniglet font');
assert.ok(chatHtml.includes('--chat-font-family'), 'chat.html must reference --chat-font-family');
assert.ok(chatHtml.includes('const CHAT_FONT_MAP = {'), 'chat.html must define CHAT_FONT_MAP');
assert.ok(chatHtml.includes('fontFamily: \'quicksand\''), 'chat.html must default chatSettings.fontFamily to quicksand');
assert.ok(chatHtml.includes('.font-pixel'), 'chat.html must have styling for pixel font');

// 3. Verify renderer/index.html
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
assert.ok(indexHtml.includes('id="chat-font-family"'), 'index.html must include #chat-font-family select');
assert.ok(indexHtml.includes('value="quicksand"'), 'index.html must have quicksand option');
assert.ok(indexHtml.includes('value="fredoka"'), 'index.html must have fredoka option');
assert.ok(indexHtml.includes('value="nunito"'), 'index.html must have nunito option');
assert.ok(indexHtml.includes('value="itim"'), 'index.html must have itim option');
assert.ok(indexHtml.includes('value="sniglet"'), 'index.html must have sniglet option');
assert.ok(indexHtml.includes('value="dynapuff"'), 'index.html must have dynapuff option');
assert.ok(indexHtml.includes('value="comfortaa"'), 'index.html must have comfortaa option');
assert.ok(indexHtml.includes('value="pixel"'), 'index.html must have pixel option');
assert.ok(indexHtml.includes('value="system"'), 'index.html must have system option');

// 4. Verify renderer/styles.css
const stylesCss = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'styles.css'), 'utf8');
assert.ok(stylesCss.includes('font-family: var(--chat-font-family'), 'styles.css must set font-family with --chat-font-family in .chat-dash-preview');
assert.ok(stylesCss.includes('.chat-dash-preview.font-pixel'), 'styles.css must have .chat-dash-preview.font-pixel rules');

// 5. Verify renderer/app.js
const appJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
assert.ok(appJs.includes('const CHAT_FONT_MAP = {'), 'app.js must define CHAT_FONT_MAP');
assert.ok(appJs.includes('$(\'chat-font-family\')'), 'app.js must query chat-font-family');
assert.ok(appJs.includes('$(\'chat-font-family\')?.addEventListener(\'change\', updateChatPreviewBox)'), 'app.js must listen to chat-font-family change');
assert.ok(appJs.includes('fontFamily: $(\'chat-font-family\') ? $(\'chat-font-family\').value : \'quicksand\''), 'app.js must save fontFamily');
assert.ok(appJs.includes('appSettings.chat.fontFamily || \'quicksand\''), 'app.js must populate fontFamily from appSettings');

// 6. Verify zero emojis rule across all touched files
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]/u;
const filesToCheck = [
  'desktop/server/overlayServer.js',
  'desktop/overlays/chat.html',
  'desktop/renderer/index.html',
  'desktop/renderer/styles.css',
  'desktop/renderer/app.js'
];
for (const relPath of filesToCheck) {
  const content = fs.readFileSync(path.join(__dirname, '..', '..', relPath), 'utf8');
  assert.strictEqual(emojiRegex.test(content), false, `File ${relPath} must contain NO emojis`);
}

console.log('All Cute Chat Font Changer unit tests passed successfully!');

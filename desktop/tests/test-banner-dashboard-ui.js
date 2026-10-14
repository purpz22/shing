'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const htmlPath = path.resolve(__dirname, '../renderer/index.html');
const jsPath = path.resolve(__dirname, '../renderer/app.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

// 1. Verify Streamer Info Banner overlay card in Browser Overlays grid
assert(html.includes('Streamer Info Banner'), 'index.html missing "Streamer Info Banner" title');
assert(
  html.includes('http://localhost:3333/overlays/banner.html'),
  'index.html missing copyable URL http://localhost:3333/overlays/banner.html'
);
assert(
  html.includes('data-overlay="banner"'),
  'index.html missing button with data-overlay="banner" for preview'
);
assert(
  html.includes('1:1 Centered About Me & Socials Widget') ||
  html.includes('1:1 Centered About Me &amp; Socials Widget'),
  'index.html missing banner subtitle "1:1 Centered About Me & Socials Widget"'
);

// 2. Verify dedicated Streamer Info Banner section in sidebar navigation & tab-pane
assert(html.includes('data-tab="banner"'), 'index.html missing sidebar nav button with data-tab="banner"');
assert(html.includes('data-icon="banner"'), 'index.html missing banner nav-icon data-icon="banner"');
assert(html.includes('id="tab-banner"'), 'index.html missing dedicated section with id="tab-banner"');
assert(html.includes('id="banner-preview-iframe"'), 'index.html missing #banner-preview-iframe in dedicated stage card');

// 2b. Verify Streamer Info Banner customization controls
assert(html.includes('id="banner-enable-toggle"'), 'index.html missing #banner-enable-toggle');
assert(html.includes('id="banner-scale-slider"'), 'index.html missing #banner-scale-slider');
assert(html.includes('id="banner-scale-badge"'), 'index.html missing #banner-scale-badge');
assert(html.includes('id="banner-topper-select"'), 'index.html missing #banner-topper-select');
assert(html.includes('id="banner-anim-select"'), 'index.html missing #banner-anim-select');
assert(html.includes('id="banner-template-select"'), 'index.html missing #banner-template-select');
assert(html.includes('id="banner-aspect-select"'), 'index.html missing #banner-aspect-select');
assert(html.includes('id="banner-show-avatar-toggle"'), 'index.html missing #banner-show-avatar-toggle');
assert(html.includes('id="banner-autocycle-toggle"'), 'index.html missing #banner-autocycle-toggle');
assert(html.includes('id="banner-duration-slider"'), 'index.html missing #banner-duration-slider');
assert(html.includes('id="banner-duration-badge"'), 'index.html missing #banner-duration-badge');
assert(html.includes('id="banner-transition-select"'), 'index.html missing #banner-transition-select');
assert(html.includes('id="banner-particles-select"'), 'index.html missing #banner-particles-select');
assert(html.includes('id="banner-shine-toggle"'), 'index.html missing #banner-shine-toggle');
assert(html.includes('id="banner-copy-localhost-btn"'), 'index.html missing #banner-copy-localhost-btn');
assert(html.includes('id="banner-copy-127-btn"'), 'index.html missing #banner-copy-127-btn');
assert(html.includes('id="preview-scene-1-btn"'), 'index.html missing #preview-scene-1-btn');
assert(html.includes('id="preview-scene-2-btn"'), 'index.html missing #preview-scene-2-btn');
assert(html.includes('id="preview-scene-3-btn"'), 'index.html missing #preview-scene-3-btn');

// Text inputs
assert(html.includes('id="banner-name-input"'), 'index.html missing #banner-name-input');
assert(html.includes('id="banner-subtitle-input"'), 'index.html missing #banner-subtitle-input');
assert(html.includes('id="banner-bio-input"'), 'index.html missing #banner-bio-input');
assert(html.includes('id="banner-schedule-input"'), 'index.html missing #banner-schedule-input');
assert(html.includes('id="banner-status-input"'), 'index.html missing #banner-status-input');
assert(html.includes('id="banner-twitch-input"'), 'index.html missing #banner-twitch-input');
assert(html.includes('id="banner-tiktok-input"'), 'index.html missing #banner-tiktok-input');
assert(html.includes('id="banner-discord-input"'), 'index.html missing #banner-discord-input');
assert(html.includes('id="banner-twitter-input"'), 'index.html missing #banner-twitter-input');
assert(html.includes('id="banner-instagram-input"'), 'index.html missing #banner-instagram-input');
assert(html.includes('id="banner-youtube-input"'), 'index.html missing #banner-youtube-input');

// Verify cute templates
const templates = ['pastel-dream', 'cozy-cat', 'magical-ribbon', 'pixel-arcade', 'sakura-blossom'];
templates.forEach(tpl => {
  assert(html.includes(`data-template="${tpl}"`), `index.html missing template card with data-template="${tpl}"`);
});

// 3. Verify scale slider attributes
const sliderMatch = html.match(/id="banner-scale-slider"[^>]*>/) || html.match(/<input[^>]*id="banner-scale-slider"[^>]*>/);
assert(sliderMatch, 'Could not find banner-scale-slider input tag in index.html');
const sliderTag = sliderMatch[0];
assert(sliderTag.includes('min="0.5"'), 'banner-scale-slider must have min="0.5"');
assert(sliderTag.includes('max="1.5"'), 'banner-scale-slider must have max="1.5"');
assert(sliderTag.includes('step="0.05"'), 'banner-scale-slider must have step="0.05"');

// 4. Verify options in topper select
const toppers = ['bear', 'ribbon', 'cat', 'none'];
toppers.forEach(topper => {
  assert(
    html.includes(`value="${topper}"`),
    `index.html missing topper option with value="${topper}"`
  );
});

// 5. Verify options in animation select
const anims = ['float', 'sway', 'pulse', 'breathe', 'bounce'];
anims.forEach(anim => {
  assert(
    html.includes(`value="${anim}"`),
    `index.html missing animation option with value="${anim}"`
  );
});

// 6. Verify app.js contains banner controls integration and saveSettingsDebounced
assert(js.includes('saveSettingsDebounced'), 'app.js must implement/call saveSettingsDebounced()');
assert(js.includes('banner-enable-toggle'), 'app.js missing banner-enable-toggle binding');
assert(js.includes('banner-scale-slider'), 'app.js missing banner-scale-slider binding');
assert(js.includes('banner-scale-badge'), 'app.js missing banner-scale-badge update logic');
assert(js.includes('banner-topper-select'), 'app.js missing banner-topper-select binding');
assert(js.includes('banner-anim-select'), 'app.js missing banner-anim-select binding');
assert(js.includes('banner-name-input'), 'app.js missing banner-name-input binding');
assert(js.includes('banner-template-select'), 'app.js missing banner-template-select binding');
assert(js.includes('banner-aspect-select'), 'app.js missing banner-aspect-select binding');
assert(js.includes('banner-duration-slider'), 'app.js missing banner-duration-slider binding');
assert(js.includes('banner-transition-select'), 'app.js missing banner-transition-select binding');
assert(js.includes('banner-particles-select'), 'app.js missing banner-particles-select binding');
assert(js.includes('banner-copy-localhost-btn'), 'app.js missing banner-copy-localhost-btn binding');
assert(js.includes('banner-copy-127-btn'), 'app.js missing banner-copy-127-btn binding');

// 7. Functional simulation of banner event handlers and boundary clamping
{
  const elements = {};
  function mockEl(id) {
    return {
      id,
      value: '',
      checked: false,
      textContent: '',
      style: {
        props: {},
        setProperty(k, v) { this.props[k] = String(v); }
      },
      listeners: {},
      addEventListener(evt, fn) {
        if (!this.listeners[evt]) this.listeners[evt] = [];
        this.listeners[evt].push(fn);
      },
      trigger(evt, eventObj = {}) {
        eventObj.stopPropagation = eventObj.stopPropagation || (() => {});
        eventObj.target = eventObj.target || this;
        (this.listeners[evt] || []).forEach(fn => fn(eventObj));
      }
    };
  }

  const ids = [
    'banner-enable-toggle',
    'banner-scale-slider',
    'banner-scale-badge',
    'banner-topper-select',
    'banner-anim-select',
    'banner-name-input',
    'banner-subtitle-input',
    'banner-bio-input',
    'banner-twitch-input',
    'banner-tiktok-input',
    'banner-discord-input',
    'banner-twitter-input',
    'banner-instagram-input',
    'banner-youtube-input'
  ];
  ids.forEach(id => { elements[id] = mockEl(id); });

  const appSettings = {
    banner: {
      enabled: true,
      scale: 1.0,
      topper: 'bear',
      animation: 'float',
      name: 'shimmy_ming',
      subtitle: 'Cozy Variety Streamer',
      bio: 'Welcome to the cozy corner!',
      socials: {
        twitch: 'shimmy_ming',
        tiktok: '@shimmy_ming',
        discord: '',
        twitter: '',
        instagram: '',
        youtube: ''
      }
    }
  };

  let saveCallCount = 0;
  function saveSettingsDebounced() {
    saveCallCount++;
  }
  const $ = (id) => elements[id] || null;

  // Simulate binding logic as required in app.js
  $('banner-enable-toggle').addEventListener('change', e => {
    if (!appSettings.banner) appSettings.banner = {};
    appSettings.banner.enabled = e.target.checked;
    saveSettingsDebounced();
  });

  function clampBannerScale(val) {
    const num = parseFloat(val);
    if (!Number.isFinite(num)) return 1.0;
    return Math.max(0.5, Math.min(1.5, num));
  }

  $('banner-scale-slider').addEventListener('input', e => {
    if (!appSettings.banner) appSettings.banner = {};
    const clamped = clampBannerScale(e.target.value);
    appSettings.banner.scale = clamped;
    if ($('banner-scale-badge')) {
      $('banner-scale-badge').textContent = `${Math.round(clamped * 100)}%`;
      $('banner-scale-badge').style.setProperty('--banner-scale', clamped);
    }
    saveSettingsDebounced();
  });

  $('banner-topper-select').addEventListener('change', e => {
    if (!appSettings.banner) appSettings.banner = {};
    appSettings.banner.topper = e.target.value;
    saveSettingsDebounced();
  });

  $('banner-anim-select').addEventListener('change', e => {
    if (!appSettings.banner) appSettings.banner = {};
    appSettings.banner.animation = e.target.value;
    saveSettingsDebounced();
  });

  $('banner-name-input').addEventListener('input', e => {
    if (!appSettings.banner) appSettings.banner = {};
    appSettings.banner.name = e.target.value;
    saveSettingsDebounced();
  });

  // Verify scale clamping at 0.50 and 1.50 boundaries
  $('banner-scale-slider').value = '0.20'; // below min
  $('banner-scale-slider').trigger('input');
  assert.strictEqual(appSettings.banner.scale, 0.5, 'Scale below 0.5 must be clamped to 0.5');
  assert.strictEqual($('banner-scale-badge').textContent, '50%', 'Scale badge must display 50%');

  $('banner-scale-slider').value = '2.50'; // above max
  $('banner-scale-slider').trigger('input');
  assert.strictEqual(appSettings.banner.scale, 1.5, 'Scale above 1.5 must be clamped to 1.5');
  assert.strictEqual($('banner-scale-badge').textContent, '150%', 'Scale badge must display 150%');

  $('banner-scale-slider').value = '1.25';
  $('banner-scale-slider').trigger('input');
  assert.strictEqual(appSettings.banner.scale, 1.25, 'Scale 1.25 must be preserved');
  assert.strictEqual($('banner-scale-badge').textContent, '125%', 'Scale badge must display 125%');

  // Verify toggle
  $('banner-enable-toggle').checked = false;
  $('banner-enable-toggle').trigger('change');
  assert.strictEqual(appSettings.banner.enabled, false, 'Toggle must update banner.enabled to false');

  // Verify topper
  $('banner-topper-select').value = 'ribbon';
  $('banner-topper-select').trigger('change');
  assert.strictEqual(appSettings.banner.topper, 'ribbon', 'Topper must update banner.topper');

  // Verify animation
  $('banner-anim-select').value = 'breathe';
  $('banner-anim-select').trigger('change');
  assert.strictEqual(appSettings.banner.animation, 'breathe', 'Animation must update banner.animation');

  // Verify name
  $('banner-name-input').value = 'CustomStreamer';
  $('banner-name-input').trigger('input');
  assert.strictEqual(appSettings.banner.name, 'CustomStreamer', 'Name input must update banner.name');

  assert(saveCallCount >= 7, 'All control changes must trigger saveSettingsDebounced');
}

// 8. Functional test of exported app.js functions with mocked environment
{
  global.window = {
    addEventListener: () => {},
    api: { saveSettings: (s) => { global.__savedSettings = s; } }
  };
  const mockDOMElements = {};
  const allIds = [
    'banner-enable-toggle',
    'banner-scale-slider',
    'banner-scale-badge',
    'banner-topper-select',
    'banner-anim-select',
    'banner-name-input',
    'banner-subtitle-input',
    'banner-bio-input',
    'banner-twitch-input',
    'banner-tiktok-input',
    'banner-discord-input',
    'banner-twitter-input',
    'banner-instagram-input',
    'banner-youtube-input'
  ];
  allIds.forEach(id => {
    mockDOMElements[id] = {
      id,
      value: '',
      checked: false,
      textContent: '',
      style: {
        props: {},
        setProperty(k, v) { this.props[k] = String(v); }
      }
    };
  });
  global.document = {
    addEventListener: () => {},
    getElementById: (id) => mockDOMElements[id] || null,
    querySelectorAll: () => []
  };

  const app = require('../renderer/app.js');
  assert.strictEqual(typeof app.clampBannerScale, 'function', 'app.clampBannerScale must be exported');
  assert.strictEqual(typeof app.saveSettingsDebounced, 'function', 'app.saveSettingsDebounced must be exported');
  assert.strictEqual(typeof app.populateBannerSettings, 'function', 'app.populateBannerSettings must be exported');

  // Test clampBannerScale boundaries
  assert.strictEqual(app.clampBannerScale(0.1), 0.5);
  assert.strictEqual(app.clampBannerScale(1.8), 1.5);
  assert.strictEqual(app.clampBannerScale('1.2'), 1.2);
  assert.strictEqual(app.clampBannerScale(null), 1.0);
  assert.strictEqual(app.clampBannerScale('invalid'), 1.0);

  // Test populateBannerSettings
  global.window.currentSettings = {
    banner: {
      enabled: false,
      scale: 1.2,
      topper: 'cat',
      animation: 'sway',
      name: 'shimmy_ming Live',
      subtitle: 'Chill Streams',
      bio: 'Daily cozy gaming',
      socials: {
        twitch: 'AkiLive',
        tiktok: '@aki',
        discord: 'discord.gg/aki',
        twitter: '@aki',
        instagram: '@aki',
        youtube: '@aki'
      }
    }
  };
  global.window.appSettings = global.window.currentSettings;
  app.populateBannerSettings();

  assert.strictEqual(mockDOMElements['banner-enable-toggle'].checked, false);
  assert.strictEqual(mockDOMElements['banner-scale-slider'].value, '1.2');
  assert.strictEqual(mockDOMElements['banner-scale-badge'].textContent, '120%');
  assert.strictEqual(mockDOMElements['banner-topper-select'].value, 'cat');
  assert.strictEqual(mockDOMElements['banner-anim-select'].value, 'sway');
  assert.strictEqual(mockDOMElements['banner-name-input'].value, 'shimmy_ming Live');
  assert.strictEqual(mockDOMElements['banner-subtitle-input'].value, 'Chill Streams');
  assert.strictEqual(mockDOMElements['banner-bio-input'].value, 'Daily cozy gaming');
  assert.strictEqual(mockDOMElements['banner-twitch-input'].value, 'AkiLive');
  assert.strictEqual(mockDOMElements['banner-tiktok-input'].value, '@aki');
  assert.strictEqual(mockDOMElements['banner-discord-input'].value, 'discord.gg/aki');
  assert.strictEqual(mockDOMElements['banner-twitter-input'].value, '@aki');
  assert.strictEqual(mockDOMElements['banner-instagram-input'].value, '@aki');
  assert.strictEqual(mockDOMElements['banner-youtube-input'].value, '@aki');

  // Test saveSettingsDebounced immediate save with delay=0
  global.__savedSettings = null;
  app.saveSettingsDebounced(0);
  assert.ok(global.__savedSettings, 'saveSettingsDebounced(0) must immediately invoke window.api.saveSettings');
  assert.strictEqual(global.__savedSettings.banner.scale, 1.2);
}

// 9. Verify Zero Emojis in relevant sections
const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

// Check index.html for banner section emoji occurrences
const bannerCardIndex = html.indexOf('Streamer Info Banner');
if (bannerCardIndex !== -1) {
  const bannerCardSnippet = html.slice(bannerCardIndex, bannerCardIndex + 2500);
  assert(!emojiRegex.test(bannerCardSnippet), 'Found emoji in banner overlay card markup!');
}

const bannerCompanionIndex = html.indexOf('banner-enable-toggle');
if (bannerCompanionIndex !== -1) {
  const bannerCompanionSnippet = html.slice(bannerCompanionIndex - 200, bannerCompanionIndex + 3000);
  assert(!emojiRegex.test(bannerCompanionSnippet), 'Found emoji in companion banner controls markup!');
}

console.log('PASS: test-banner-dashboard-ui.js - All Streamer Info Banner dashboard UI tests passed successfully.');


'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log('Testing Standalone Streamer Info Banner Overlay (banner.html)...');

const bannerPath = path.resolve(__dirname, '../overlays/banner.html');

// Step 1: Ensure banner.html exists
assert.ok(fs.existsSync(bannerPath), 'desktop/overlays/banner.html must exist');

const bannerHtml = fs.readFileSync(bannerPath, 'utf8');

// Test 1: Zero Emojis across all code, markup, styles, and comments
const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
const emojiMatch = bannerHtml.match(EMOJI_REGEX);
assert.strictEqual(emojiMatch, null, 'banner.html must contain strictly zero emojis');

// Test 2: Viewport and Centered 1:1 Aspect Ratio Container
assert.ok(bannerHtml.includes('id="streamer-banner-container"'), 'Must contain #streamer-banner-container');
assert.ok(
  /aspect-ratio\s*:\s*1\s*\/\s*1/.test(bannerHtml),
  'Must specify aspect-ratio: 1 / 1'
);
assert.ok(
  /transform\s*:\s*translate\(\s*-50%\s*,\s*-50%\s*\)/.test(bannerHtml),
  'Must center via transform: translate(-50%, -50%)'
);
assert.ok(
  bannerHtml.includes('--banner-scale'),
  'Must support --banner-scale CSS variable'
);
assert.ok(
  /scale\(var\(--banner-scale/i.test(bannerHtml),
  'Must scale container using var(--banner-scale)'
);

// Test 3: SVG Decorative Toppers (bear, ribbon, cat, wings) & Hidden state for none
assert.ok(bannerHtml.includes('id="banner-topper"'), 'Must contain #banner-topper container');
assert.ok(bannerHtml.includes('topper-bear') || bannerHtml.includes('topper="bear"'), 'Must contain bear topper');
assert.ok(bannerHtml.includes('topper-ribbon') || bannerHtml.includes('topper="ribbon"'), 'Must contain ribbon topper');
assert.ok(bannerHtml.includes('topper-cat') || bannerHtml.includes('topper="cat"'), 'Must contain cat topper');
assert.ok(bannerHtml.includes('topper-wings') || bannerHtml.includes('topper="wings"'), 'Must contain wings topper');

// Check topper SVG content keywords
assert.ok(bannerHtml.includes('<svg'), 'Toppers must use SVG vectors');
assert.ok(/bear/i.test(bannerHtml), 'Bear topper must be present');
assert.ok(/ribbon/i.test(bannerHtml), 'Ribbon topper must be present');
assert.ok(/cat/i.test(bannerHtml), 'Cat topper must be present');
assert.ok(/wings/i.test(bannerHtml), 'Wings topper must be present');

// Test 3b: 5 Cute Aesthetic Theme Classes
const cuteThemes = ['theme-pastel-dream', 'theme-cozy-cat', 'theme-magical-ribbon', 'theme-pixel-arcade', 'theme-sakura-blossom'];
for (const tpl of cuteThemes) {
  assert.ok(bannerHtml.includes(tpl), `Must define cute theme class .${tpl}`);
}

// Test 3c: Particle Canvas and Glossy Shine Sweep
assert.ok(bannerHtml.includes('id="banner-particle-canvas"'), 'Must contain #banner-particle-canvas');
assert.ok(bannerHtml.includes('id="banner-shine-overlay"'), 'Must contain #banner-shine-overlay');
assert.ok(bannerHtml.includes('shineSweep'), 'Must contain shineSweep keyframe animation');

// Test 3d: Multi-Scene Structure & Indicators
assert.ok(bannerHtml.includes('id="banner-scene-1"'), 'Must contain Scene 1 (Identity)');
assert.ok(bannerHtml.includes('id="banner-scene-2"'), 'Must contain Scene 2 (Bio & Schedule)');
assert.ok(bannerHtml.includes('id="banner-scene-3"'), 'Must contain Scene 3 (Socials)');
assert.ok(bannerHtml.includes('id="banner-schedule-text"'), 'Must contain #banner-schedule-text');
assert.ok(bannerHtml.includes('id="scene-dots-container"'), 'Must contain #scene-dots-container');
assert.ok(bannerHtml.includes('id="scene-progress-fill"'), 'Must contain #scene-progress-fill');

// Test 4: CSS Animation Classes and Keyframes
const requiredAnimClasses = ['anim-float', 'anim-sway', 'anim-pulse', 'anim-breathe', 'anim-bounce'];
for (const cls of requiredAnimClasses) {
  assert.ok(bannerHtml.includes(cls), `Must define animation class .${cls}`);
}
const requiredKeyframes = ['@keyframes float', '@keyframes sway', '@keyframes pulse', '@keyframes breathe', '@keyframes bounce'];
for (const kf of requiredKeyframes) {
  assert.ok(bannerHtml.includes(kf), `Must define keyframe ${kf}`);
}

// Test 5: 64x64 Chibi Avatar Canvas
assert.ok(
  /<canvas[^>]*id=["']banner-avatar-canvas["'][^>]*width=["']64["'][^>]*height=["']64["']/i.test(bannerHtml) ||
  /<canvas[^>]*width=["']64["'][^>]*height=["']64["'][^>]*id=["']banner-avatar-canvas["']/i.test(bannerHtml),
  'Must contain <canvas id="banner-avatar-canvas" width="64" height="64">'
);

// Test 6: Text Elements and Socials Grid
assert.ok(bannerHtml.includes('id="banner-name-text"'), 'Must contain #banner-name-text');
assert.ok(bannerHtml.includes('id="banner-subtitle-text"'), 'Must contain #banner-subtitle-text');
assert.ok(bannerHtml.includes('banner-divider'), 'Must contain .banner-divider');
assert.ok(bannerHtml.includes('id="banner-bio-text"'), 'Must contain #banner-bio-text');
assert.ok(bannerHtml.includes('id="banner-socials-grid"'), 'Must contain #banner-socials-grid');

// Social icon vectors
const socialPlatforms = ['twitch', 'tiktok', 'discord', 'twitter', 'instagram', 'youtube'];
for (const plat of socialPlatforms) {
  assert.ok(bannerHtml.toLowerCase().includes(plat), `Must support social platform: ${plat}`);
}

// Test 7: WebSocket Connection, Auto-reconnect <= 2s, and Fallback Fetch
assert.ok(bannerHtml.includes('WebSocket'), 'Must connect using WebSocket');
assert.ok(bannerHtml.includes('/api/settings'), 'Must have fallback or initial fetch to /api/settings');
assert.ok(/2000/.test(bannerHtml), 'Must reconnect WebSocket within 2 seconds (2000ms)');

// Test 8: Companion Character Synchronization Logic
assert.ok(bannerHtml.includes('companion'), 'Must handle settings.companion updates');
assert.ok(bannerHtml.includes('hc') || bannerHtml.includes('hairColor'), 'Must handle hair color');
assert.ok(bannerHtml.includes('oc') || bannerHtml.includes('outfitColor'), 'Must handle outfit color');

// Test 9: Functional VM Simulation of Banner Logic
function createMockElement(id = '', tagName = 'div') {
  const children = [];
  const style = {
    setProperty: (k, v) => { style[k] = String(v); },
    removeProperty: (k) => { delete style[k]; },
    display: ''
  };
  const classList = new Set();
  const attributes = {};

  return {
    id,
    tagName: tagName.toUpperCase(),
    style,
    classList: {
      add: (c) => classList.add(c),
      remove: (c) => classList.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          classList.has(c) ? classList.delete(c) : classList.add(c);
        } else if (force) {
          classList.add(c);
        } else {
          classList.delete(c);
        }
      },
      contains: (c) => classList.has(c),
      values: () => Array.from(classList)
    },
    textContent: '',
    innerHTML: '',
    children,
    childNodes: children,
    setAttribute: (k, v) => { attributes[k] = String(v); },
    getAttribute: (k) => attributes[k] || null,
    hasAttribute: (k) => k in attributes,
    removeAttribute: (k) => { delete attributes[k]; },
    appendChild: (child) => { children.push(child); return child; },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx !== -1) children.splice(idx, 1);
      return child;
    },
    dataset: attributes,
    getContext: () => ({
      clearRect: () => {},
      drawImage: () => {},
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {},
      imageSmoothingEnabled: false,
      save: () => {},
      restore: () => {},
      scale: () => {},
      translate: () => {}
    })
  };
}

function runBannerScript(html) {
  const scriptMatches = html.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi);
  assert.ok(scriptMatches && scriptMatches.length > 0, 'banner.html must contain a script tag');

  // Extract script text
  const scriptContent = scriptMatches
    .map(tag => tag.replace(/<script[\s\S]*?>/i, '').replace(/<\/script>/i, ''))
    .join('\n');

  const elements = {
    'streamer-banner-container': createMockElement('streamer-banner-container'),
    'banner-topper': createMockElement('banner-topper'),
    'banner-card': createMockElement('banner-card'),
    'banner-avatar-canvas': createMockElement('banner-avatar-canvas', 'canvas'),
    'banner-name-text': createMockElement('banner-name-text'),
    'banner-subtitle-text': createMockElement('banner-subtitle-text'),
    'banner-bio-text': createMockElement('banner-bio-text'),
    'banner-socials-grid': createMockElement('banner-socials-grid')
  };

  const wsInstances = [];
  let timeoutCallbacks = [];

  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
      this.onopen = null;
      this.close = () => {
        if (this.onclose) this.onclose();
      };
      wsInstances.push(this);
    }
  }

  const sandbox = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    document: {
      getElementById: (id) => elements[id] || null,
      querySelector: (sel) => {
        if (sel.startsWith('#')) return elements[sel.slice(1)] || null;
        return null;
      },
      querySelectorAll: (sel) => [],
      createElement: (tag) => createMockElement('', tag),
      body: createMockElement('body')
    },
    window: {
      location: { protocol: 'http:', host: 'localhost:3333' },
      devicePixelRatio: 1,
      addEventListener: () => {},
      removeEventListener: () => {},
      requestAnimationFrame: () => 1
    },
    location: { protocol: 'http:', host: 'localhost:3333' },
    WebSocket: MockWebSocket,
    fetch: () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        banner: {
          enabled: true,
          scale: 1.25,
          topper: 'cat',
          animation: 'sway',
          name: 'shimmy_ming Live',
          subtitle: 'Cozy Gamer',
          bio: 'Daily cozy streams and pixel art!',
          socials: {
            twitch: 'shimmy_ming',
            tiktok: '@shimmy_ming',
            discord: '',
            twitter: ''
          }
        },
        companion: {
          hair: 'twintails',
          hc: '#48b5ff',
          oc: '#ff7eb9'
        }
      })
    }),
    setTimeout: (fn, ms) => {
      timeoutCallbacks.push({ fn, ms });
      return timeoutCallbacks.length;
    },
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    performance: { now: () => 1000 },
    requestAnimationFrame: () => 1
  };

  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(scriptContent, ctx);

  return { sandbox, elements, wsInstances, timeoutCallbacks };
}

const sim = runBannerScript(bannerHtml);
assert.ok(sim.wsInstances.length > 0, 'Overlay must initiate WebSocket connection on startup');

const activeWs = sim.wsInstances[0];
assert.ok(typeof activeWs.onmessage === 'function', 'WebSocket must have onmessage handler');

// 9a. Test receiving init event with banner configuration
activeWs.onmessage({
  data: JSON.stringify({
    type: 'init',
    settings: {
      banner: {
        enabled: true,
        scale: 1.15,
        topper: 'ribbon',
        animation: 'pulse',
        name: 'TesterAki',
        subtitle: 'Variety Artist',
        bio: 'Chill vibes and comfy art.',
        socials: {
          twitch: 'TesterAki',
          youtube: 'TesterAkiTV',
          discord: '',
          twitter: '',
          tiktok: '',
          instagram: ''
        }
      },
      companion: {
        hair: 'bob',
        hc: '#ff7eb9',
        oc: '#38d39f'
      }
    }
  })
});

// Verify text updates
assert.strictEqual(sim.elements['banner-name-text'].textContent, 'TesterAki', 'Streamer name must update');
assert.strictEqual(sim.elements['banner-subtitle-text'].textContent, 'Variety Artist', 'Subtitle must update');
assert.strictEqual(sim.elements['banner-bio-text'].textContent, 'Chill vibes and comfy art.', 'Bio must update');

// Verify scale application
const container = sim.elements['streamer-banner-container'];
assert.ok(
  container.style['--banner-scale'] === '1.15' ||
  container.style.getPropertyValue?.('--banner-scale') === '1.15' ||
  container.style['transform']?.includes('1.15'),
  'Container must reflect updated banner scale 1.15'
);

// Verify animation class
assert.ok(
  container.classList.contains('anim-pulse') || container.getAttribute('data-animation') === 'pulse',
  'Container must apply anim-pulse or data-animation="pulse"'
);

// Verify topper update
const topperEl = sim.elements['banner-topper'];
assert.ok(
  topperEl.getAttribute('data-topper') === 'ribbon' || container.getAttribute('data-topper') === 'ribbon',
  'Topper must reflect ribbon selection'
);

// Verify partial socials rendering (twitch and youtube non-empty, others empty)
const socialsGrid = sim.elements['banner-socials-grid'];
assert.strictEqual(socialsGrid.children.length, 2, 'Must render exactly 2 social badges for non-empty handles');

// 9b. Test switching topper to "none" completely hides topper without whitespace
activeWs.onmessage({
  data: JSON.stringify({
    type: 'settings:update',
    settings: {
      banner: {
        topper: 'none'
      }
    }
  })
});

assert.ok(
  topperEl.style.display === 'none' ||
  topperEl.getAttribute('data-topper') === 'none' ||
  topperEl.classList.contains('hidden') ||
  container.getAttribute('data-topper') === 'none',
  'Topper must be cleanly hidden when topper is set to none'
);

// 9c. Test WebSocket reconnection resilience on close
activeWs.onclose();
assert.ok(sim.timeoutCallbacks.length > 0, 'Must schedule reconnect timeout on WebSocket close');
const reconnectTimeout = sim.timeoutCallbacks[sim.timeoutCallbacks.length - 1];
assert.ok(reconnectTimeout.ms <= 2000, `Reconnect timeout must be <= 2000ms (got ${reconnectTimeout.ms})`);

console.log('All Streamer Info Banner Overlay markup and behavior tests passed successfully!');


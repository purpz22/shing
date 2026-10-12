'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const stayPath = fs.existsSync(path.resolve(__dirname, '../overlays/viewerranking.html'))
  ? path.resolve(__dirname, '../overlays/viewerranking.html')
  : path.resolve('desktop/overlays/viewerranking.html');

const likersPath = fs.existsSync(path.resolve(__dirname, '../overlays/toplikers.html'))
  ? path.resolve(__dirname, '../overlays/toplikers.html')
  : path.resolve('desktop/overlays/toplikers.html');

const stayHtml = fs.readFileSync(stayPath, 'utf8');
const likersHtml = fs.readFileSync(likersPath, 'utf8');

const themes = ['Purple', 'Pink', 'Blue', 'Green', 'Dark', 'Light'];

// 1. Verify CSS rules for all 6 plain color themes in both overlay files
themes.forEach(theme => {
  assert(
    stayHtml.includes(`[data-theme="${theme}"]`),
    `viewerranking.html missing CSS selector for theme ${theme}`
  );
  assert(
    likersHtml.includes(`[data-theme="${theme}"]`),
    `toplikers.html missing CSS selector for theme ${theme}`
  );
});

// 2. Verify GPU scaling and transform properties
assert(stayHtml.includes('--ranking-scale'), 'viewerranking.html missing --ranking-scale CSS variable');
assert(likersHtml.includes('--ranking-scale'), 'toplikers.html missing --ranking-scale CSS variable');

assert(
  stayHtml.includes('transform: scale(var(--ranking-scale'),
  'viewerranking.html missing transform scale CSS rule'
);
assert(
  likersHtml.includes('transform: scale(var(--ranking-scale'),
  'toplikers.html missing transform scale CSS rule'
);

assert(
  stayHtml.includes('transform-origin: top left'),
  'viewerranking.html missing transform-origin: top left'
);
assert(
  likersHtml.includes('transform-origin: top left'),
  'toplikers.html missing transform-origin: top left'
);

// 3. Verify color theme specific gradients, borders, and accents from specification
const expectedStyles = {
  Purple: {
    accent: '#c084fc',
    bgPart: 'rgba(24, 20, 40',
    borderPart: 'rgba(187, 134, 252, 0.45)'
  },
  Pink: {
    accent: '#ff7eb9',
    bgPart: 'rgba(38, 20, 36',
    borderPart: 'rgba(255, 126, 185, 0.45)'
  },
  Blue: {
    accent: '#48b5ff',
    bgPart: 'rgba(16, 26, 46',
    borderPart: 'rgba(72, 181, 255, 0.45)'
  },
  Green: {
    accent: '#38d39f',
    bgPart: 'rgba(16, 36, 30',
    borderPart: 'rgba(56, 211, 159, 0.45)'
  },
  Dark: {
    accent: '#cbd5e1',
    bgPart: 'rgba(18, 18, 22',
    borderPart: 'rgba(255, 255, 255, 0.22)'
  },
  Light: {
    accent: '#7c3aed',
    bgPart: 'rgba(255, 255, 255',
    borderPart: 'rgba(140, 100, 200, 0.35)'
  }
};

for (const [theme, style] of Object.entries(expectedStyles)) {
  assert(
    stayHtml.includes(style.accent),
    `viewerranking.html missing accent ${style.accent} for theme ${theme}`
  );
  assert(
    stayHtml.includes(style.bgPart),
    `viewerranking.html missing background ${style.bgPart} for theme ${theme}`
  );
  assert(
    stayHtml.includes(style.borderPart),
    `viewerranking.html missing border ${style.borderPart} for theme ${theme}`
  );

  assert(
    likersHtml.includes(style.accent),
    `toplikers.html missing accent ${style.accent} for theme ${theme}`
  );
  assert(
    likersHtml.includes(style.bgPart),
    `toplikers.html missing background ${style.bgPart} for theme ${theme}`
  );
  assert(
    likersHtml.includes(style.borderPart),
    `toplikers.html missing border ${style.borderPart} for theme ${theme}`
  );
}

// 4. Verify JavaScript handlers for theme and scale
assert(
  stayHtml.includes('viewerRankingTheme'),
  'viewerranking.html missing viewerRankingTheme handler'
);
assert(
  stayHtml.includes('viewerRankingScale'),
  'viewerranking.html missing viewerRankingScale handler'
);
assert(
  likersHtml.includes('topLikersTheme'),
  'toplikers.html missing topLikersTheme handler'
);
assert(
  likersHtml.includes('topLikersScale'),
  'toplikers.html missing topLikersScale handler'
);

assert(
  stayHtml.includes('--ranking-scale'),
  'viewerranking.html missing setProperty for --ranking-scale'
);
assert(
  likersHtml.includes('--ranking-scale'),
  'toplikers.html missing setProperty for --ranking-scale'
);

// 5. Functional runtime simulation of WebSocket messages
function runOverlayScript(htmlContent, rootId) {
  const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/);
  assert(scriptMatch, `Could not find script tag in ${rootId}`);
  const script = scriptMatch[1];

  const rootEl = {
    dataset: {},
    style: {
      props: {},
      setProperty(k, v) { this.props[k] = String(v); }
    }
  };
  const listEl = { innerHTML: '' };
  const badgeEl = { textContent: '' };
  const elements = {
    [rootId]: rootEl,
    'viewers-list': listEl,
    'likers-list': listEl,
    'top-count-badge': badgeEl
  };

  let wsHandler = null;
  class MockWebSocket {
    constructor() {}
    set onmessage(fn) { wsHandler = fn; }
    get onmessage() { return wsHandler; }
    set onclose(fn) {}
  }

  const context = {
    document: {
      getElementById(id) {
        return elements[id] || { textContent: '', innerHTML: '', style: { setProperty() {} }, dataset: {} };
      },
      querySelectorAll() { return []; }
    },
    location: { protocol: 'http:', host: 'localhost:3333' },
    WebSocket: MockWebSocket,
    setTimeout: (fn, ms) => {},
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    console: { log() {}, warn() {}, error() {} }
  };

  vm.createContext(context);
  vm.runInContext(script, context);

  return {
    rootEl,
    listEl,
    badgeEl,
    sendWsMessage(msg) {
      if (wsHandler) {
        wsHandler({ data: JSON.stringify(msg) });
      }
    }
  };
}

// Test viewerranking.html WebSocket message processing
const simStay = runOverlayScript(stayHtml, 'viewer-ranking-root');

// (a) init message
simStay.sendWsMessage({
  type: 'init',
  settings: {
    rankings: {
      viewerRankingTheme: 'Blue',
      viewerRankingScale: 1.25,
      viewerRankingCount: 5
    }
  },
  rankings: {
    viewerRankingTheme: 'Blue',
    viewerRankingScale: 1.25,
    viewerRankingLimit: 5,
    viewerRanking: [
      { key: 'user1', nickname: 'Alice', isPresent: true, currentTimeSec: 120, bestTimeSec: 250 }
    ]
  }
});
assert.strictEqual(simStay.rootEl.dataset.theme, 'Blue', 'init must set viewer ranking theme to Blue');
assert.strictEqual(simStay.rootEl.style.props['--ranking-scale'], '1.25', 'init must set --ranking-scale to 1.25');
assert.strictEqual(simStay.badgeEl.textContent, 'TOP 5', 'init must set badge to TOP 5');
assert(simStay.listEl.innerHTML.includes('Alice'), 'init must render Alice row');

// (b) settings:update message
simStay.sendWsMessage({
  type: 'settings:update',
  settings: {
    rankings: {
      viewerRankingTheme: 'Green',
      viewerRankingScale: 0.8
    }
  }
});
assert.strictEqual(simStay.rootEl.dataset.theme, 'Green', 'settings:update must update theme to Green');
assert.strictEqual(simStay.rootEl.style.props['--ranking-scale'], '0.8', 'settings:update must update scale to 0.8');

// (c) rankings:update message
simStay.sendWsMessage({
  type: 'rankings:update',
  rankings: {
    viewerRankingTheme: 'Dark',
    viewerRankingScale: 1.1,
    viewerRankingLimit: 3,
    viewerRanking: [
      { key: 'user2', nickname: 'Bob', isPresent: true, currentTimeSec: 60, bestTimeSec: 60 }
    ]
  }
});
assert.strictEqual(simStay.rootEl.dataset.theme, 'Dark', 'rankings:update must update theme to Dark');
assert.strictEqual(simStay.rootEl.style.props['--ranking-scale'], '1.1', 'rankings:update must update scale to 1.1');
assert(simStay.listEl.innerHTML.includes('Bob'), 'rankings:update must render Bob row');

// Test toplikers.html WebSocket message processing
const simLikers = runOverlayScript(likersHtml, 'toplikers-root');

// (a) init message
simLikers.sendWsMessage({
  type: 'init',
  settings: {
    rankings: {
      topLikersTheme: 'Pink',
      topLikersScale: 1.4,
      topLikersCount: 4
    }
  },
  rankings: {
    topLikersTheme: 'Pink',
    topLikersScale: 1.4,
    topLikersLimit: 4,
    topLikers: [
      { key: 'liker1', nickname: 'Charlie', likes: 500 }
    ]
  }
});
assert.strictEqual(simLikers.rootEl.dataset.theme, 'Pink', 'init must set top likers theme to Pink');
assert.strictEqual(simLikers.rootEl.style.props['--ranking-scale'], '1.4', 'init must set --ranking-scale to 1.4');
assert.strictEqual(simLikers.badgeEl.textContent, 'TOP 4', 'init must set badge to TOP 4');
assert(simLikers.listEl.innerHTML.includes('Charlie'), 'init must render Charlie row');

// (b) settings:update message
simLikers.sendWsMessage({
  type: 'settings:update',
  settings: {
    rankings: {
      topLikersTheme: 'Light',
      topLikersScale: 0.95
    }
  }
});
assert.strictEqual(simLikers.rootEl.dataset.theme, 'Light', 'settings:update must update theme to Light');
assert.strictEqual(simLikers.rootEl.style.props['--ranking-scale'], '0.95', 'settings:update must update scale to 0.95');

// (c) rankings:update message
simLikers.sendWsMessage({
  type: 'rankings:update',
  rankings: {
    topLikersTheme: 'Blue',
    topLikersScale: 1.05,
    topLikersLimit: 3,
    topLikers: [
      { key: 'liker2', nickname: 'Diana', likes: 1200 }
    ]
  }
});
assert.strictEqual(simLikers.rootEl.dataset.theme, 'Blue', 'rankings:update must update theme to Blue');
assert.strictEqual(simLikers.rootEl.style.props['--ranking-scale'], '1.05', 'rankings:update must update scale to 1.05');
assert(simLikers.listEl.innerHTML.includes('Diana'), 'rankings:update must render Diana row');

// 6. Verify zero emojis present anywhere in markup or scripts
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
assert(!emojiRegex.test(stayHtml), 'viewerranking.html must not contain emojis');
assert(!emojiRegex.test(likersHtml), 'toplikers.html must not contain emojis');

console.log('Task 2 overlay themes test passed!');

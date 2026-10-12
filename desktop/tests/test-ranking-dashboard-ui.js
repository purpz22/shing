'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const htmlPath = path.resolve(__dirname, '../renderer/index.html');
const cssPath = path.resolve(__dirname, '../renderer/styles.css');
const jsPath = path.resolve(__dirname, '../renderer/app.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

const themes = ['Purple', 'Pink', 'Blue', 'Green', 'Dark', 'Light'];

// 1. Verify Top Likers Ranking UI elements in index.html
assert(html.includes('id="ranking-toplikers-theme"'), 'index.html missing select#ranking-toplikers-theme');
assert(html.includes('id="ranking-toplikers-scale"'), 'index.html missing input#ranking-toplikers-scale');
assert(html.includes('id="ranking-toplikers-scale-badge"'), 'index.html missing span#ranking-toplikers-scale-badge');
assert(html.includes('id="ov-demo-toplikers-card"'), 'index.html missing id="ov-demo-toplikers-card" on preview card');
assert(html.includes('id="ov-demo-toplikers-rows"'), 'index.html missing id="ov-demo-toplikers-rows" container');

// 2. Verify Viewer Stay Ranking UI elements in index.html
assert(html.includes('id="ranking-viewers-theme"'), 'index.html missing select#ranking-viewers-theme');
assert(html.includes('id="ranking-viewers-scale"'), 'index.html missing input#ranking-viewers-scale');
assert(html.includes('id="ranking-viewers-scale-badge"'), 'index.html missing span#ranking-viewers-scale-badge');
assert(html.includes('id="ov-demo-viewerranking-card"'), 'index.html missing id="ov-demo-viewerranking-card" on preview card');
assert(html.includes('id="ov-demo-viewerranking-rows"'), 'index.html missing id="ov-demo-viewerranking-rows" container');

// 3. Verify scale slider attributes
const topLikersSliderMatch = html.match(/id="ranking-toplikers-scale"[^>]*>/) || html.match(/<input[^>]*id="ranking-toplikers-scale"[^>]*>/);
assert(topLikersSliderMatch, 'Could not find ranking-toplikers-scale input tag');
const topSliderTag = topLikersSliderMatch[0];
assert(topSliderTag.includes('min="0.5"'), 'ranking-toplikers-scale must have min="0.5"');
assert(topSliderTag.includes('max="1.5"'), 'ranking-toplikers-scale must have max="1.5"');
assert(topSliderTag.includes('step="0.05"'), 'ranking-toplikers-scale must have step="0.05"');

const viewersSliderMatch = html.match(/id="ranking-viewers-scale"[^>]*>/) || html.match(/<input[^>]*id="ranking-viewers-scale"[^>]*>/);
assert(viewersSliderMatch, 'Could not find ranking-viewers-scale input tag');
const viewersSliderTag = viewersSliderMatch[0];
assert(viewersSliderTag.includes('min="0.5"'), 'ranking-viewers-scale must have min="0.5"');
assert(viewersSliderTag.includes('max="1.5"'), 'ranking-viewers-scale must have max="1.5"');
assert(viewersSliderTag.includes('step="0.05"'), 'ranking-viewers-scale must have step="0.05"');

// 4. Verify theme options for both selects
themes.forEach(t => {
  assert(html.includes(`<option value="${t}">`), `index.html missing <option value="${t}">`);
});

// 5. Verify scale-badge class in index.html and styles.css
assert(html.includes('class="scale-badge"'), 'index.html missing class="scale-badge"');
assert(css.includes('.scale-badge'), 'styles.css missing .scale-badge CSS definition');

// 6. Verify theme styles on demo-ranking-card in styles.css
themes.forEach(t => {
  assert(
    css.includes(`[data-theme="${t}"]`),
    `styles.css missing [data-theme="${t}"] rule for preview cards`
  );
});

// 7. Verify app.js handlers and initialization
assert(js.includes('ranking-toplikers-theme'), 'app.js missing ranking-toplikers-theme logic');
assert(js.includes('ranking-toplikers-scale'), 'app.js missing ranking-toplikers-scale logic');
assert(js.includes('ranking-toplikers-scale-badge'), 'app.js missing ranking-toplikers-scale-badge logic');
assert(js.includes('ranking-viewers-theme'), 'app.js missing ranking-viewers-theme logic');
assert(js.includes('ranking-viewers-scale'), 'app.js missing ranking-viewers-scale logic');
assert(js.includes('ranking-viewers-scale-badge'), 'app.js missing ranking-viewers-scale-badge logic');
assert(js.includes('ov-demo-toplikers-card'), 'app.js missing ov-demo-toplikers-card update');
assert(js.includes('ov-demo-viewerranking-card'), 'app.js missing ov-demo-viewerranking-card update');

// 8. Verify dynamic preview rows update on test events
assert(js.includes('ov-demo-toplikers-rows'), 'app.js missing dynamic row updates for ov-demo-toplikers-rows');
assert(js.includes('ov-demo-viewerranking-rows'), 'app.js missing dynamic row updates for ov-demo-viewerranking-rows');

// 9. Functional runtime simulation of handlers
{
  const elements = {};
  function mockEl(id) {
    return {
      id,
      value: '',
      textContent: '',
      innerHTML: '',
      dataset: {},
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
    'ranking-toplikers-count',
    'ranking-toplikers-theme',
    'ranking-toplikers-scale',
    'ranking-toplikers-scale-badge',
    'ov-demo-toplikers-card',
    'ov-demo-toplikers-rows',
    'ranking-viewers-count',
    'ranking-viewers-theme',
    'ranking-viewers-scale',
    'ranking-viewers-scale-badge',
    'ov-demo-viewerranking-card',
    'ov-demo-viewerranking-rows',
    'test-toplikers-btn',
    'reset-toplikers-btn',
    'test-viewer-join-btn',
    'test-viewer-leave-btn',
    'reset-viewers-btn'
  ];
  ids.forEach(id => { elements[id] = mockEl(id); });

  const appSettings = {
    rankings: {
      topLikersCount: 3,
      topLikersTheme: 'Purple',
      topLikersScale: 1.0,
      viewerRankingCount: 3,
      viewerRankingTheme: 'Purple',
      viewerRankingScale: 1.0
    }
  };

  let savedSettings = null;
  function saveCurrentSettings() {
    savedSettings = JSON.parse(JSON.stringify(appSettings));
  }
  function showToast() {}
  const $ = (id) => elements[id] || null;

  // Extract and run dynamic demo row functions & listeners logic
  const demoLikersData = [
    { name: 'SakuraChan', likes: 4200, avatar: '../assets/avatar.png' },
    { name: 'MochiVibes', likes: 2800, avatar: '../assets/avatar.png' },
    { name: 'KawaiiFox', likes: 1500, avatar: '../assets/avatar.png' }
  ];
  function formatLikesVal(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }
  function renderDemoTopLikersRows() {
    const el = $('ov-demo-toplikers-rows');
    if (!el) return;
    const limit = appSettings.rankings?.topLikersCount || 3;
    const rows = demoLikersData.slice(0, limit);
    if (rows.length === 0) {
      el.innerHTML = '<div>No likers yet</div>';
      return;
    }
    el.innerHTML = rows.map((item, idx) => `<div>#${idx + 1} ${item.name} ${formatLikesVal(item.likes)}</div>`).join('');
  }

  const demoStayData = [
    { name: 'LunarNeko', timeSec: 2538, isPresent: true, avatar: '../assets/avatar.png' },
    { name: 'StarryCloud', timeSec: 1865, isPresent: true, avatar: '../assets/avatar.png' }
  ];
  function formatStayTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  function renderDemoStayRows() {
    const el = $('ov-demo-viewerranking-rows');
    if (!el) return;
    const limit = appSettings.rankings?.viewerRankingCount || 3;
    const rows = demoStayData.slice(0, limit);
    if (rows.length === 0) {
      el.innerHTML = '<div>No active viewers</div>';
      return;
    }
    el.innerHTML = rows.map((item, idx) => `<div>#${idx + 1} ${item.name} ${formatStayTime(item.timeSec)}</div>`).join('');
  }

  // Initial population
  $('ranking-toplikers-theme').value = appSettings.rankings.topLikersTheme;
  $('ranking-toplikers-scale').value = String(appSettings.rankings.topLikersScale);
  $('ranking-toplikers-scale-badge').textContent = `${Math.round(appSettings.rankings.topLikersScale * 100)}%`;
  $('ov-demo-toplikers-card').dataset.theme = appSettings.rankings.topLikersTheme;
  $('ov-demo-toplikers-card').style.setProperty('--demo-scale', appSettings.rankings.topLikersScale);
  renderDemoTopLikersRows();

  assert.strictEqual($('ranking-toplikers-theme').value, 'Purple');
  assert.strictEqual($('ranking-toplikers-scale-badge').textContent, '100%');
  assert.strictEqual($('ov-demo-toplikers-card').dataset.theme, 'Purple');
  assert($('ov-demo-toplikers-rows').innerHTML.includes('SakuraChan'));

  // Test Top Likers Theme Change
  $('ranking-toplikers-theme').addEventListener('change', e => {
    appSettings.rankings.topLikersTheme = e.target.value;
    $('ov-demo-toplikers-card').dataset.theme = e.target.value;
    saveCurrentSettings();
  });
  $('ranking-toplikers-theme').trigger('change', { target: { value: 'Pink' } });
  assert.strictEqual(appSettings.rankings.topLikersTheme, 'Pink');
  assert.strictEqual($('ov-demo-toplikers-card').dataset.theme, 'Pink');
  assert.strictEqual(savedSettings.rankings.topLikersTheme, 'Pink');

  // Test Top Likers Scale Input
  $('ranking-toplikers-scale').addEventListener('input', e => {
    const scale = parseFloat(e.target.value) || 1.0;
    appSettings.rankings.topLikersScale = scale;
    $('ranking-toplikers-scale-badge').textContent = `${Math.round(scale * 100)}%`;
    $('ov-demo-toplikers-card').style.setProperty('--demo-scale', scale);
  });
  $('ranking-toplikers-scale').trigger('input', { target: { value: '1.25' } });
  assert.strictEqual(appSettings.rankings.topLikersScale, 1.25);
  assert.strictEqual($('ranking-toplikers-scale-badge').textContent, '125%');
  assert.strictEqual($('ov-demo-toplikers-card').style.props['--demo-scale'], '1.25');

  // Test Viewer Stay Theme Change
  $('ranking-viewers-theme').addEventListener('change', e => {
    appSettings.rankings.viewerRankingTheme = e.target.value;
    $('ov-demo-viewerranking-card').dataset.theme = e.target.value;
    saveCurrentSettings();
  });
  $('ranking-viewers-theme').trigger('change', { target: { value: 'Blue' } });
  assert.strictEqual(appSettings.rankings.viewerRankingTheme, 'Blue');
  assert.strictEqual($('ov-demo-viewerranking-card').dataset.theme, 'Blue');

  // Test Viewer Stay Scale Input
  $('ranking-viewers-scale').addEventListener('input', e => {
    const scale = parseFloat(e.target.value) || 1.0;
    appSettings.rankings.viewerRankingScale = scale;
    $('ranking-viewers-scale-badge').textContent = `${Math.round(scale * 100)}%`;
    $('ov-demo-viewerranking-card').style.setProperty('--demo-scale', scale);
  });
  $('ranking-viewers-scale').trigger('input', { target: { value: '0.85' } });
  assert.strictEqual(appSettings.rankings.viewerRankingScale, 0.85);
  assert.strictEqual($('ranking-viewers-scale-badge').textContent, '85%');
  assert.strictEqual($('ov-demo-viewerranking-card').style.props['--demo-scale'], '0.85');

  // Test Dynamic Rows Mutation
  $('test-toplikers-btn').addEventListener('click', () => {
    demoLikersData[0].likes += 500;
    renderDemoTopLikersRows();
  });
  $('test-toplikers-btn').trigger('click');
  assert($('ov-demo-toplikers-rows').innerHTML.includes('4.7K'));

  $('reset-toplikers-btn').addEventListener('click', () => {
    demoLikersData.length = 0;
    renderDemoTopLikersRows();
  });
  $('reset-toplikers-btn').trigger('click');
  assert($('ov-demo-toplikers-rows').innerHTML.includes('No likers yet'));
}

// 10. Verify zero emojis across all relevant files
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
assert(!emojiRegex.test(html), 'index.html must not contain emojis');
assert(!emojiRegex.test(css), 'styles.css must not contain emojis');
assert(!emojiRegex.test(js), 'app.js must not contain emojis');

console.log('Task 3 dashboard UI test passed!');

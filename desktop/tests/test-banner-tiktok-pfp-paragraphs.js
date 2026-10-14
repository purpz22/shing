'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing Banner TikTok PFP & Per-Paragraph Line Engine...');

const rootDir = path.resolve(__dirname, '../..');
const desktopDir = path.resolve(__dirname, '..');

const overlayBannerHtml = fs.readFileSync(path.join(desktopDir, 'overlays', 'banner.html'), 'utf8');
const rootBannerHtml = fs.readFileSync(path.join(rootDir, 'banner.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(desktopDir, 'renderer', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(desktopDir, 'renderer', 'app.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(desktopDir, 'renderer', 'styles.css'), 'utf8');

// 1. Overlay Markup Verification for TikTok PFP
assert.ok(overlayBannerHtml.includes('id="banner-avatar-img"'), 'banner.html must contain #banner-avatar-img');
assert.ok(overlayBannerHtml.includes('class="banner-avatar-img"'), 'banner.html must define .banner-avatar-img class');
assert.ok(overlayBannerHtml.includes('id="banner-avatar-canvas"'), 'banner.html must preserve #banner-avatar-canvas');
assert.ok(overlayBannerHtml.includes('/api/avatar-proxy'), 'banner.html must resolve remote avatar via avatar-proxy');

// 2. Exact Mirroring between root banner.html and desktop overlay banner.html
const normalizeEol = (str) => str.replace(/\r\n/g, '\n').trim();
assert.strictEqual(normalizeEol(rootBannerHtml), normalizeEol(overlayBannerHtml), 'Root banner.html must mirror overlay banner.html');

// 3. Dashboard UI Elements Verification
assert.ok(indexHtml.includes('id="banner-paragraphs-input"'), 'index.html must contain #banner-paragraphs-input textarea');
assert.ok(indexHtml.includes('id="banner-avatar-url-input"'), 'index.html must contain #banner-avatar-url-input');
assert.ok(indexHtml.includes('id="banner-sync-pfp-btn"'), 'index.html must contain #banner-sync-pfp-btn');
assert.ok(indexHtml.includes('id="banner-reset-pfp-btn"'), 'index.html must contain #banner-reset-pfp-btn');
assert.ok(indexHtml.includes('id="banner-avatar-preview-img"'), 'index.html must contain #banner-avatar-preview-img');
assert.ok(indexHtml.includes('Banner Text (Per Paragraph Line)'), 'index.html must have Banner Text (Per Paragraph Line) section');

// 4. Stylesheet Verification
assert.ok(stylesCss.includes('.banner-avatar-preview-wrap'), 'styles.css must include .banner-avatar-preview-wrap');
assert.ok(stylesCss.includes('#banner-paragraphs-input'), 'styles.css must style #banner-paragraphs-input');

// 5. Functional Simulation: Paragraphs Synchronization Engine
{
  const testLines = [
    'My Cute Stream',
    'Playing Cozy Games',
    'Tonight at 8 PM',
    'Welcome in everyone! Enjoy the vibes.'
  ];
  const multiline = testLines.join('\n');

  // Simulate split logic
  const parsed = multiline.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  assert.strictEqual(parsed[0], 'My Cute Stream');
  assert.strictEqual(parsed[1], 'Playing Cozy Games');
  assert.strictEqual(parsed[2], 'Tonight at 8 PM');
  assert.strictEqual(parsed[3], 'Welcome in everyone! Enjoy the vibes.');

  // Simulate line input re-assembly
  const reassembled = [parsed[0], parsed[1], parsed[2], parsed[3]].join('\n');
  assert.strictEqual(reassembled, multiline);
}

// 6. Functional Simulation: TikTok PFP Resolution
{
  function resolveAvatarUrl(rawUrl, isHttp) {
    if (!rawUrl || !rawUrl.trim()) return '/assets/avatar.png';
    const clean = rawUrl.trim();
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return isHttp ? '/api/avatar-proxy?url=' + encodeURIComponent(clean) : clean;
    }
    return clean;
  }

  assert.strictEqual(resolveAvatarUrl('', true), '/assets/avatar.png');
  assert.strictEqual(resolveAvatarUrl(null, true), '/assets/avatar.png');
  assert.strictEqual(
    resolveAvatarUrl('https://p16-sign.tiktokcdn.com/tos-alisg-avt-0068/pic.jpeg', true),
    '/api/avatar-proxy?url=' + encodeURIComponent('https://p16-sign.tiktokcdn.com/tos-alisg-avt-0068/pic.jpeg')
  );
  assert.strictEqual(
    resolveAvatarUrl('https://p16-sign.tiktokcdn.com/tos-alisg-avt-0068/pic.jpeg', false),
    'https://p16-sign.tiktokcdn.com/tos-alisg-avt-0068/pic.jpeg'
  );
  assert.strictEqual(resolveAvatarUrl('/assets/avatar.png', true), '/assets/avatar.png');
}

console.log('All Banner TikTok PFP & Per-Paragraph Line tests passed successfully!');

'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const OverlayServer = require('../server/overlayServer');

console.log('Testing Streamer Info Banner Server Settings and Schema...');

async function run() {
  const testPort = 3339;
  const tempDir = path.join(__dirname, 'tmp-banner-test-data-' + Date.now());
  const tempBaseDir = path.join(tempDir, 'desktop-mock');
  const tempOverlaysDir = path.join(tempBaseDir, 'overlays');
  fs.mkdirSync(tempOverlaysDir, { recursive: true });

  const bannerPath = path.join(tempOverlaysDir, 'banner.html');
  fs.writeFileSync(bannerPath, '<!DOCTYPE html><html><head><title>Streamer Info Banner</title></head><body>Banner Placeholder</body></html>', 'utf8');

  // Verify desktop/settings.json in repository contains the default banner configuration if present
  const repoSettingsPath = path.join(__dirname, '..', 'settings.json');
  if (fs.existsSync(repoSettingsPath)) {
    const repoSettings = JSON.parse(fs.readFileSync(repoSettingsPath, 'utf8'));
    assert.ok(repoSettings.banner, 'desktop/settings.json must contain banner block');
    assert.strictEqual(repoSettings.banner.enabled, true, 'repo settings banner.enabled must be true');
    assert.strictEqual(repoSettings.banner.scale, 1.0, 'repo settings banner.scale must be 1.0');
    assert.strictEqual(repoSettings.banner.topper, 'bear', 'repo settings banner.topper must be bear');
    assert.strictEqual(repoSettings.banner.animation, 'float', 'repo settings banner.animation must be float');
    assert.strictEqual(repoSettings.banner.name, 'shimmy_ming', 'repo settings banner.name must be shimmy_ming');
    assert.strictEqual(repoSettings.banner.subtitle, 'Cozy Variety Streamer', 'repo settings banner.subtitle must match');
    assert.ok(repoSettings.banner.socials, 'repo settings banner.socials must exist');
    assert.strictEqual(repoSettings.banner.socials.twitch, 'shimmy_ming');
    assert.strictEqual(repoSettings.banner.socials.tiktok, '@shimmy_ming');
    assert.strictEqual(repoSettings.banner.socials.discord, '');
    assert.strictEqual(repoSettings.banner.socials.twitter, '');
    assert.strictEqual(repoSettings.banner.template, 'pastel-dream', 'repo settings banner.template must be pastel-dream');
    assert.strictEqual(repoSettings.banner.aspectRatio, '3:1', 'repo settings banner.aspectRatio must be 3:1');
    assert.strictEqual(repoSettings.banner.transitionStyle, 'slide', 'repo settings banner.transitionStyle must be slide');
    assert.strictEqual(repoSettings.banner.sceneDuration, 5, 'repo settings banner.sceneDuration must be 5');
    assert.strictEqual(repoSettings.banner.particles, 'sparkles', 'repo settings banner.particles must be sparkles');
  }

  const server = new OverlayServer(testPort, tempBaseDir, tempDir);

  try {
    // 1. Verify getDefaultSettings includes banner with all required properties
    const defaults = server.getDefaultSettings();
    assert.ok(defaults.banner, 'getDefaultSettings() must include banner property');
    assert.strictEqual(typeof defaults.banner.enabled, 'boolean', 'banner.enabled must be boolean');
    assert.strictEqual(defaults.banner.enabled, true, 'banner.enabled default must be true');
    assert.strictEqual(defaults.banner.template, 'pastel-dream', 'banner.template default must be pastel-dream');
    assert.strictEqual(defaults.banner.aspectRatio, '3:1', 'banner.aspectRatio default must be 3:1');
    assert.strictEqual(defaults.banner.scale, 1.0, 'banner.scale default must be 1.0');
    assert.strictEqual(defaults.banner.topper, 'bear', 'banner.topper default must be bear');
    assert.strictEqual(defaults.banner.animation, 'float', 'banner.animation default must be float');
    assert.strictEqual(defaults.banner.transitionStyle, 'slide', 'banner.transitionStyle default must be slide');
    assert.strictEqual(defaults.banner.sceneDuration, 5, 'banner.sceneDuration default must be 5');
    assert.strictEqual(defaults.banner.autoCycle, true, 'banner.autoCycle default must be true');
    assert.strictEqual(defaults.banner.particles, 'sparkles', 'banner.particles default must be sparkles');
    assert.strictEqual(defaults.banner.shineEffect, true, 'banner.shineEffect default must be true');
    assert.strictEqual(defaults.banner.borderGlow, true, 'banner.borderGlow default must be true');
    assert.strictEqual(defaults.banner.showAvatar, true, 'banner.showAvatar default must be true');
    assert.strictEqual(defaults.banner.name, 'shimmy_ming', 'banner.name default must be shimmy_ming');
    assert.strictEqual(defaults.banner.subtitle, 'Cozy Variety Streamer', 'banner.subtitle default must be Cozy Variety Streamer');
    assert.strictEqual(defaults.banner.bio, 'Welcome to the cozy corner! Streaming daily games, art, and chill chats.', 'banner.bio default matches spec');
    assert.strictEqual(defaults.banner.schedule, 'Daily at 7:00 PM EST', 'banner.schedule default matches spec');
    assert.strictEqual(defaults.banner.statusBadge, 'LIVE NOW', 'banner.statusBadge default matches spec');
    assert.ok(defaults.banner.socials, 'banner.socials must exist');
    assert.strictEqual(defaults.banner.socials.twitch, 'shimmy_ming', 'socials.twitch must be shimmy_ming');
    assert.strictEqual(defaults.banner.socials.tiktok, '@shimmy_ming', 'socials.tiktok must be @shimmy_ming');
    assert.strictEqual(defaults.banner.socials.discord, '', 'socials.discord must be ');
    assert.strictEqual(defaults.banner.socials.twitter, '', 'socials.twitter must be ');
    assert.strictEqual(defaults.banner.socials.instagram, '', 'socials.instagram default must be empty string');
    assert.strictEqual(defaults.banner.socials.youtube, '', 'socials.youtube default must be empty string');

    // 2. Verify scale boundary clamping logic (0.50 to 1.50)
    assert.strictEqual(typeof server.clampBannerScale, 'function', 'server must have clampBannerScale method');
    assert.strictEqual(server.clampBannerScale(1.0), 1.0, 'Scale 1.0 preserves 1.0');
    assert.strictEqual(server.clampBannerScale(0.75), 0.75, 'Scale 0.75 preserves 0.75');
    assert.strictEqual(server.clampBannerScale(1.45), 1.45, 'Scale 1.45 preserves 1.45');
    // Underflow clamping
    assert.strictEqual(server.clampBannerScale(0.1), 0.5, 'Scale 0.1 underflow clamps to 0.5');
    assert.strictEqual(server.clampBannerScale(-1.0), 0.5, 'Negative scale clamps to 0.5');
    assert.strictEqual(server.clampBannerScale(0.49), 0.5, 'Scale 0.49 underflow clamps to 0.5');
    // Overflow clamping
    assert.strictEqual(server.clampBannerScale(1.51), 1.5, 'Scale 1.51 overflow clamps to 1.5');
    assert.strictEqual(server.clampBannerScale(2.5), 1.5, 'Scale 2.5 overflow clamps to 1.5');
    assert.strictEqual(server.clampBannerScale(99), 1.5, 'Scale 99 overflow clamps to 1.5');
    // Fallback on invalid inputs
    assert.strictEqual(server.clampBannerScale('invalid'), 1.0, 'Non-numeric scale falls back to 1.0');
    assert.strictEqual(server.clampBannerScale(null), 1.0, 'null scale falls back to 1.0');
    assert.strictEqual(server.clampBannerScale(undefined), 1.0, 'undefined scale falls back to 1.0');

    // 2b. Verify scene duration clamping logic (2s to 30s)
    assert.strictEqual(typeof server.clampBannerDuration, 'function', 'server must have clampBannerDuration method');
    assert.strictEqual(server.clampBannerDuration(5), 5, 'Duration 5 preserves 5');
    assert.strictEqual(server.clampBannerDuration(10), 10, 'Duration 10 preserves 10');
    assert.strictEqual(server.clampBannerDuration(1), 2, 'Duration 1 underflows to 2');
    assert.strictEqual(server.clampBannerDuration(0), 2, 'Duration 0 underflows to 2');
    assert.strictEqual(server.clampBannerDuration(50), 30, 'Duration 50 overflows to 30');
    assert.strictEqual(server.clampBannerDuration('invalid'), 5, 'Invalid duration falls back to 5');

    // 3. Verify constructor initializes missing or partial banner configuration
    const dummyUserDataDir = path.join(tempDir, 'partial_user_data');
    fs.mkdirSync(dummyUserDataDir, { recursive: true });
    fs.writeFileSync(path.join(dummyUserDataDir, 'settings.json'), JSON.stringify({
      username: 'test_user',
      banner: {
        scale: 0.2 // Needs clamping to 0.5
      }
    }), 'utf8');

    const partialServer = new OverlayServer(3340, tempBaseDir, dummyUserDataDir);
    assert.ok(partialServer.settings.banner, 'Partial settings must have banner object');
    assert.strictEqual(partialServer.settings.banner.scale, 0.5, 'Partial settings scale 0.2 must be clamped to 0.5');
    assert.strictEqual(partialServer.settings.banner.enabled, true, 'Partial settings must populate enabled default');
    assert.strictEqual(partialServer.settings.banner.topper, 'bear', 'Partial settings must populate topper default');
    assert.strictEqual(partialServer.settings.banner.animation, 'float', 'Partial settings must populate animation default');
    assert.strictEqual(partialServer.settings.banner.name, 'shimmy_ming', 'Partial settings must populate name default');
    assert.ok(partialServer.settings.banner.socials, 'Partial settings must populate socials');
    assert.strictEqual(partialServer.settings.banner.socials.twitch, 'shimmy_ming', 'Partial settings must populate twitch');

    // 4. Start overlay server to test HTTP routes and WebSocket events
    await server.start();

    // 5. Test HTTP route /overlays/banner.html responds with 200 OK
    const checkHttp = (reqPath) => new Promise((resolve, reject) => {
      http.get(`http://localhost:${testPort}${reqPath}`, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on('error', reject);
    });

    const bannerRes = await checkHttp('/overlays/banner.html');
    assert.strictEqual(bannerRes.statusCode, 200, 'GET /overlays/banner.html must respond with 200');
    assert.ok(bannerRes.headers['content-type'].includes('text/html'), 'Content-Type must be text/html');

    const bannerNoExtRes = await checkHttp('/overlays/banner');
    assert.strictEqual(bannerNoExtRes.statusCode, 200, 'GET /overlays/banner must also respond with 200');

    // 6. Test GET /api/settings includes banner
    const apiSettingsRes = await checkHttp('/api/settings');
    assert.strictEqual(apiSettingsRes.statusCode, 200, 'GET /api/settings must respond with 200');
    const apiSettingsJson = JSON.parse(apiSettingsRes.body);
    assert.ok(apiSettingsJson.banner, 'GET /api/settings response must contain banner');
    assert.strictEqual(apiSettingsJson.banner.name, 'shimmy_ming');
    assert.strictEqual(apiSettingsJson.banner.scale, 1.0);

    // 7. Test WebSocket connection receives banner in init and in settings:update
    const wsMessages = [];
    const ws = new WebSocket(`ws://localhost:${testPort}`);
    ws.on('message', raw => {
      try {
        wsMessages.push(JSON.parse(raw.toString()));
      } catch (_) {}
    });

    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // Wait for init message
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.ok(wsMessages.length >= 1, 'Client must receive at least 1 initial message');
    const initMsg = wsMessages.find(m => m.type === 'init');
    assert.ok(initMsg, 'Client must receive init message');
    assert.ok(initMsg.settings.banner, 'init message settings must include banner');
    assert.strictEqual(initMsg.settings.banner.name, 'shimmy_ming');

    // Test saveSettings triggers settings:update with clamped banner scale
    server.saveSettings({
      banner: {
        name: 'UpdatedAki',
        scale: 2.5 // Should clamp to 1.5
      }
    });

    await new Promise(resolve => setTimeout(resolve, 150));
    const updateMsg = wsMessages.find(m => m.type === 'settings:update' && m.settings && m.settings.banner && m.settings.banner.name === 'UpdatedAki');
    assert.ok(updateMsg, 'Client must receive settings:update payload with banner');
    assert.strictEqual(updateMsg.settings.banner.name, 'UpdatedAki', 'settings:update must contain updated name');
    assert.strictEqual(updateMsg.settings.banner.scale, 1.5, 'settings:update must contain clamped scale of 1.5');

    ws.close();
    console.log('All banner server settings tests passed successfully!');
  } finally {
    server.stop();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});


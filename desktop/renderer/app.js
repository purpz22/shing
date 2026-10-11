'use strict';

// Shing Studio Renderer Script
let appSettings = {};

const $ = id => document.getElementById(id);

// Browser Fallback when accessed directly at http://localhost:3333 via web browser
if (typeof window.api === 'undefined') {
  let wsClient = null;
  const statusListeners = [];
  const eventListeners = [];

  function initWebWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsClient = new WebSocket(`${proto}//${location.host}`);
    wsClient.onmessage = evt => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === 'tiktok:status') {
          statusListeners.forEach(cb => cb(data));
        } else {
          eventListeners.forEach(cb => cb(data));
        }
      } catch (e) {}
    };
    wsClient.onclose = () => setTimeout(initWebWS, 2000);
  }
  initWebWS();

  window.api = {
    getSettings: async () => {
      try {
        const res = await fetch('/api/settings');
        return await res.json();
      } catch (e) {
        return {};
      }
    },
    saveSettings: async (settings) => {
      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        });
        return await res.json();
      } catch (e) {
        return settings;
      }
    },
    searchTikTokUser: async (username) => {
      const cleanUser = (username || 'shimmy_ming').replace(/^@/, '').trim();
      return {
        success: true,
        uniqueId: cleanUser,
        nickname: cleanUser === 'shimmy_ming' ? 'Shimmy Ming' : cleanUser,
        avatar: '/assets/avatar.png',
        bio: 'TikTok Live Streamer',
        isDefault: cleanUser.toLowerCase() === 'shimmy_ming'
      };
    },
    connectTikTok: async (username) => {
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({ type: 'tiktok:connect', username }));
      }
      return { success: true, status: 'connecting', username };
    },
    disconnectTikTok: async () => {
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({ type: 'tiktok:disconnect' }));
      }
      return { success: true };
    },
    simulateEvent: async (type, payload) => {
      const event = Object.assign({ type }, payload);
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({ type: 'test:event', event }));
      } else {
        fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event)
        }).catch(() => {});
      }
      return { success: true };
    },
    controlTimer: async (action, seconds) => {
      const event = { type: 'timer:control', action, seconds };
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({ type: 'test:event', event }));
      }
      return { success: true };
    },
    clearJar: async () => {
      const event = { type: 'clearJar' };
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({ type: 'test:event', event }));
      }
      return { success: true };
    },
    openOverlayInBrowser: async (name) => {
      window.open(`/overlays/${name}`, '_blank');
      return { success: true };
    },
    onTikTokStatus: (cb) => {
      statusListeners.push(cb);
      return () => {
        const i = statusListeners.indexOf(cb);
        if (i >= 0) statusListeners.splice(i, 1);
      };
    },
    onTikTokEvent: (cb) => {
      eventListeners.push(cb);
      return () => {
        const i = eventListeners.indexOf(cb);
        if (i >= 0) eventListeners.splice(i, 1);
      };
    }
  };
}

// Initialize SVG icons
function renderIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    const iconName = el.getAttribute('data-icon');
    if (ICONS && ICONS[iconName]) {
      el.innerHTML = ICONS[iconName];
    }
  });

  document.querySelectorAll('.star-toggle').forEach(el => {
    const tabName = el.getAttribute('data-fav');
    const isFav = appSettings.favorites?.includes(tabName);
    el.innerHTML = isFav ? ICONS.starFilled : ICONS.star;
    el.classList.toggle('starred', Boolean(isFav));
  });
}

// Tab Switching
function switchTab(tabId) {
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tabId}`);
  });
  if (tabId === 'companion') {
    const ifr = $('comp-preview-iframe');
    if (ifr && ifr.contentWindow) {
      setTimeout(() => {
        try { ifr.contentWindow.dispatchEvent(new Event('resize')); } catch (e) {}
      }, 60);
    }
  }
}

// Render Favorites list
function renderFavorites() {
  const container = $('favorites-list');
  container.innerHTML = '';
  const favs = appSettings.favorites || ['jar', 'companion', 'overlays'];

  favs.forEach(tabId => {
    const mainBtn = document.querySelector(`.nav-list .nav-item[data-tab="${tabId}"]`);
    if (!mainBtn) return;
    const label = mainBtn.querySelector('.nav-label').textContent;
    const iconName = mainBtn.querySelector('.nav-icon').getAttribute('data-icon');

    const btn = document.createElement('button');
    btn.className = `nav-item ${document.querySelector(`.tab-pane#tab-${tabId}`)?.classList.contains('active') ? 'active' : ''}`;
    btn.dataset.tab = tabId;
    btn.innerHTML = `
      <span class="nav-icon">${ICONS[iconName] || ''}</span>
      <span class="nav-label">${label}</span>
    `;
    btn.addEventListener('click', () => switchTab(tabId));
    container.appendChild(btn);
  });
}

// Toggle Favorite
function toggleFavorite(tabId) {
  if (!appSettings.favorites) appSettings.favorites = [];
  const idx = appSettings.favorites.indexOf(tabId);
  if (idx >= 0) {
    appSettings.favorites.splice(idx, 1);
  } else {
    appSettings.favorites.push(tabId);
  }
  saveCurrentSettings();
  renderIcons();
  renderFavorites();
}

// Theme management
function applyTheme(themeName) {
  document.body.className = '';
  const cleanName = (themeName || 'Purple').toLowerCase().replace(/\s+/g, '-');
  document.body.classList.add(`theme-${cleanName}`);
}

// Session Telemetry Stats
const sessionStats = {
  chat: 0,
  coins: 0,
  likes: 0
};

function updateHUD() {
  const cEl = $('hud-chat-count');
  const dEl = $('hud-coin-count');
  const lEl = $('hud-like-count');
  if (cEl) cEl.textContent = sessionStats.chat.toLocaleString();
  if (dEl) dEl.textContent = sessionStats.coins.toLocaleString();
  if (lEl) lEl.textContent = sessionStats.likes.toLocaleString();
}

if (typeof window.api !== 'undefined' && window.api.onTikTokEvent) {
  window.api.onTikTokEvent(data => {
    if (data.type === 'chat') {
      sessionStats.chat++;
      updateHUD();
    } else if (data.type === 'gift') {
      sessionStats.coins += (data.coins || data.diamonds || 1) * (data.count || 1);
      updateHUD();
    } else if (data.type === 'like') {
      sessionStats.likes += (data.count || 1);
      updateHUD();
    }
  });
}

// Load & populate settings
async function initSettings() {
  appSettings = await window.api.getSettings();
  applyTheme(appSettings.theme);

  // Initial Modal status
  if (!appSettings.confirmed) {
    showAccountModal();
  } else {
    $('modal-account').classList.remove('active');
    $('header-username').textContent = `@${appSettings.username}`;
    window.api.connectTikTok(appSettings.username);
  }

  // Populate Triggers
  if (appSettings.triggers) {
    $('trig-follow-msg').value = appSettings.triggers.followMessage || 'Thank you {user} for following!';
    $('trig-gift-msg').value = appSettings.triggers.giftMessage || '{user} sent {gift} x{count}!';
    $('trig-duration').value = appSettings.triggers.alertDuration || 5;
    $('trig-likes-thresh').value = appSettings.triggers.likeThreshold || 50;
  }

  // Populate Lower Third
  if (appSettings.lowerThird) {
    $('lt-tiktok').value = appSettings.lowerThird.tiktok || '@shimmy_ming';
    $('lt-instagram').value = appSettings.lowerThird.instagram || '';
    $('lt-youtube').value = appSettings.lowerThird.youtube || '';
    $('lt-discord').value = appSettings.lowerThird.discord || '';
    $('lt-interval').value = appSettings.lowerThird.interval || 15;
    $('lt-preview-handle').textContent = appSettings.lowerThird.tiktok || '@shimmy_ming';
  }

  // Populate Chat
  if (appSettings.chat) {
    $('chat-font-size').value = appSettings.chat.fontSize || 14;
    $('chat-font-val').textContent = `${$('chat-font-size').value}px`;
    $('chat-radius').value = appSettings.chat.bubbleRadius || 16;
    $('chat-radius-val').textContent = `${$('chat-radius').value}px`;
    $('chat-autofade').value = appSettings.chat.autoFadeSec || 15;
    if ($('chat-max-messages')) $('chat-max-messages').value = appSettings.chat.maxMessages || 8;
    $('chat-badges').checked = Boolean(appSettings.chat.showBadges);
    if ($('chat-avatar-shape')) $('chat-avatar-shape').value = appSettings.chat.avatarShape || 'circle';
    if ($('chat-avatar-anim')) $('chat-avatar-anim').value = appSettings.chat.avatarAnim || 'elastic';
    if ($('chat-grouping')) $('chat-grouping').checked = appSettings.chat.messageGrouping !== false;
    updateChatPreviewBox();
  }

  // Populate Jar
  if (appSettings.jar) {
    $('jar-gravity').value = appSettings.jar.gravity || 0.95;
    $('jar-gravity-val').textContent = Number($('jar-gravity').value).toFixed(2);
    $('jar-scale').value = appSettings.jar.giftScale || 0.85;
    $('jar-scale-val').textContent = Number($('jar-scale').value).toFixed(2);
    $('jar-bounciness').value = appSettings.jar.bounciness || 0.4;
    $('jar-bounce-val').textContent = Number($('jar-bounciness').value).toFixed(2);
    $('jar-max').value = appSettings.jar.maxGifts || 150;
  }

  // Populate Companion
  if (appSettings.companion) {
    $('comp-hairstyle').value = appSettings.companion.hair || 'twintails';
    $('comp-hair-color').value = appSettings.companion.hc || '#7b3fe4';
    $('comp-outfit-color').value = appSettings.companion.oc || '#9b5cf0';
    syncPresetSelect('comp-hair-preset', $('comp-hair-color').value);
    syncPresetSelect('comp-outfit-preset', $('comp-outfit-color').value);

    const cats = appSettings.companion.cats || ['purple', 'black'];
    document.querySelectorAll('#comp-cats input[type="checkbox"]').forEach(cb => {
      cb.checked = cats.includes(cb.value);
    });
  }

  // Populate Settings
  if (appSettings.theme) {
    $('setting-theme').value = appSettings.theme;
  }
  $('setting-username').value = `@${appSettings.username || 'shimmy_ming'}`;

  // Populate Updates settings
  if (appSettings.updates) {
    if ($('chk-auto-update')) $('chk-auto-update').checked = appSettings.updates.autoCheck !== false;
    if ($('input-update-feed')) $('input-update-feed').value = appSettings.updates.feedUrl || '';
  }

  renderIcons();
  renderFavorites();
  initUpdater();
}

function syncPresetSelect(selectId, hex) {
  const sel = $(selectId);
  const match = Array.from(sel.options).some(o => o.value.toLowerCase() === hex.toLowerCase());
  sel.value = match ? hex.toLowerCase() : 'custom';
}

function saveCurrentSettings() {
  window.api.saveSettings(appSettings);
}

// Account Modal Workflow
function showAccountModal() {
  $('modal-account').classList.add('active');
  $('modal-step-search').style.display = 'block';
  $('modal-step-confirm').style.display = 'none';
  $('modal-username-input').value = appSettings.username || 'shimmy_ming';
}

async function handleSearchUser() {
  const username = $('modal-username-input').value.trim() || 'shimmy_ming';
  const profile = await window.api.searchTikTokUser(username);

  $('modal-display-name').textContent = profile.nickname || username;
  $('modal-unique-id').textContent = `@${profile.uniqueId || username}`;
  $('modal-avatar-img').src = profile.avatar || '/assets/avatar.png';

  $('modal-step-search').style.display = 'none';
  $('modal-step-confirm').style.display = 'block';
}

// App Updater Manager Logic
const updateState = {
  currentVersion: '1.0.0',
  latestVersion: null,
  hasUpdate: false,
  release: null,
  allReleases: [],
  isChecking: false,
  isDownloading: false
};

async function initUpdater() {
  try {
    const ver = await window.api.getVersion();
    if (ver && ver.version) {
      updateState.currentVersion = ver.version;
      if ($('header-version-text')) $('header-version-text').textContent = `v${ver.version}`;
      if ($('stat-installed-ver')) $('stat-installed-ver').textContent = `v${ver.version}`;
    }
  } catch (e) {
    console.warn('Failed to retrieve app version', e);
  }

  // Auto-check on startup if enabled
  const autoCheck = appSettings.updates?.autoCheck !== false;
  if (autoCheck) {
    setTimeout(() => {
      checkAppUpdates(false);
    }, 1200);
  }
}

async function checkAppUpdates(manual = true) {
  if (updateState.isChecking) return;
  updateState.isChecking = true;

  const dot = $('status-indicator-dot');
  const txt = $('update-status-text');
  const btnTxt = $('btn-check-updates-text');
  const feedUrl = $('input-update-feed')?.value?.trim() || appSettings.updates?.feedUrl || null;

  if (dot) dot.className = 'status-indicator-dot checking';
  if (txt) txt.textContent = 'Checking...';
  if (btnTxt) btnTxt.textContent = 'Checking...';

  try {
    const result = await window.api.checkForUpdates(feedUrl);
    updateState.hasUpdate = result.hasUpdate;
    updateState.currentVersion = result.currentVersion;
    updateState.latestVersion = result.latestVersion;
    updateState.release = result.release;
    updateState.allReleases = result.allReleases || [];

    // Format last checked time
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if ($('stat-last-checked')) $('stat-last-checked').textContent = `Today, ${timeStr}`;

    if (result.hasUpdate) {
      if (dot) dot.className = 'status-indicator-dot has-update';
      if (txt) txt.textContent = 'Update Available';
      if ($('header-version-badge')) {
        $('header-version-badge').textContent = `Update v${result.latestVersion}!`;
        $('header-version-badge').className = 'ver-badge-tag has-update';
      }
      if ($('stat-latest-ver')) $('stat-latest-ver').textContent = `v${result.latestVersion}`;

      // Show banner
      const banner = $('update-banner');
      if (banner) {
        banner.classList.remove('hidden');
        if ($('update-banner-title')) $('update-banner-title').textContent = result.release?.releaseName || `New Update v${result.latestVersion} Available!`;
        if ($('update-badge-ver')) $('update-badge-ver').textContent = `v${result.latestVersion}`;
        if ($('update-banner-desc')) $('update-banner-desc').textContent = result.release?.summary || 'A new version of Shing Studio is ready with improvements!';
      }
    } else {
      if (dot) dot.className = 'status-indicator-dot';
      if (txt) txt.textContent = 'Up to Date';
      if ($('header-version-badge')) {
        $('header-version-badge').textContent = 'Up to Date';
        $('header-version-badge').className = 'ver-badge-tag';
      }
      if ($('stat-latest-ver')) $('stat-latest-ver').textContent = `v${result.currentVersion} (Latest)`;
      if ($('update-banner')) $('update-banner').classList.add('hidden');

      if (manual) {
        alert(`Shing Studio is up to date (v${result.currentVersion})!`);
      }
    }
  } catch (err) {
    console.error('Update check error', err);
    if (dot) dot.className = 'status-indicator-dot';
    if (txt) txt.textContent = 'Check Failed';
    if (manual) alert(`Could not check for updates: ${err.message}`);
  } finally {
    updateState.isChecking = false;
    if (btnTxt) btnTxt.textContent = 'Check for Updates';
  }
}

async function downloadAndInstallUpdate() {
  if (updateState.isDownloading) return;
  updateState.isDownloading = true;

  const progContainer = $('update-progress-container');
  const progFill = $('progress-bar-fill');
  const progPercent = $('progress-percent-val');
  const progMsg = $('progress-status-msg');
  const installBtn = $('btn-install-update');

  if (progContainer) progContainer.classList.remove('hidden');
  if (installBtn) installBtn.disabled = true;

  const unsubscribe = window.api.onUpdateProgress(p => {
    if (progPercent) progPercent.textContent = `${p.percent}%`;
    if (progFill) progFill.style.width = `${p.percent}%`;
    if (progMsg) progMsg.textContent = p.msg;
  });

  try {
    await window.api.downloadUpdate(updateState);
    await window.api.installUpdate(updateState);

    // Show restart modal
    if ($('restart-dialog-msg')) {
      $('restart-dialog-msg').textContent = `Shing Studio has been updated to v${updateState.latestVersion || '1.1.0'}. Please restart the app now to activate all new features.`;
    }
    $('modal-restart').classList.add('active');
  } catch (e) {
    alert(`Installation failed: ${e.message}`);
  } finally {
    unsubscribe();
    updateState.isDownloading = false;
    if (installBtn) installBtn.disabled = false;
    if (progContainer) progContainer.classList.add('hidden');
  }
}

async function handleSelectLocalZip() {
  try {
    const res = await window.api.selectLocalUpdateFile();
    if (res.canceled) return;
    if (res.success) {
      if ($('restart-dialog-msg')) {
        $('restart-dialog-msg').textContent = res.message || 'Update package applied successfully. Restart now to complete the update.';
      }
      $('modal-restart').classList.add('active');
    }
  } catch (e) {
    alert(`Failed to apply local update package: ${e.message}`);
  }
}

function openChangelogModal() {
  const container = $('changelog-list-container');
  if (!container) return;
  container.innerHTML = '';

  const list = updateState.allReleases.length > 0 ? updateState.allReleases : [
    {
      version: '1.1.0',
      releaseName: 'Shing Studio v1.1.0 - Viewer Display Names & Coins HUD',
      releaseDate: '2026-10-11',
      summary: 'Full viewer display name support, accurate TikTok coin currency HUD, and in-app update manager.',
      highlights: [
        'Viewer Display Names: Overlays now display viewers customized nicknames instead of username handles',
        'TikTok Coins Currency: Standardized all alert badges and jar physics from Diamonds to Coins',
        'Chat Message Cap: Added configurable maximum visible messages limit (default: 8 messages)',
        '6 Chibi Hair Styles: Twintails, Long, Bob, High Ponytail, Space Buns, Half-Up with custom color palettes',
        'In-App Updater: Built-in update checker, one-click installer, and release notes history'
      ]
    },
    {
      version: '1.0.0',
      releaseName: 'Shing Studio v1.0.0 - Initial Release',
      releaseDate: '2026-10-10',
      summary: 'Initial release of Shing Studio for TikTok Live streamers.',
      highlights: [
        'Account verification modal with avatar and bio preview',
        'Matter.js 2D physics glass jar overlay for TikTok gifts',
        'Cute speech bubble chat overlay with animated avatar shapes',
        'Pixel art chibi and cat companion interactive stage reactions',
        'Multi-tier triggers and alert overlays for follows, gifts, and likes'
      ]
    }
  ];

  list.forEach(rel => {
    const item = document.createElement('div');
    item.className = 'changelog-release-item';
    const bullets = (rel.highlights || []).map(h => `<li>${h}</li>`).join('');
    item.innerHTML = `
      <div class="changelog-release-hdr">
        <span class="changelog-ver-title">${rel.releaseName || 'Version ' + rel.version}</span>
        <span class="changelog-ver-date">${rel.releaseDate || ''}</span>
      </div>
      <div class="changelog-summary">${rel.summary || ''}</div>
      <ul class="changelog-ul">${bullets}</ul>
    `;
    container.appendChild(item);
  });

  $('modal-changelog').classList.add('active');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  initSettings();

  // Navigation clicks
  document.querySelectorAll('.nav-list .nav-item').forEach(btn => {
    btn.addEventListener('click', e => {
      if (e.target.classList.contains('star-toggle')) return;
      switchTab(btn.dataset.tab);
    });
  });

  // Star / Favorite toggles
  document.querySelectorAll('.star-toggle').forEach(star => {
    star.addEventListener('click', e => {
      e.stopPropagation();
      toggleFavorite(star.dataset.fav);
    });
  });

  // Overlay shortcut clicks (clicking card directs to setup)
  document.querySelectorAll('.overlay-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const targetTab = card.dataset.goto;
      if (targetTab) switchTab(targetTab);
    });
  });

  // Copy Overlay URL buttons
  document.querySelectorAll('.copy-url-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const url = btn.dataset.url;
      try {
        await navigator.clipboard.writeText(url);
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('btn-primary');
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      } catch (err) {
        console.warn('Clipboard write failed', err);
      }
    });
  });

  // Open external preview
  document.querySelectorAll('.open-ext-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      window.api.openOverlayInBrowser(btn.dataset.overlay);
    });
  });

  // Account modal buttons
  $('modal-search-btn').addEventListener('click', handleSearchUser);
  $('modal-username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSearchUser();
  });
  $('modal-confirm-yes').addEventListener('click', () => {
    const username = $('modal-unique-id').textContent.replace('@', '');
    appSettings.username = username;
    appSettings.confirmed = true;
    $('header-username').textContent = `@${username}`;
    $('setting-username').value = `@${username}`;
    $('lt-tiktok').value = `@${username}`;
    $('modal-account').classList.remove('active');
    saveCurrentSettings();
    window.api.connectTikTok(username);
  });
  $('modal-confirm-no').addEventListener('click', () => {
    $('modal-step-confirm').style.display = 'none';
    $('modal-step-search').style.display = 'block';
  });
  $('account-pill').addEventListener('click', showAccountModal);
  $('switch-account-btn').addEventListener('click', showAccountModal);

  // Live Simulator Buttons
  document.querySelectorAll('.sim-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.sim;
      if (type === 'rose') {
        window.api.simulateEvent('gift', { user: 'Cute Fan', nickname: 'Cute Fan', uniqueId: 'cutefan123', giftId: 'rose', giftName: 'Rose', count: 1, coins: 1, giftPictureUrl: '/assets/gifts/rose.png' });
      } else if (type === 'heart_me') {
        window.api.simulateEvent('gift', { user: 'Sparkle Gamer', nickname: 'Sparkle Gamer', uniqueId: 'sparklegamer', giftId: 'heart_me', giftName: 'Heart Me', count: 1, coins: 1, giftPictureUrl: '/assets/gifts/heart_me.png' });
      } else if (type === 'money_gun') {
        window.api.simulateEvent('gift', { user: 'Rich Supporter', nickname: 'Rich Supporter', uniqueId: 'richsupporter', giftId: 'money_gun', giftName: 'Money Gun', count: 1, coins: 500, giftPictureUrl: '/assets/gifts/money_gun.png' });
      } else if (type === 'galaxy') {
        window.api.simulateEvent('gift', { user: 'Starlight Gamer', nickname: 'Starlight Gamer', uniqueId: 'starlightgamer', giftId: 'galaxy', giftName: 'Galaxy', count: 1, coins: 1000, giftPictureUrl: '/assets/gifts/galaxy.png' });
      } else if (type === 'lion') {
        window.api.simulateEvent('gift', { user: 'Mega King', nickname: 'Mega King', uniqueId: 'megaking', giftId: 'lion', giftName: 'Lion', count: 1, coins: 29999, giftPictureUrl: '/assets/gifts/lion.png' });
      } else if (type === 'follow') {
        window.api.simulateEvent('follow', { user: 'New Friend', nickname: 'New Friend', uniqueId: 'newfriend' });
      } else if (type === 'like') {
        window.api.simulateEvent('like', { user: 'Chat Lover', nickname: 'Chat Lover', uniqueId: 'chatlover', count: 25 });
      } else if (type === 'chat') {
        window.api.simulateEvent('chat', { user: 'Cozy Viewer', nickname: 'Cozy Viewer', uniqueId: 'cozyviewer', comment: 'Your overlay is so cute!', role: 'viewer' });
      } else if (type === 'join') {
        window.api.simulateEvent('join', { user: 'Anime Fan', nickname: 'Anime Fan', uniqueId: 'animefan' });
      }
    });
  });

  // Triggers Save & Multi-Tier Tests
  $('save-triggers-btn').addEventListener('click', () => {
    appSettings.triggers = {
      followMessage: $('trig-follow-msg').value,
      giftMessage: $('trig-gift-msg').value,
      alertDuration: +$('trig-duration').value || 5,
      likeThreshold: +$('trig-likes-thresh').value || 50
    };
    saveCurrentSettings();
    alert('Triggers settings saved!');
  });
  $('test-follow-btn')?.addEventListener('click', () => {
    window.api.simulateEvent('follow', { user: 'Test Follower', nickname: 'Test Follower', uniqueId: 'testfollower' });
  });
  $('test-tier2-btn')?.addEventListener('click', () => {
    window.api.simulateEvent('gift', { user: 'Rose Lover', nickname: 'Rose Lover', uniqueId: 'roselover', giftId: 'rose', giftName: 'Rose', count: 1, coins: 1, giftPictureUrl: '/assets/gifts/rose.png' });
  });
  $('test-tier3-btn')?.addEventListener('click', () => {
    window.api.simulateEvent('gift', { user: 'Diamond VIP', nickname: 'Diamond VIP', uniqueId: 'diamondvip', giftId: 'money_gun', giftName: 'Money Gun', count: 1, coins: 500, giftPictureUrl: '/assets/gifts/money_gun.png' });
  });
  $('test-tier4-btn')?.addEventListener('click', () => {
    window.api.simulateEvent('gift', { user: 'Golden Legend', nickname: 'Golden Legend', uniqueId: 'goldenlegend', giftId: 'lion', giftName: 'Lion', count: 1, coins: 29999, giftPictureUrl: '/assets/gifts/lion.png' });
  });

  // Lower Third Save & Preview
  $('lt-tiktok').addEventListener('input', () => {
    $('lt-preview-handle').textContent = $('lt-tiktok').value || '@shimmy_ming';
  });
  $('save-lowerthird-btn').addEventListener('click', () => {
    appSettings.lowerThird = {
      tiktok: $('lt-tiktok').value,
      instagram: $('lt-instagram').value,
      youtube: $('lt-youtube').value,
      discord: $('lt-discord').value,
      interval: +$('lt-interval').value || 15
    };
    saveCurrentSettings();
    alert('Lower 3rd settings saved!');
  });

  // Chat Settings & Live Preview
  function updateChatPreviewBox() {
    const wrap = document.querySelector('.preview-pfp-wrap');
    if (wrap && $('chat-avatar-shape')) {
      const shape = $('chat-avatar-shape').value;
      wrap.className = `preview-pfp-wrap shape-${shape}`;
    }
  }

  $('chat-avatar-shape')?.addEventListener('change', updateChatPreviewBox);

  $('chat-font-size').addEventListener('input', () => {
    $('chat-font-val').textContent = `${$('chat-font-size').value}px`;
  });
  $('chat-radius').addEventListener('input', () => {
    $('chat-radius-val').textContent = `${$('chat-radius').value}px`;
  });
  $('save-chat-btn').addEventListener('click', () => {
    appSettings.chat = {
      fontSize: +$('chat-font-size').value,
      bubbleRadius: +$('chat-radius').value,
      autoFadeSec: +$('chat-autofade').value,
      maxMessages: +$('chat-max-messages').value || 8,
      showBadges: $('chat-badges').checked,
      avatarShape: $('chat-avatar-shape').value,
      avatarAnim: $('chat-avatar-anim').value,
      messageGrouping: $('chat-grouping').checked
    };
    saveCurrentSettings();
    alert('Chat settings saved!');
  });

  $('send-test-chat-btn').addEventListener('click', () => {
    const user = $('test-chat-user').value || 'Viewer';
    const role = $('test-chat-role').value || 'viewer';
    const comment = $('test-chat-comment').value || 'Hello!';
    window.api.simulateEvent('chat', { user, nickname: user, role, comment });

    const previewContainer = $('dashboard-chat-preview');
    if (previewContainer) {
      const roleBadgeText = role === 'streamer' ? 'Streamer' : (role === 'moderator' ? 'Mod' : (role === 'top_gifter' ? 'Top Gifter' : (role === 'subscriber' ? 'Sub' : '')));
      const badgeHtml = roleBadgeText ? `<span class="badge badge-${role === 'top_gifter' ? 'gifter' : role}">${roleBadgeText}</span>` : '';
      const shape = $('chat-avatar-shape') ? $('chat-avatar-shape').value : 'circle';
      previewContainer.innerHTML = `
        <div class="preview-chat-msg role-${role}">
          <div class="preview-pfp-wrap shape-${shape}">
            <img src="/assets/avatar.png" class="preview-pfp-img" alt="PFP">
          </div>
          <div class="preview-chat-body">
            <div class="preview-chat-hdr">
              <span class="preview-uname">${user}</span>
              ${badgeHtml}
            </div>
            <div class="preview-comment">${comment}</div>
          </div>
        </div>
      `;
    }
  });

  // Jar Settings & Physics
  $('jar-gravity').addEventListener('input', () => {
    $('jar-gravity-val').textContent = Number($('jar-gravity').value).toFixed(2);
  });
  $('jar-scale').addEventListener('input', () => {
    $('jar-scale-val').textContent = Number($('jar-scale').value).toFixed(2);
  });
  $('jar-bounciness').addEventListener('input', () => {
    $('jar-bounce-val').textContent = Number($('jar-bounciness').value).toFixed(2);
  });
  $('save-jar-btn').addEventListener('click', () => {
    appSettings.jar = {
      gravity: +$('jar-gravity').value,
      giftScale: +$('jar-scale').value,
      bounciness: +$('jar-bounciness').value,
      maxGifts: +$('jar-max').value,
      overflowAllowed: true
    };
    saveCurrentSettings();
    alert('Jar physics settings saved!');
  });
  $('clear-jar-btn').addEventListener('click', () => {
    window.api.clearJar();
  });
  $('drop-rose-btn').addEventListener('click', () => {
    window.api.simulateEvent('gift', { user: 'Tester', giftId: 'rose', giftName: 'Rose', count: 1 });
  });
  $('drop-heartme-btn').addEventListener('click', () => {
    window.api.simulateEvent('gift', { user: 'Tester', giftId: 'heart_me', giftName: 'Heart Me', count: 1 });
  });
  $('drop-gg-btn').addEventListener('click', () => {
    window.api.simulateEvent('gift', { user: 'Tester', giftId: 'gg', giftName: 'GG', count: 1 });
  });
  $('drop-galaxy-btn').addEventListener('click', () => {
    window.api.simulateEvent('gift', { user: 'Tester', giftId: 'galaxy', giftName: 'Galaxy', count: 1, coins: 1000, giftPictureUrl: '/assets/gifts/galaxy.png' });
  });
  $('drop-selected-gift-btn')?.addEventListener('click', () => {
    const sel = $('select-any-gift');
    const opt = sel.options[sel.selectedIndex];
    const giftId = sel.value;
    const giftName = opt.getAttribute('data-name') || giftId;
    const coins = +(opt.getAttribute('data-coins') || opt.getAttribute('data-diamonds') || 1);
    window.api.simulateEvent('gift', {
      user: 'Supporter',
      giftId,
      giftName,
      coins,
      count: 1
    });
  });

  // Timer Controls
  $('save-timer-btn').addEventListener('click', () => {
    appSettings.timer = {
      durationMin: +$('timer-duration').value || 30,
      addSecondsPerGift: +$('timer-bonus').value || 15
    };
    saveCurrentSettings();
    alert('Timer settings saved!');
  });
  $('timer-start-btn').addEventListener('click', () => {
    window.api.controlTimer('start');
  });
  $('timer-pause-btn').addEventListener('click', () => {
    window.api.controlTimer('pause');
  });
  $('timer-reset-btn').addEventListener('click', () => {
    window.api.controlTimer('reset', (+$('timer-duration').value || 30) * 60);
  });
  $('timer-add1m-btn').addEventListener('click', () => {
    window.api.controlTimer('add', 60);
  });

  // Companion Controls
  $('comp-hair-preset').addEventListener('change', () => {
    if ($('comp-hair-preset').value !== 'custom') {
      $('comp-hair-color').value = $('comp-hair-preset').value;
      broadcastCompanionChange();
    }
  });
  $('comp-hair-color').addEventListener('input', () => {
    syncPresetSelect('comp-hair-preset', $('comp-hair-color').value);
    broadcastCompanionChange();
  });
  $('comp-outfit-preset').addEventListener('change', () => {
    if ($('comp-outfit-preset').value !== 'custom') {
      $('comp-outfit-color').value = $('comp-outfit-preset').value;
      broadcastCompanionChange();
    }
  });
  $('comp-outfit-color').addEventListener('input', () => {
    syncPresetSelect('comp-outfit-preset', $('comp-outfit-color').value);
    broadcastCompanionChange();
  });
  $('comp-hairstyle').addEventListener('change', broadcastCompanionChange);
  document.querySelectorAll('#comp-cats input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', broadcastCompanionChange);
  });

  function broadcastCompanionChange() {
    const cats = Array.from(document.querySelectorAll('#comp-cats input[type="checkbox"]:checked')).map(c => c.value);
    appSettings.companion = {
      hair: $('comp-hairstyle').value,
      hc: $('comp-hair-color').value,
      oc: $('comp-outfit-color').value,
      cats
    };
    saveCurrentSettings();
  }

  $('save-companion-btn').addEventListener('click', () => {
    broadcastCompanionChange();
    alert('Companion settings saved!');
  });
  $('test-comp-happy-btn').addEventListener('click', () => {
    window.api.simulateEvent('gift', { user: 'Tester', giftName: 'Rose' });
  });

  // Settings: Theme
  $('setting-theme').addEventListener('change', () => {
    appSettings.theme = $('setting-theme').value;
    applyTheme(appSettings.theme);
    saveCurrentSettings();
  });

  // Version Pill & Sidebar Update buttons
  $('version-pill')?.addEventListener('click', () => {
    switchTab('settings');
    const card = $('card-app-updates');
    if (card) card.scrollIntoView({ behavior: 'smooth' });
  });

  $('sidebar-update-btn')?.addEventListener('click', () => {
    switchTab('settings');
    const card = $('card-app-updates');
    if (card) card.scrollIntoView({ behavior: 'smooth' });
    checkAppUpdates(true);
  });

  $('btn-check-updates')?.addEventListener('click', () => checkAppUpdates(true));
  $('btn-install-update')?.addEventListener('click', downloadAndInstallUpdate);
  $('btn-select-local-zip')?.addEventListener('click', handleSelectLocalZip);
  $('btn-view-changelog')?.addEventListener('click', openChangelogModal);
  $('btn-open-changelog-modal')?.addEventListener('click', openChangelogModal);

  // Changelog modal close
  $('modal-changelog-close')?.addEventListener('click', () => $('modal-changelog').classList.remove('active'));
  $('modal-changelog-dismiss')?.addEventListener('click', () => $('modal-changelog').classList.remove('active'));
  $('modal-changelog-update-action')?.addEventListener('click', () => {
    $('modal-changelog').classList.remove('active');
    downloadAndInstallUpdate();
  });

  // Restart modal actions
  $('btn-restart-now')?.addEventListener('click', () => {
    window.api.relaunchApp();
  });
  $('btn-restart-later')?.addEventListener('click', () => {
    $('modal-restart').classList.remove('active');
  });

  // Update Settings change listeners
  $('chk-auto-update')?.addEventListener('change', () => {
    if (!appSettings.updates) appSettings.updates = {};
    appSettings.updates.autoCheck = $('chk-auto-update').checked;
    saveCurrentSettings();
  });

  $('input-update-feed')?.addEventListener('change', () => {
    if (!appSettings.updates) appSettings.updates = {};
    appSettings.updates.feedUrl = $('input-update-feed').value.trim();
    saveCurrentSettings();
  });
});

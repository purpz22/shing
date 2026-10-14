'use strict';

// Shing Studio Renderer Script
let appSettings = {};
let currentSettings = appSettings;
if (typeof window !== 'undefined') {
  window.appSettings = appSettings;
  window.currentSettings = appSettings;
}
let wsClient = null;

const $ = id => (typeof document !== 'undefined' ? document.getElementById(id) : null);

// Jar Interactive Drag & Transform State
let jarTransform = { x: 50.0, y: 82.0, scale: 1.0 };
let isDraggingJar = false;
let dragRafId = null;

function calculateClampedCoordinates(rawX, rawY, scale = 1.0) {
  const hPct = 48 * scale;
  const wPct = hPct * (764 / 1024) * (9 / 16);
  const marginX = (wPct / 2) + 2;
  const marginY = (hPct / 2) + 2;

  const minX = Math.max(4, marginX);
  const maxX = Math.min(96, 100 - marginX);
  const minY = Math.max(6, marginY);
  const maxY = Math.min(96, 100 - marginY);

  const x = Math.max(minX, Math.min(maxX, rawX));
  const y = Math.max(minY, Math.min(maxY, rawY));
  return { x: +x.toFixed(1), y: +y.toFixed(1) };
}

function updateJarTransformUI(x, y, scale) {
  const currentScale = typeof scale === 'number' && !isNaN(scale) ? scale : jarTransform.scale;
  const currentX = typeof x === 'number' && !isNaN(x) ? x : jarTransform.x;
  const currentY = typeof y === 'number' && !isNaN(y) ? y : jarTransform.y;

  const slider = $('jar-scale-slider');
  if (slider) slider.value = currentScale;

  const badge = $('jar-scale-badge');
  if (badge) badge.textContent = `${Math.round(currentScale * 100)}%`;

  const target = $('jar-drag-target');
  if (target) {
    target.style.left = `${currentX}%`;
    target.style.top = `${currentY}%`;
    target.style.transform = `translate(-50%, -50%) scale(${currentScale})`;
  }
}

function sendJarTransform(x, y, scale) {
  const payload = { type: 'jar:transform', x, y, scale };
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    try {
      wsClient.send(JSON.stringify(payload));
    } catch (e) {}
  } else if (typeof window !== 'undefined' && window.api && window.api.simulateEvent) {
    try {
      window.api.simulateEvent('jar:transform', { x, y, scale });
    } catch (e) {}
  }

  const ifr = $('jar-preview-iframe');
  if (ifr && ifr.contentWindow) {
    try {
      ifr.contentWindow.postMessage(payload, '*');
    } catch (e) {}
  }

  if (appSettings) {
    if (!appSettings.jar) appSettings.jar = {};
    appSettings.jar.transform = { x, y, scale };
  }
}

function formatTimerDisplay(sec) {
  const safeSec = Math.max(0, Number(sec) || 0);
  const h = Math.floor(safeSec / 3600);
  const m = Math.floor((safeSec % 3600) / 60);
  const s = safeSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateTimerUI(snapshot) {
  if (!snapshot) return;
  const disp = $('dash-timer-display');
  const badge = $('dash-timer-status');
  if (disp && typeof snapshot.remainingSeconds === 'number') {
    disp.textContent = formatTimerDisplay(snapshot.remainingSeconds);
  }
  if (badge) {
    badge.className = 'timer-status-badge';
    if (snapshot.isRunning) {
      badge.classList.add('status-running');
      badge.textContent = 'Running';
    } else if (snapshot.remainingSeconds === 0) {
      badge.classList.add('status-finished');
      badge.textContent = 'Finished';
    } else {
      badge.textContent = 'Paused';
    }
  }
}

function initStudioWS() {
  if (typeof WebSocket === 'undefined') return;
  if (wsClient && (wsClient.readyState === WebSocket.OPEN || wsClient.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    const proto = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'wss:' : 'ws:';
    const host = (typeof location !== 'undefined' && location.host) ? location.host : 'localhost:3333';
    const url = (typeof location !== 'undefined' && location.protocol && location.protocol.startsWith('http'))
      ? `${proto}//${host}`
      : 'ws://localhost:3333';
    wsClient = new WebSocket(url);
    wsClient.onmessage = evt => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === 'jar:transform') {
          if (!isDraggingJar) {
            jarTransform = { x: data.x, y: data.y, scale: data.scale };
            updateJarTransformUI(jarTransform.x, jarTransform.y, jarTransform.scale);
          }
        } else if (data.type === 'init' && data.timer) {
          updateTimerUI(data.timer);
        } else if (data.type === 'timer:tick') {
          updateTimerUI({ remainingSeconds: data.remainingSeconds, isRunning: true });
        } else if (data.type === 'timer:sync') {
          if (data.timer) updateTimerUI(data.timer);
        } else if (data.type === 'timer:deduct' || data.type === 'timer:bonus') {
          updateTimerUI({ remainingSeconds: data.remainingSeconds, isRunning: true });
        }
      } catch (e) {}
    };
    wsClient.onclose = () => {
      setTimeout(initStudioWS, 2000);
    };
    wsClient.onerror = () => {};
  } catch (e) {}
}

// Browser Fallback when accessed directly at http://localhost:3333 via web browser
if (typeof window !== 'undefined' && typeof window.api === 'undefined') {
  const statusListeners = [];
  const eventListeners = [];

  function initWebWS() {
    if (typeof WebSocket === 'undefined' || typeof location === 'undefined') return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsClient = new WebSocket(`${proto}//${location.host}`);
    wsClient.onmessage = evt => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === 'jar:transform') {
          if (!isDraggingJar) {
            jarTransform = { x: data.x, y: data.y, scale: data.scale };
            updateJarTransformUI(jarTransform.x, jarTransform.y, jarTransform.scale);
          }
        } else if (data.type === 'init' && data.timer) {
          updateTimerUI(data.timer);
        } else if (data.type === 'timer:tick') {
          updateTimerUI({ remainingSeconds: data.remainingSeconds, isRunning: true });
        } else if (data.type === 'timer:sync') {
          if (data.timer) updateTimerUI(data.timer);
        } else if (data.type === 'timer:deduct' || data.type === 'timer:bonus') {
          updateTimerUI({ remainingSeconds: data.remainingSeconds, isRunning: true });
        } else if (data.type === 'tiktok:status') {
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
    controlTimer: async (action, seconds) => {
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({ type: 'timer:control', action, seconds }));
      }
    },
    getTimerStatus: async () => ({ remainingSeconds: 1800, initialSeconds: 1800, isRunning: false }),
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
    connectTikTok: async (username, options = {}) => {
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({ type: 'tiktok:connect', username, manual: Boolean(options && options.manual) }));
      }
      return { success: true, status: 'connecting', username };
    },
    disconnectTikTok: async () => {
      if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({ type: 'tiktok:disconnect' }));
      }
      return { success: true, status: 'disconnected' };
    },
    getTikTokStatus: async () => {
      return { status: 'disconnected', username: appSettings.username || 'shimmy_ming' };
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
    },
    exportSettings: async () => {
      const blob = new Blob([JSON.stringify(appSettings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shing-settings-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return { success: true, filePath: a.download };
    },
    importSettings: async () => {
      return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
          if (!input.files.length) return resolve({ canceled: true });
          try {
            const text = await input.files[0].text();
            const settings = JSON.parse(text);
            await window.api.saveSettings(settings);
            resolve({ success: true, settings, filePath: input.files[0].name });
          } catch (e) {
            resolve({ success: false, error: e.message });
          }
        };
        input.click();
      });
    },
    listSounds: async () => {
      try {
        const res = await fetch('/api/sounds');
        return await res.json();
      } catch (e) {
        return [];
      }
    },
    searchSounds: async (query) => {
      try {
        const res = await fetch(`/api/sounds/search?q=${encodeURIComponent(query)}`);
        return await res.json();
      } catch (e) {
        return [];
      }
    },
    downloadSound: async (soundUrl, title) => {
      try {
        const res = await fetch('/api/sounds/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ soundUrl, url: soundUrl, title })
        });
        return await res.json();
      } catch (e) {
        throw e;
      }
    },
    selectLocalSound: async () => {
      return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.onchange = async () => {
          if (!input.files.length) return resolve({ canceled: true });
          const file = input.files[0];
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              success: true,
              name: file.name.replace(/\.[^/.]+$/, ''),
              filename: file.name,
              url: reader.result
            });
          };
          reader.readAsDataURL(file);
        };
        input.click();
      });
    },
    onSettingsLoaded: () => () => {}
  };
}

if (typeof window !== 'undefined' && typeof window.api !== 'undefined') {
  initStudioWS();
}

// In-App Toast & Custom Alert Notification System
const NOTIF_ICONS = {
  success: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
  error: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`,
  info: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`
};

function escapeNotifHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, type = 'success', title = null, duration = 3200) {
  const container = $('toast-container');
  if (!container) return null;

  const validTypes = ['success', 'error', 'info', 'warning'];
  const toastType = validTypes.includes(type) ? type : 'info';

  const defaultTitles = {
    success: 'Success',
    error: 'Notice',
    info: 'Shing Live',
    warning: 'Warning'
  };
  const toastTitle = title || defaultTitles[toastType];

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${toastType}`;

  const iconSvg = NOTIF_ICONS[toastType] || NOTIF_ICONS.info;

  toast.innerHTML = `
    <div class="toast-icon-badge">${iconSvg}</div>
    <div class="toast-content">
      <div class="toast-title">${escapeNotifHtml(toastTitle)}</div>
      <div class="toast-message">${escapeNotifHtml(message)}</div>
    </div>
    <button class="toast-close-btn" aria-label="Close">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
    </button>
    <div class="toast-progress-bar"></div>
  `;

  container.appendChild(toast);

  const progBar = toast.querySelector('.toast-progress-bar');
  if (progBar && duration > 0) {
    progBar.style.transition = `transform ${duration}ms linear`;
    requestAnimationFrame(() => {
      progBar.style.transform = 'scaleX(0)';
    });
  }

  let dismissTimer = null;
  const closeToast = () => {
    if (toast.classList.contains('toast-closing')) return;
    toast.classList.add('toast-closing');
    if (dismissTimer) clearTimeout(dismissTimer);
    setTimeout(() => {
      try { toast.remove(); } catch (e) {}
    }, 240);
  };

  const closeBtn = toast.querySelector('.toast-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeToast);

  if (duration > 0) {
    dismissTimer = setTimeout(closeToast, duration);
  }

  return toast;
}

let customAlertResolver = null;
function showCustomAlert(message, title = 'Notice', type = 'info') {
  return new Promise(resolve => {
    const modal = $('modal-custom-alert');
    if (!modal) {
      showToast(message, type, title);
      return resolve(true);
    }

    customAlertResolver = resolve;

    const titleEl = $('custom-alert-title');
    const headingEl = $('custom-alert-heading');
    const msgEl = $('custom-alert-message');
    const iconWrap = $('custom-alert-icon-wrap');
    const hdrIcon = $('custom-alert-hdr-icon');

    if (titleEl) titleEl.textContent = title || 'Notice';
    if (headingEl) headingEl.textContent = title || 'Notice';
    if (msgEl) msgEl.textContent = message || '';

    const validTypes = ['success', 'error', 'info', 'warning'];
    const modalType = validTypes.includes(type) ? type : 'info';

    if (iconWrap) {
      iconWrap.className = `custom-alert-icon-wrap ${modalType}`;
      iconWrap.innerHTML = NOTIF_ICONS[modalType] || NOTIF_ICONS.info;
    }
    if (hdrIcon) {
      hdrIcon.innerHTML = NOTIF_ICONS[modalType] || NOTIF_ICONS.info;
    }

    modal.classList.add('active');
  });
}

function closeCustomAlert() {
  const modal = $('modal-custom-alert');
  if (modal) modal.classList.remove('active');
  if (typeof customAlertResolver === 'function') {
    const fn = customAlertResolver;
    customAlertResolver = null;
    fn(true);
  }
}

// Global window.alert override so OS dialogs never block the streamer
window.alert = function(msg) {
  showToast(String(msg), 'info', 'Shing Live');
};

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

// Overlay Card Live Demo Loops Manager
const OverlayDemoManager = {
  isRunning: false,
  chatInterval: null,
  jarInterval: null,
  ltInterval: null,
  alertInterval: null,
  timerInterval: null,
  simSeconds: 1800,
  chatIdx: 0,
  ltIdx: 0,
  alertIdx: 0,
  jarItemCount: 42,

  chatSamples: [
    { user: 'CuteFan', role: 'top_gifter', tag: 'Top Gifter', tagClass: 'tag-gifter', text: 'Sent 100x Roses!' },
    { user: 'SparkleWren', role: 'streamer', tag: 'Streamer', tagClass: 'tag-streamer', text: 'Welcome to the stream everyone!' },
    { user: 'NekoGamer', role: 'subscriber', tag: 'Sub', tagClass: 'tag-sub', text: 'The stream overlay is so cozy!' },
    { user: 'ModKitten', role: 'moderator', tag: 'Mod', tagClass: 'tag-mod', text: 'Tap the screen and share the LIVE!' },
    { user: 'MochiBoba', role: 'viewer', tag: '', tagClass: '', text: 'Hello streamer! Love the vibes!' }
  ],

  jarIcons: [
    `<svg viewBox="0 0 24 24" fill="#ff4081"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
    `<svg viewBox="0 0 24 24" fill="#ffd700"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M15 9.5H9.5a2.5 2.5 0 0 1 0-5H14" stroke="#b8860b" stroke-width="2" fill="none"/></svg>`,
    `<svg viewBox="0 0 24 24" fill="#9c27b0"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
    `<svg viewBox="0 0 24 24" fill="#00e5ff"><path d="M19 3H5L2 9l10 12L22 9l-3-6z"/></svg>`
  ],

  ltIcons: {
    tiktok: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.89 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.34 0 .66.06.96.16v-3.52a6.37 6.37 0 0 0-.96-.08A6.34 6.34 0 0 0 3 15.67 6.34 6.34 0 0 0 9.34 22a6.34 6.34 0 0 0 6.34-6.33V8.8a8.28 8.28 0 0 0 3.91.95v-3.06z"/></svg>`,
    instagram: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
    youtube: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
    discord: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`
  },

  alertTemplates: [
    { type: 'follow', title: 'New Follower!', sub: 'SparkleFan joined the stream', icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>` },
    { type: 'gift', title: 'Rose Gift Alert!', sub: 'StarGamer sent 10x Roses', icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="#ff4081"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>` },
    { type: 'big_gift', title: 'Big Gift Galaxy!', sub: 'DiamondVIP sent Galaxy (1,000 Coins)', icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="#9c27b0"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>` },
    { type: 'like', title: 'Likes Milestone!', sub: '50 Likes reached! Tap the screen!', icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="#ff9100"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>` }
  ],

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.sync();

    // 1. Chat Demo Timer
    this.spawnChatBubble();
    this.chatInterval = setInterval(() => this.spawnChatBubble(), 2400);

    // 2. Jar Demo Timer
    this.jarInterval = setInterval(() => this.dropJarGift(), 1800);

    // 3. Lower Third Demo Timer
    this.ltInterval = setInterval(() => this.cycleLowerThird(), 3000);

    // 4. Alert Banner Demo Timer
    this.alertInterval = setInterval(() => this.cycleAlertBanner(), 3400);

    // 5. Timer Demo Countdown
    this.simSeconds = (appSettings.timer?.durationMin || 30) * 60;
    this.updateTimerDisplay();
    this.timerInterval = setInterval(() => {
      this.simSeconds = Math.max(0, this.simSeconds - 1);
      this.updateTimerDisplay();
      if (this.simSeconds % 14 === 0) {
        this.triggerTimerBonus();
      }
    }, 1000);

    // 6. Pet-Pet Headpat Mini Canvas Demo
    this.startHeadpatDemo();
  },

  stop() {
    this.isRunning = false;
    clearInterval(this.chatInterval);
    clearInterval(this.jarInterval);
    clearInterval(this.ltInterval);
    clearInterval(this.alertInterval);
    clearInterval(this.timerInterval);
    if (this.headpatRaf) cancelAnimationFrame(this.headpatRaf);
    this.chatInterval = null;
    this.jarInterval = null;
    this.ltInterval = null;
    this.alertInterval = null;
    this.timerInterval = null;
    this.headpatRaf = null;
  },

  startHeadpatDemo() {
    const cvs = $('ov-demo-headpat-canvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const FRAMES = 5;
    const RES = 112;

    const frameOffsets = [
      { x: 0, y: 0, w: 0, h: 0 },
      { x: -4, y: 12, w: 4, h: -12 },
      { x: -12, y: 18, w: 12, h: -18 },
      { x: -8, y: 12, w: 4, h: -12 },
      { x: -4, y: 0, w: 0, h: 0 }
    ];

    const DEFAULTS = {
      squish: 1.25,
      scale: 0.875,
      spriteX: 14,
      spriteY: 20,
      spriteWidth: 112,
      spriteHeight: 112
    };

    function getSpriteFrame(f) {
      const o = frameOffsets[f];
      return {
        dx: Math.floor(DEFAULTS.spriteX + o.x * (DEFAULTS.squish * 0.4)),
        dy: Math.floor(DEFAULTS.spriteY + o.y * (DEFAULTS.squish * 0.9)),
        dw: Math.floor((DEFAULTS.spriteWidth + o.w * DEFAULTS.squish) * DEFAULTS.scale),
        dh: Math.floor((DEFAULTS.spriteHeight + o.h * DEFAULTS.squish) * DEFAULTS.scale)
      };
    }

    if (!this.headpatAvatarImg) {
      this.headpatAvatarImg = new Image();
      this.headpatAvatarImg.src = '../assets/avatar.png';
    }

    if (!this.headpatSprite) {
      this.headpatSprite = new Image();
      this.headpatSprite.src = '../assets/petpet/sprite.png';
    }

    if (!this.headpatHandFrames) {
      this.headpatHandFrames = [];
      for (let i = 0; i < FRAMES; i++) {
        const img = new Image();
        img.src = `../assets/petpet/pet${i}.gif`;
        this.headpatHandFrames.push(img);
      }
    }

    let currentFrame = 0;
    let lastTime = 0;
    const renderMiniHeadpat = (timestamp) => {
      if (!this.isRunning) return;
      const speedMult = Math.max(0.4, Math.min(2.5, Number(appSettings.headpat?.speed) || 1.0));
      const frameInterval = 60 / speedMult;
      if (!lastTime || timestamp - lastTime >= frameInterval) {
        lastTime = timestamp;
        currentFrame = (currentFrame + 1) % FRAMES;
        ctx.clearRect(0, 0, RES, RES);

        const cf = getSpriteFrame(currentFrame);
        const S = RES / 112;

        const drawX = cf.dx * S;
        const drawY = cf.dy * S;
        const drawW = cf.dw * S;
        const drawH = cf.dh * S;

        // Draw squished avatar with ellipse clipping
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(drawX + drawW / 2, drawY + drawH / 2, Math.abs(drawW) / 2, Math.abs(drawH) / 2, 0, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try {
          ctx.drawImage(this.headpatAvatarImg, drawX, drawY, drawW, drawH);
        } catch (_) {}
        ctx.restore();

        // Dynamic hand Y offset tracking head squish
        const handDy = Math.max(0, Math.floor((cf.dy * 0.75 - Math.max(0, DEFAULTS.spriteY) - 0.5) * S));

        // Draw authentic PetPet hand from sprite sheet or frames
        if (this.headpatSprite.complete && this.headpatSprite.naturalWidth > 0) {
          try {
            ctx.drawImage(
              this.headpatSprite,
              currentFrame * 112, 0, 112, 112,
              0, handDy, 112 * S, 112 * S
            );
          } catch (_) {}
        } else if (this.headpatHandFrames[currentFrame] && this.headpatHandFrames[currentFrame].complete) {
          try {
            ctx.drawImage(
              this.headpatHandFrames[currentFrame],
              0, 0, 112, 112,
              0, handDy, 112 * S, 112 * S
            );
          } catch (_) {}
        }
      }
      this.headpatRaf = requestAnimationFrame(renderMiniHeadpat);
    };
    if (this.headpatRaf) cancelAnimationFrame(this.headpatRaf);
    this.headpatRaf = requestAnimationFrame(renderMiniHeadpat);
  },

  sync() {
    // Sync Chat Card Theme & Shapes
    const chatBox = $('ov-demo-chat-box');
    const theme = appSettings.chat?.theme || 'pastel-purple';
    const fontKey = appSettings.chat?.fontFamily || 'quicksand';
    const radius = appSettings.chat?.bubbleRadius || 16;
    const shape = appSettings.chat?.avatarShape || 'circle';
    const showBadges = appSettings.chat?.showBadges !== false;
    if (chatBox) {
      const fontCls = ` font-${fontKey}`;
      chatBox.className = `card-preview chat-preview-box chat-dash-preview theme-${theme}${fontCls}`;
      chatBox.style.setProperty('--bubble-radius', `${radius}px`);
      const resolvedFont = CHAT_FONT_MAP[fontKey] || CHAT_FONT_MAP['quicksand'];
      chatBox.style.setProperty('--chat-font-family', resolvedFont);
      chatBox.style.fontFamily = resolvedFont;
      chatBox.querySelectorAll('.demo-chat-pfp').forEach(img => {
        img.className = `demo-chat-pfp shape-${shape}`;
      });
      chatBox.querySelectorAll('.demo-chat-tag').forEach(tag => {
        tag.style.display = showBadges ? '' : 'none';
      });
    }

    // Sync Lower Third Handle
    this.updateLowerThirdCard();

    // Sync Companion iframe if exists
    const compIframe = $('ov-demo-comp-iframe');
    if (compIframe && !compIframe.src.includes('localhost:3333')) {
      compIframe.src = 'http://localhost:3333/overlays/companion?muted=1';
    }

    // Sync Ranking Cards Theme & Scale
    const likersCard = $('ov-demo-toplikers-card');
    if (likersCard) {
      const lTheme = appSettings.rankings?.topLikersTheme || 'Purple';
      const lScale = typeof appSettings.rankings?.topLikersScale === 'number' ? appSettings.rankings.topLikersScale : 1.0;
      likersCard.dataset.theme = lTheme;
      likersCard.style.setProperty('--demo-scale', lScale);
    }
    const stayCard = $('ov-demo-viewerranking-card');
    if (stayCard) {
      const sTheme = appSettings.rankings?.viewerRankingTheme || 'Purple';
      const sScale = typeof appSettings.rankings?.viewerRankingScale === 'number' ? appSettings.rankings.viewerRankingScale : 1.0;
      stayCard.dataset.theme = sTheme;
      stayCard.style.setProperty('--demo-scale', sScale);
    }
  },

  spawnChatBubble() {
    const feed = $('ov-demo-chat-feed');
    if (!feed) return;

    const data = this.chatSamples[this.chatIdx % this.chatSamples.length];
    this.chatIdx++;

    const shape = appSettings.chat?.avatarShape || 'circle';
    const showBadges = appSettings.chat?.showBadges !== false;
    const item = document.createElement('div');
    item.className = 'demo-chat-bubble-item';

    const tagStyle = showBadges ? '' : ' style="display:none"';
    const tagHtml = data.tag ? `<span class="demo-chat-tag ${data.tagClass}"${tagStyle}>${escapeNotifHtml(data.tag)}</span>` : '';

    item.innerHTML = `
      <img src="../assets/avatar.png" class="demo-chat-pfp shape-${shape}" alt="PFP">
      <div class="demo-chat-content">
        <div class="demo-chat-meta">
          <span class="demo-chat-user">${escapeNotifHtml(data.user)}</span>
          ${tagHtml}
        </div>
        <div class="demo-chat-text">${escapeNotifHtml(data.text)}</div>
      </div>
    `;

    feed.appendChild(item);

    // Keep max 2 items visible in 140px card
    while (feed.children.length > 2) {
      feed.removeChild(feed.children[0]);
    }
  },

  dropJarGift() {
    const giftsLayer = $('ov-demo-jar-gifts');
    const badge = $('ov-demo-jar-badge');
    if (!giftsLayer) return;

    const iconSvg = this.jarIcons[Math.floor(Math.random() * this.jarIcons.length)];
    const giftEl = document.createElement('div');
    giftEl.className = 'demo-jar-gift-drop';
    giftEl.innerHTML = iconSvg;

    giftsLayer.appendChild(giftEl);

    this.jarItemCount = (this.jarItemCount >= 55) ? 42 : this.jarItemCount + 1;
    if (badge) {
      const topSenders = ['Sakura', 'MochiCat', 'PixelStar', 'BobaQueen'];
      const topGifts = ['Galaxy (1k)', 'Lion (10k)', 'Universe (34k)', 'Rose x100'];
      const idx = Math.floor(this.jarItemCount / 4) % topSenders.length;
      badge.textContent = `Top Gift: ${topSenders[idx]} • ${topGifts[idx]}`;
    }

    while (giftsLayer.children.length > 12) {
      giftsLayer.removeChild(giftsLayer.children[0]);
    }
  },

  cycleLowerThird() {
    this.ltIdx++;
    this.updateLowerThirdCard();
  },

  updateLowerThirdCard() {
    const platformEl = $('ov-demo-lt-platform');
    const handleEl = $('ov-demo-lt-handle');
    const iconEl = $('ov-demo-lt-icon');
    const cardEl = $('ov-demo-lt-card');
    if (!platformEl || !handleEl) return;

    const lt = appSettings.lowerThird || {};
    const uname = appSettings.username ? `@${appSettings.username}` : '@shimmy_ming';

    const platforms = [
      { id: 'tiktok', name: 'TikTok', handle: lt.tiktok || uname, icon: this.ltIcons.tiktok },
      { id: 'instagram', name: 'Instagram', handle: lt.instagram || '@shimmy.live', icon: this.ltIcons.instagram },
      { id: 'youtube', name: 'YouTube', handle: lt.youtube || 'Shimmy Live', icon: this.ltIcons.youtube },
      { id: 'discord', name: 'Discord', handle: lt.discord || 'discord.gg/shimmy', icon: this.ltIcons.discord }
    ];

    const current = platforms[this.ltIdx % platforms.length];

    if (cardEl) {
      cardEl.style.transform = 'scale(0.95)';
      setTimeout(() => {
        platformEl.textContent = current.name;
        handleEl.textContent = current.handle;
        if (iconEl) iconEl.innerHTML = current.icon;
        cardEl.style.transform = 'scale(1)';
      }, 150);
    } else {
      platformEl.textContent = current.name;
      handleEl.textContent = current.handle;
      if (iconEl) iconEl.innerHTML = current.icon;
    }
  },

  cycleAlertBanner() {
    const banner = $('ov-demo-alert-banner');
    const titleEl = $('ov-demo-alert-title');
    const subEl = $('ov-demo-alert-sub');
    const iconEl = $('ov-demo-alert-icon');
    if (!banner || !titleEl || !subEl) return;

    this.alertIdx++;
    const tpl = this.alertTemplates[this.alertIdx % this.alertTemplates.length];

    let subMsg = tpl.sub;
    if (tpl.type === 'follow' && appSettings.triggers?.followMessage) {
      subMsg = appSettings.triggers.followMessage.replace(/\{name\}|\{user\}|\[name\]|\[user\]/gi, 'SparkleFan');
    } else if (tpl.type === 'gift' && appSettings.triggers?.giftMessage) {
      subMsg = appSettings.triggers.giftMessage.replace(/\{name\}|\{user\}|\[name\]|\[user\]/gi, 'StarGamer').replace(/\{gift\}|\[gift\]/gi, 'Rose');
    }

    banner.style.transform = 'translateY(-6px) scale(0.96)';
    banner.style.opacity = '0.5';

    setTimeout(() => {
      titleEl.textContent = tpl.title;
      subEl.textContent = subMsg;
      if (iconEl) iconEl.innerHTML = tpl.icon;
      banner.style.transform = 'translateY(0) scale(1)';
      banner.style.opacity = '1';
    }, 180);
  },

  updateTimerDisplay() {
    const digitsEl = $('ov-demo-timer-digits');
    if (!digitsEl) return;

    const s = Math.max(0, this.simSeconds);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const h = Math.floor(m / 60);
    const remM = m % 60;

    const hh = String(h).padStart(2, '0');
    const mm = String(remM).padStart(2, '0');
    const ss = String(sec).padStart(2, '0');

    digitsEl.textContent = h > 0 ? `${hh}:${mm}:${ss}` : `00:${mm}:${ss}`;
  },

  triggerTimerBonus() {
    const bonusPill = $('ov-demo-timer-bonus');
    const digitsEl = $('ov-demo-timer-digits');
    const bonusSec = appSettings.timer?.addSecondsPerGift || 15;

    this.simSeconds += bonusSec;
    this.updateTimerDisplay();

    if (bonusPill) {
      bonusPill.textContent = `+${bonusSec}s Bonus Added`;
      bonusPill.style.transform = 'scale(1.25)';
      if (digitsEl) digitsEl.style.transform = 'scale(1.08)';

      setTimeout(() => {
        bonusPill.style.transform = 'scale(1)';
        if (digitsEl) digitsEl.style.transform = 'scale(1)';
      }, 350);
    }
  }
};

// Tab Switching
function switchTab(tabId) {
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tabId}`);
  });
  if (tabId === 'overlays') {
    OverlayDemoManager.start();
    const demoCompIfr = $('ov-demo-comp-iframe');
    if (demoCompIfr && demoCompIfr.contentWindow) {
      setTimeout(() => {
        try { demoCompIfr.contentWindow.dispatchEvent(new Event('resize')); } catch (e) {}
      }, 60);
    }
  } else {
    OverlayDemoManager.stop();
  }
  if (tabId === 'companion') {
    const ifr = $('comp-preview-iframe');
    if (ifr && ifr.contentWindow) {
      setTimeout(() => {
        try { ifr.contentWindow.dispatchEvent(new Event('resize')); } catch (e) {}
      }, 60);
    }
  }
  if (tabId === 'banner') {
    const ifr = $('banner-preview-iframe');
    if (ifr && ifr.contentWindow) {
      setTimeout(() => {
        try { ifr.contentWindow.dispatchEvent(new Event('resize')); } catch (e) {}
      }, 60);
    }
  }
  const jarIfr = $('jar-preview-iframe');
  if (jarIfr && jarIfr.contentWindow) {
    try {
      jarIfr.contentWindow.postMessage({ type: 'jar:set-paused', paused: tabId !== 'jar' }, '*');
    } catch (e) {}
    if (tabId === 'jar') {
      setTimeout(() => {
        try { jarIfr.contentWindow.dispatchEvent(new Event('resize')); } catch (e) {}
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
  try {
    if (themeName) {
      localStorage.setItem('shing_theme', themeName);
    }
  } catch (e) {}
}

// Apply cached theme immediately on script evaluation to prevent startup theme flash
try {
  const initialCachedTheme = localStorage.getItem('shing_theme');
  if (initialCachedTheme) {
    applyTheme(initialCachedTheme);
  }
} catch (e) {}

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
    if (data.type === 'jar:transform') {
      if (!isDraggingJar) {
        jarTransform = { x: data.x, y: data.y, scale: data.scale };
        updateJarTransformUI(jarTransform.x, jarTransform.y, jarTransform.scale);
      }
      return;
    }
    if (data.type === 'chat') {
      sessionStats.chat++;
      updateHUD();
      appendDashboardChatPreview(data);
    } else if (data.type === 'gift') {
      sessionStats.coins += (data.coins || data.diamonds || 1) * (data.count || 1);
      updateHUD();
    } else if (data.type === 'like') {
      sessionStats.likes += (data.count || 1);
      updateHUD();
    }
  });
}

const CONNECT_ICONS = {
  connect: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>`,
  connecting: `<svg class="spin-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`,
  connected: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`
};

let currentConnectionStatus = 'disconnected';

function updateConnectionUI(statusData = {}) {
  const state = statusData.status || 'disconnected';
  const prevState = currentConnectionStatus;
  currentConnectionStatus = state;

  const uname = (statusData.username || appSettings.username || 'shimmy_ming').replace(/^@/, '');
  const pill = $('account-pill');
  const dot = $('header-status-dot') || (pill ? pill.querySelector('.status-dot') : null);
  const nameEl = $('header-username');

  if (uname && nameEl) {
    nameEl.textContent = `@${uname}`;
  }

  const hdrConnectBtn = $('header-connect-btn');
  const hdrConnectIcon = $('header-connect-icon');
  const hdrConnectLabel = $('header-connect-label');
  const hdrDisconnectBtn = $('header-disconnect-btn');

  const setConnBadge = $('settings-conn-badge');
  const setStatusDot = $('settings-status-dot');
  const setStatusText = $('settings-status-text');
  const setConnHint = $('settings-conn-hint');
  const setConnectBtn = $('settings-connect-btn');
  const setConnectIcon = $('settings-connect-icon');
  const setConnectLabel = $('settings-connect-label');
  const setDisconnectBtn = $('settings-disconnect-btn');

  if (dot) {
    dot.className = 'status-dot';
    if (state === 'connected') dot.classList.add('online');
    else if (state === 'connecting') dot.classList.add('connecting');
    else if (state === 'waiting') dot.classList.add('waiting');
    else dot.classList.add('offline');
  }

  if (setStatusDot) {
    setStatusDot.className = 'status-dot';
    if (state === 'connected') setStatusDot.classList.add('online');
    else if (state === 'connecting') setStatusDot.classList.add('connecting');
    else if (state === 'waiting') setStatusDot.classList.add('waiting');
    else setStatusDot.classList.add('offline');
  }

  if (state === 'connected') {
    if (pill) pill.title = `Live on TikTok (Room: ${statusData.roomId || 'Active'}) - Click to change account`;
    if (hdrConnectBtn) {
      hdrConnectBtn.className = 'header-connect-btn connected';
      hdrConnectBtn.disabled = false;
      hdrConnectBtn.title = `Connected to @${uname} (Room: ${statusData.roomId || 'Active'}) - Click to Reconnect`;
    }
    if (hdrConnectIcon) hdrConnectIcon.innerHTML = CONNECT_ICONS.connected;
    if (hdrConnectLabel) hdrConnectLabel.textContent = 'Connected';
    if (hdrDisconnectBtn) hdrDisconnectBtn.classList.remove('hidden');

    if (setConnBadge) setConnBadge.className = 'conn-status-badge online';
    if (setStatusText) setStatusText.textContent = 'Connected (Live)';
    if (setConnHint) setConnHint.textContent = statusData.message || `Actively connected to @${uname}'s TikTok Live stream.`;
    if (setConnectBtn) setConnectBtn.disabled = false;
    if (setConnectIcon) setConnectIcon.innerHTML = CONNECT_ICONS.connected;
    if (setConnectLabel) setConnectLabel.textContent = 'Reconnect Live';
    if (setDisconnectBtn) setDisconnectBtn.classList.remove('hidden');

    if (!statusData.manual && prevState !== 'connected') {
      showToast(`Connected to @${uname}'s TikTok Live stream!`, 'success', 'TikTok Live');
    }
  } else if (state === 'connecting') {
    if (pill) pill.title = `Connecting to @${uname}...`;
    if (hdrConnectBtn) {
      hdrConnectBtn.className = 'header-connect-btn connecting';
      hdrConnectBtn.disabled = true;
      hdrConnectBtn.title = `Connecting to @${uname} on TikTok Live...`;
    }
    if (hdrConnectIcon) hdrConnectIcon.innerHTML = CONNECT_ICONS.connecting;
    if (hdrConnectLabel) hdrConnectLabel.textContent = 'Connecting...';
    if (hdrDisconnectBtn) hdrDisconnectBtn.classList.remove('hidden');

    if (setConnBadge) setConnBadge.className = 'conn-status-badge connecting';
    if (setStatusText) setStatusText.textContent = 'Connecting...';
    if (setConnHint) setConnHint.textContent = statusData.message || `Connecting to @${uname}'s TikTok Live stream...`;
    if (setConnectBtn) setConnectBtn.disabled = true;
    if (setConnectIcon) setConnectIcon.innerHTML = CONNECT_ICONS.connecting;
    if (setConnectLabel) setConnectLabel.textContent = 'Connecting...';
    if (setDisconnectBtn) setDisconnectBtn.classList.remove('hidden');
  } else if (state === 'waiting') {
    if (pill) pill.title = statusData.message || `@${uname} is offline. Click Connect when you go live.`;
    if (hdrConnectBtn) {
      hdrConnectBtn.className = 'header-connect-btn';
      hdrConnectBtn.disabled = false;
      hdrConnectBtn.title = `Click to manually connect to @${uname}'s TikTok Live`;
    }
    if (hdrConnectIcon) hdrConnectIcon.innerHTML = CONNECT_ICONS.connect;
    if (hdrConnectLabel) hdrConnectLabel.textContent = 'Connect';
    if (hdrDisconnectBtn) hdrDisconnectBtn.classList.add('hidden');

    if (setConnBadge) setConnBadge.className = 'conn-status-badge waiting';
    if (setStatusText) setStatusText.textContent = 'Waiting for Live';
    if (setConnHint) setConnHint.textContent = statusData.message || `@${uname} is not live yet. Click Connect Live once your stream starts.`;
    if (setConnectBtn) setConnectBtn.disabled = false;
    if (setConnectIcon) setConnectIcon.innerHTML = CONNECT_ICONS.connect;
    if (setConnectLabel) setConnectLabel.textContent = 'Connect Live';
    if (setDisconnectBtn) setDisconnectBtn.classList.remove('hidden');
  } else {
    if (pill) pill.title = `Not connected (@${uname}) - Click to change account`;
    if (hdrConnectBtn) {
      hdrConnectBtn.className = 'header-connect-btn';
      hdrConnectBtn.disabled = false;
      hdrConnectBtn.title = `Click to manually connect to @${uname}'s TikTok Live`;
    }
    if (hdrConnectIcon) hdrConnectIcon.innerHTML = CONNECT_ICONS.connect;
    if (hdrConnectLabel) hdrConnectLabel.textContent = 'Connect';
    if (hdrDisconnectBtn) hdrDisconnectBtn.classList.add('hidden');

    if (setConnBadge) setConnBadge.className = 'conn-status-badge offline';
    if (setStatusText) setStatusText.textContent = 'Not Connected';
    if (setConnHint) setConnHint.textContent = statusData.message || `Click Connect Live when your TikTok stream is active to manually connect.`;
    if (setConnectBtn) setConnectBtn.disabled = false;
    if (setConnectIcon) setConnectIcon.innerHTML = CONNECT_ICONS.connect;
    if (setConnectLabel) setConnectLabel.textContent = 'Connect Live';
    if (setDisconnectBtn) setDisconnectBtn.classList.add('hidden');
  }
}

async function handleManualConnect(rawUsername) {
  const inputVal = (typeof rawUsername === 'string' && rawUsername.trim())
    ? rawUsername
    : (($('setting-username') ? $('setting-username').value : '') || appSettings.username || 'shimmy_ming');
  const cleanUser = String(inputVal).trim().replace(/^@/, '').replace(/\/.*$/, '').trim() || 'shimmy_ming';

  if (appSettings.username !== cleanUser || !appSettings.confirmed) {
    appSettings.username = cleanUser;
    appSettings.confirmed = true;
    if ($('header-username')) $('header-username').textContent = `@${cleanUser}`;
    if ($('setting-username')) $('setting-username').value = `@${cleanUser}`;
    if ($('lt-tiktok')) $('lt-tiktok').value = `@${cleanUser}`;
    saveCurrentSettings();
  } else if ($('setting-username')) {
    $('setting-username').value = `@${cleanUser}`;
  }

  updateConnectionUI({
    status: 'connecting',
    username: cleanUser,
    manual: true,
    message: `Connecting to @${cleanUser}'s TikTok Live stream...`
  });

  try {
    const res = await window.api.connectTikTok(cleanUser, { manual: true });
    if (res && res.status) {
      updateConnectionUI(res);
    }
    if (res && res.status === 'connected') {
      showToast(`Connected to @${res.username || cleanUser}'s TikTok Live stream!`, 'success', 'TikTok Live');
    } else if (res && res.status === 'waiting') {
      const toastMsg = res.error && res.error !== 'offline'
        ? (res.message || `Could not connect to @${res.username || cleanUser}. Retrying automatically...`)
        : `@${res.username || cleanUser} is not live right now. Start your stream and click Connect!`;
      showToast(toastMsg, 'warning', 'TikTok Live', 4500);
    }
  } catch (err) {
    updateConnectionUI({
      status: 'disconnected',
      username: cleanUser,
      manual: true,
      message: `Connection failed: ${err.message}`
    });
    showToast(`Could not connect to @${cleanUser}: ${err.message}`, 'error', 'TikTok Live');
  }
}

async function handleManualDisconnect() {
  try {
    const res = await window.api.disconnectTikTok();
    const uname = res?.username || appSettings.username || 'shimmy_ming';
    updateConnectionUI({
      status: 'disconnected',
      username: uname,
      manual: true,
      message: 'Disconnected from TikTok Live. Click Connect to manually connect.'
    });
    showToast(`Disconnected from @${uname}. Click Connect anytime to reconnect.`, 'info', 'TikTok Live');
  } catch (err) {
    showToast(`Disconnect error: ${err.message}`, 'error', 'TikTok Live');
  }
}

if (typeof window.api !== 'undefined' && window.api.onTikTokStatus) {
  window.api.onTikTokStatus(statusData => {
    updateConnectionUI(statusData);
  });
}

// Live Preview & Real-Time Chat Preview Helpers
function resolveDashboardAvatar(url) {
  if (!url || typeof url !== 'string' || url === '../assets/avatar.png' || url === '/assets/avatar.png') {
    return '../assets/avatar.png';
  }
  if (/^https?:\/\//i.test(url) && !url.includes('localhost') && !url.includes('127.0.0.1')) {
    return `http://localhost:3333/api/avatar-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

const CHAT_FONT_MAP = {
  'quicksand': "'Quicksand', 'Nunito', 'Segoe UI', sans-serif",
  'fredoka': "'Fredoka', 'Quicksand', sans-serif",
  'nunito': "'Nunito', 'Segoe UI', sans-serif",
  'itim': "'Itim', 'Comic Sans MS', cursive, sans-serif",
  'sniglet': "'Sniglet', 'Fredoka', cursive, sans-serif",
  'dynapuff': "'DynaPuff', 'Fredoka', cursive, sans-serif",
  'comfortaa': "'Comfortaa', 'Quicksand', sans-serif",
  'pixel': "'Press Start 2P', 'Courier New', monospace",
  'system': "'Segoe UI', system-ui, -apple-system, sans-serif"
};

function updateChatPreviewBox() {
  const previewContainer = $('dashboard-chat-preview');
  const theme = $('chat-theme') ? $('chat-theme').value : (appSettings.chat?.theme || 'pastel-purple');
  const fontKey = $('chat-font-family') ? $('chat-font-family').value : (appSettings.chat?.fontFamily || 'quicksand');
  const shape = $('chat-avatar-shape') ? $('chat-avatar-shape').value : (appSettings.chat?.avatarShape || 'circle');
  const anim = $('chat-avatar-anim') ? $('chat-avatar-anim').value : (appSettings.chat?.avatarAnim || 'elastic');
  const radius = $('chat-radius') ? +$('chat-radius').value : (appSettings.chat?.bubbleRadius || 16);
  const fontSize = $('chat-font-size') ? +$('chat-font-size').value : (appSettings.chat?.fontSize || 14);
  const showBadges = $('chat-badges') ? $('chat-badges').checked : (appSettings.chat?.showBadges !== false);

  if (!appSettings.chat) appSettings.chat = {};
  appSettings.chat.theme = theme;
  appSettings.chat.fontFamily = fontKey;
  appSettings.chat.avatarShape = shape;
  appSettings.chat.avatarAnim = anim;
  appSettings.chat.bubbleRadius = radius;
  appSettings.chat.fontSize = fontSize;
  appSettings.chat.showBadges = showBadges;

  if (previewContainer) {
    const fontCls = ` font-${fontKey}`;
    previewContainer.className = `chat-dash-preview theme-${theme}${fontCls}`;
    previewContainer.style.setProperty('--bubble-radius', `${radius}px`);
    previewContainer.style.setProperty('--chat-font-size', `${fontSize}px`);
    const resolvedFont = CHAT_FONT_MAP[fontKey] || CHAT_FONT_MAP['quicksand'];
    previewContainer.style.setProperty('--chat-font-family', resolvedFont);
    previewContainer.style.fontFamily = resolvedFont;

    previewContainer.querySelectorAll('.preview-pfp-wrap').forEach(wrap => {
      wrap.className = `preview-pfp-wrap shape-${shape}`;
    });
    previewContainer.querySelectorAll('.badge').forEach(badge => {
      badge.style.display = showBadges ? '' : 'none';
    });
  }

  if (typeof OverlayDemoManager !== 'undefined') {
    OverlayDemoManager.sync();
  }
}

function appendDashboardChatPreview(data = {}) {
  const previewContainer = $('dashboard-chat-preview');
  if (!previewContainer) return;

  const user = data.nickname || data.user || data.uniqueId || 'Viewer';
  const role = data.role || 'viewer';
  const comment = data.comment || '';
  if (!String(comment).trim()) return;

  const shape = $('chat-avatar-shape') ? $('chat-avatar-shape').value : (appSettings.chat?.avatarShape || 'circle');
  const showBadges = $('chat-badges') ? $('chat-badges').checked : (appSettings.chat?.showBadges !== false);
  const roleBadgeText = data.badge || (
    role === 'streamer' ? 'Streamer' :
    role === 'moderator' ? 'Mod' :
    role === 'top_gifter' ? 'Top Gifter' :
    role === 'subscriber' ? 'Sub' : ''
  );
  const badgeClass = role === 'top_gifter' ? 'gifter' : role;
  const badgeStyle = showBadges ? '' : ' style="display:none"';
  const badgeHtml = roleBadgeText
    ? `<span class="badge badge-${escapeNotifHtml(badgeClass)}"${badgeStyle}>${escapeNotifHtml(roleBadgeText)}</span>`
    : '';
  const avatarSrc = resolveDashboardAvatar(data.avatar);

  const msgEl = document.createElement('div');
  msgEl.className = `preview-chat-msg role-${escapeNotifHtml(role)}`;
  msgEl.innerHTML = `
    <div class="preview-pfp-wrap shape-${escapeNotifHtml(shape)}">
      <img src="${escapeNotifHtml(avatarSrc)}" class="preview-pfp-img" alt="PFP" onerror="this.src='../assets/avatar.png'">
    </div>
    <div class="preview-chat-body">
      <div class="preview-chat-hdr">
        <span class="preview-uname">${escapeNotifHtml(user)}</span>
        ${badgeHtml}
      </div>
      <div class="preview-comment">${escapeNotifHtml(comment)}</div>
    </div>
  `;

  previewContainer.appendChild(msgEl);
  while (previewContainer.children.length > 3) {
    previewContainer.removeChild(previewContainer.firstChild);
  }
  updateChatPreviewBox();
}

// Universal Volume & Trigger Media UI Helpers
function updateUniversalVolumeUI() {
  const vol = typeof appSettings.universalVolume === 'number' ? appSettings.universalVolume : 0.85;
  const muted = Boolean(appSettings.universalMuted);
  const slider = $('universal-volume-slider');
  const valEl = $('universal-volume-val');
  const muteBtn = $('universal-mute-btn');
  const iconOn = $('universal-vol-icon-on');
  const iconOff = $('universal-vol-icon-off');

  if (slider) slider.value = vol;
  if (valEl) valEl.textContent = muted ? 'Muted' : `${Math.round(vol * 100)}%`;
  if (muteBtn) muteBtn.classList.toggle('muted', muted || vol <= 0);
  if (iconOn) iconOn.classList.toggle('hidden', muted || vol <= 0);
  if (iconOff) iconOff.classList.toggle('hidden', !(muted || vol <= 0));
}

// Events Table & Event Editor Modal Controller Logic
let cachedSoundList = [];
const EVENT_DEFINITIONS = [
  {
    key: 'follow',
    name: 'Follow',
    iconSvg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
    title: 'Follow Event',
    desc: 'Customize alert message, sound, and media when viewers follow.',
    defaultMsg: 'Thank you {name} for following!',
    hint: 'Use {name} (or {user}) to display the follower name.',
    msgKey: 'followMessage',
    soundKey: 'follow',
    defaultSound: '/assets/sounds/chime.wav',
    mediaKey: 'followMedia',
    mediaTypeKey: 'followMediaType',
    testType: 'follow',
    getTestPayload: () => ({ user: 'SparkleFan', nickname: 'SparkleFan', uniqueId: 'sparklefan', avatar: '/assets/avatar.png' })
  },
  {
    key: 'gift',
    name: 'Gift 1+ Coins',
    iconSvg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.65-.5-.65C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76V14h2V8.76L15.38 12 17 10.83 14.92 8H20v6z"/></svg>`,
    title: 'Standard Gift Event',
    desc: 'Customize alert message, sound, and media for standard gifts (1 to 999 coins).',
    defaultMsg: '{name} sent {gift} x{count}!',
    hint: 'Use {name} (or {user}) for viewer name, {gift} for gift name, and {count} for count.',
    msgKey: 'giftMessage',
    soundKey: 'gift',
    defaultSound: '/assets/sounds/coin.wav',
    mediaKey: 'giftMedia',
    mediaTypeKey: 'giftMediaType',
    testType: 'gift',
    getTestPayload: () => ({ user: 'Supporter', nickname: 'Supporter', giftId: 'rose', giftName: 'Rose', count: 1, coins: 1, avatar: '/assets/avatar.png' })
  },
  {
    key: 'gift_big',
    name: 'Big Gift (1,000+ Coins)',
    iconSvg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`,
    title: 'Big Gift Event',
    desc: 'Customize alert message, sound, and media for high-tier gifts (1,000+ coins).',
    defaultMsg: 'LEGENDARY: {name} sent {gift} x{count}!',
    hint: 'Use {name} (or {user}) for viewer name, {gift} for gift name, and {count} for count.',
    msgKey: 'giftBigMessage',
    soundKey: 'gift_big',
    defaultSound: '/assets/sounds/fanfare.wav',
    mediaKey: 'giftBigMedia',
    mediaTypeKey: 'giftBigMediaType',
    testType: 'gift',
    getTestPayload: () => ({ user: 'WhaleSupporter', nickname: 'Whale Supporter', giftId: 'galaxy', giftName: 'Galaxy', count: 1, coins: 1000, giftPictureUrl: '/assets/gifts/galaxy.png', avatar: '/assets/avatar.png' })
  },
  {
    key: 'like',
    name: 'Likes Milestone',
    iconSvg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>`,
    title: 'Likes Milestone Event',
    desc: 'Customize alert message, threshold, and sound when viewers tap likes.',
    defaultMsg: '{name} tapped {count} likes!',
    hint: 'Use {name} (or {user}) for viewer name and {count} for total tapped likes.',
    msgKey: 'likeMessage',
    soundKey: 'like',
    defaultSound: '/assets/sounds/pop.wav',
    mediaKey: null,
    mediaTypeKey: null,
    testType: 'like',
    getTestPayload: () => ({ user: 'Tapper', nickname: 'Tapper', count: appSettings.triggers?.likeThreshold || 50, avatar: '/assets/avatar.png' })
  },
  {
    key: 'share',
    name: 'Share',
    iconSvg: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>`,
    title: 'Share Event',
    desc: 'Customize alert message, sound, and media when viewers share the stream.',
    defaultMsg: 'Thank you {name} for sharing the stream!',
    hint: 'Use {name} (or {user}) to display the sharer name.',
    msgKey: 'shareMessage',
    soundKey: 'share',
    defaultSound: '/assets/sounds/chime.wav',
    mediaKey: 'shareMedia',
    mediaTypeKey: 'shareMediaType',
    testType: 'share',
    getTestPayload: () => ({ user: 'ShareFriend', nickname: 'Share Friend', avatar: '/assets/avatar.png' })
  }
];

let currentEventModalKey = 'follow';

function renderEventsTable() {
  const tbody = $('events-table-body');
  if (!tbody) return;

  if (!appSettings.triggers) appSettings.triggers = {};
  if (!appSettings.triggers.events) {
    appSettings.triggers.events = {
      follow: { active: true },
      gift: { active: true },
      gift_big: { active: true },
      like: { active: true },
      share: { active: true }
    };
  }

  tbody.innerHTML = '';
  let activeCount = 0;

  EVENT_DEFINITIONS.forEach(def => {
    const isAct = appSettings.triggers.events[def.key]?.active !== false;
    if (isAct) activeCount++;

    const tr = document.createElement('tr');
    tr.className = 'event-table-row';

    const msg = appSettings.triggers[def.msgKey] || def.defaultMsg;
    const soundUrl = appSettings.triggers.sounds?.[def.soundKey] || def.defaultSound;
    const soundBaseName = soundUrl === 'none'
      ? 'No Sound'
      : (soundUrl.split('/').pop().replace(/\.[^/.]+$/, '').replace(/_/g, ' ') || 'Sound');
    const mediaUrl = def.mediaKey ? (appSettings.triggers[def.mediaKey] || '') : '';
    const mediaName = mediaUrl ? mediaUrl.split('/').pop() : '';

    const msgPreview = msg.length > 24 ? msg.slice(0, 22) + '...' : msg;

    tr.innerHTML = `
      <td class="events-actions-cell">
        <button class="btn-icon-table btn-edit-event" data-key="${def.key}" title="Edit ${def.name}">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button class="btn-icon-table btn-test-action btn-test-event" data-key="${def.key}" title="Test ${def.name} Alert">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </td>
      <td class="event-active-cell">
        <input type="checkbox" class="event-active-chk" data-key="${def.key}" ${isAct ? 'checked' : ''} title="Toggle ${def.name} active">
      </td>
      <td>
        <span class="event-scope-badge">Any</span>
      </td>
      <td>
        <div class="event-trigger-cell">
          <span class="event-trigger-icon">${def.iconSvg}</span>
          <span>${def.name}</span>
        </div>
      </td>
      <td>
        <div class="event-actions-summary">
          <span class="event-action-badge" title="${escapeNotifHtml(msg)}">${escapeNotifHtml(msgPreview)}</span>
          <span class="event-action-badge sound-badge">${escapeNotifHtml(soundBaseName)}</span>
          ${mediaUrl ? `<span class="event-action-badge media-badge" title="${escapeNotifHtml(mediaName)}">Media Attached</span>` : ''}
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  const countBadge = $('events-active-count-badge');
  if (countBadge) countBadge.textContent = `${activeCount} Active Event${activeCount === 1 ? '' : 's'}`;

  // Attach row event listeners
  tbody.querySelectorAll('.btn-edit-event').forEach(btn => {
    btn.addEventListener('click', () => openEventEditorModal(btn.dataset.key));
  });
  tbody.querySelectorAll('.btn-test-event').forEach(btn => {
    btn.addEventListener('click', () => testEventAlert(btn.dataset.key));
  });
  tbody.querySelectorAll('.event-active-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const k = chk.dataset.key;
      if (!appSettings.triggers) appSettings.triggers = {};
      if (!appSettings.triggers.events) appSettings.triggers.events = {};
      if (!appSettings.triggers.events[k]) appSettings.triggers.events[k] = {};
      appSettings.triggers.events[k].active = chk.checked;
      saveCurrentSettings();
      renderEventsTable();
      showToast(`${chk.checked ? 'Enabled' : 'Disabled'} ${k} alerts.`, 'info', 'Event Status');
    });
  });
}

function testEventAlert(key) {
  const def = EVENT_DEFINITIONS.find(d => d.key === key);
  if (!def) return;
  const payload = def.getTestPayload();
  window.api.simulateEvent(def.testType, payload);
  showToast(`Simulated ${def.name} alert!`, 'info', 'Test Event');
}

function openEventEditorModal(key) {
  const def = EVENT_DEFINITIONS.find(d => d.key === key);
  if (!def) return;
  currentEventModalKey = key;

  const modal = $('modal-event-editor');
  if (!modal) return;

  $('event-modal-title').textContent = def.title;
  $('event-modal-desc').textContent = def.desc;
  $('event-modal-icon-wrap').innerHTML = def.iconSvg;

  const currentMsg = appSettings.triggers?.[def.msgKey] || def.defaultMsg;
  $('event-modal-msg').value = currentMsg;
  $('event-modal-hint').textContent = def.hint;

  // Sound dropdown
  const currentSound = appSettings.triggers?.sounds?.[def.soundKey] || def.defaultSound;
  populateEventModalSoundSelect(currentSound);

  // Media box
  const mediaBox = $('event-modal-media-box');
  if (def.mediaKey) {
    if (mediaBox) mediaBox.style.display = 'block';
    renderEventModalMediaUI(def);
  } else {
    if (mediaBox) mediaBox.style.display = 'none';
  }

  // Extra likes row
  const likesRow = $('event-modal-likes-row');
  if (def.key === 'like') {
    if (likesRow) {
      likesRow.classList.remove('hidden');
      $('event-modal-likes-input').value = appSettings.triggers?.likeThreshold || 50;
    }
  } else {
    if (likesRow) likesRow.classList.add('hidden');
  }

  modal.classList.add('active');
}

function populateEventModalSoundSelect(selectedUrl) {
  const sel = $('event-modal-sound');
  if (!sel) return;

  const defaultPresets = [
    { filename: 'chime.wav', name: 'Chime (Default)', url: '/assets/sounds/chime.wav' },
    { filename: 'coin.wav', name: 'Coin (Default)', url: '/assets/sounds/coin.wav' },
    { filename: 'fanfare.wav', name: 'Fanfare (Default)', url: '/assets/sounds/fanfare.wav' },
    { filename: 'pop.wav', name: 'Pop (Default)', url: '/assets/sounds/pop.wav' },
    { filename: 'level_up.wav', name: 'Level Up', url: '/assets/sounds/level_up.wav' },
    { filename: 'anime_wow.mp3', name: 'Anime Wow', url: '/assets/sounds/anime_wow.mp3' }
  ];

  const merged = [...defaultPresets];
  if (Array.isArray(cachedSoundList)) {
    for (const s of cachedSoundList) {
      if (!merged.some(m => m.url === s.url || m.filename === s.filename)) {
        merged.push(s);
      }
    }
  }

  sel.innerHTML = '';
  merged.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.url;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });

  const muteOpt = document.createElement('option');
  muteOpt.value = 'none';
  muteOpt.textContent = 'No Sound (Mute)';
  sel.appendChild(muteOpt);

  if (Array.from(sel.options).some(o => o.value === selectedUrl)) {
    sel.value = selectedUrl;
  } else if (selectedUrl) {
    const customOpt = document.createElement('option');
    customOpt.value = selectedUrl;
    customOpt.textContent = `Custom (${selectedUrl.split('/').pop()})`;
    sel.insertBefore(customOpt, muteOpt);
    sel.value = selectedUrl;
  } else {
    sel.value = defaultPresets[0].url;
  }
}

function renderEventModalMediaUI(def) {
  if (!def || !def.mediaKey) return;
  const mediaUrl = appSettings.triggers?.[def.mediaKey] || '';
  const mediaType = appSettings.triggers?.[def.mediaTypeKey] || '';

  const statusEl = $('event-modal-media-status');
  const previewEl = $('event-modal-media-preview');
  const clearBtn = $('event-modal-clear-media-btn');

  if (!statusEl || !previewEl) return;

  if (!mediaUrl) {
    statusEl.textContent = 'None (Default Avatar)';
    previewEl.classList.add('hidden');
    previewEl.innerHTML = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    return;
  }

  const fileName = mediaUrl.split('/').pop() || 'Custom Media';
  const resolvedType = mediaType || (/\.(mp4|webm|mov)$/i.test(mediaUrl) ? 'video' : 'image');
  statusEl.textContent = `${resolvedType === 'video' ? 'Video' : 'Image/GIF'}: ${fileName}`;
  previewEl.classList.remove('hidden');
  if (clearBtn) clearBtn.classList.remove('hidden');

  if (resolvedType === 'video') {
    previewEl.innerHTML = `<video src="http://localhost:3333${mediaUrl}" autoplay muted loop playsinline></video>`;
  } else {
    previewEl.innerHTML = `<img src="http://localhost:3333${mediaUrl}" alt="Alert Media Preview">`;
  }
}

function closeEventEditorModal() {
  const modal = $('modal-event-editor');
  if (modal) modal.classList.remove('active');
}

function saveEventEditorModal() {
  const def = EVENT_DEFINITIONS.find(d => d.key === currentEventModalKey);
  if (!def) return;

  if (!appSettings.triggers) appSettings.triggers = {};
  if (!appSettings.triggers.sounds) appSettings.triggers.sounds = {};

  const newMsg = $('event-modal-msg')?.value?.trim() || def.defaultMsg;
  appSettings.triggers[def.msgKey] = newMsg;

  const newSound = $('event-modal-sound')?.value || def.defaultSound;
  appSettings.triggers.sounds[def.soundKey] = newSound;

  if (def.key === 'like') {
    const thresh = +$('event-modal-likes-input')?.value || 50;
    appSettings.triggers.likeThreshold = thresh;
    if ($('trig-likes-thresh')) $('trig-likes-thresh').value = thresh;
  }

  saveCurrentSettings();
  renderEventsTable();
  closeEventEditorModal();
  showToast(`${def.name} settings saved!`, 'success', 'Event Saved');
}

// Dynamic Demo Ranking Leaderboard State & Renderers
const demoLikersData = [
  { name: 'SakuraChan', likes: 4200, avatar: '../assets/avatar.png' },
  { name: 'MochiVibes', likes: 2800, avatar: '../assets/avatar.png' },
  { name: 'KawaiiFox', likes: 1500, avatar: '../assets/avatar.png' },
  { name: 'StarryNeko', likes: 950, avatar: '../assets/avatar.png' }
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
    el.innerHTML = '<div class="demo-rank-row" style="justify-content:center;opacity:0.6;"><span>No likers yet</span></div>';
    return;
  }
  const medals = ['gold', 'silver', 'bronze'];
  el.innerHTML = rows.map((item, idx) => {
    const medalClass = medals[idx] ? ` ${medals[idx]}` : '';
    return `<div class="demo-rank-row"><span class="r-num${medalClass}">#${idx + 1}</span><img src="${item.avatar || '../assets/avatar.png'}" alt=""><span class="r-name">${item.name}</span><span class="r-val">${formatLikesVal(item.likes)}</span></div>`;
  }).join('');
}

const demoStayData = [
  { name: 'LunarNeko', timeSec: 2538, isPresent: true, avatar: '../assets/avatar.png' },
  { name: 'StarryCloud', timeSec: 1865, isPresent: true, avatar: '../assets/avatar.png' },
  { name: 'PuddingPop', timeSec: 1184, isPresent: true, avatar: '../assets/avatar.png' },
  { name: 'ChocoBunny', timeSec: 642, isPresent: true, avatar: '../assets/avatar.png' }
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
    el.innerHTML = '<div class="demo-rank-row" style="justify-content:center;opacity:0.6;"><span>No active viewers</span></div>';
    return;
  }
  const medals = ['gold', 'silver', 'bronze'];
  el.innerHTML = rows.map((item, idx) => {
    const medalClass = medals[idx] ? ` ${medals[idx]}` : '';
    const statusText = item.isPresent ? '' : ' (Away)';
    return `<div class="demo-rank-row"><span class="r-num${medalClass}">#${idx + 1}</span><img src="${item.avatar || '../assets/avatar.png'}" alt=""><span class="r-name">${item.name}${statusText}</span><span class="r-val mono">${formatStayTime(item.timeSec)}</span></div>`;
  }).join('');
}

// Load & populate settings
async function initSettings() {
  appSettings = await window.api.getSettings();
  currentSettings = appSettings;
  if (typeof window !== 'undefined') {
    window.appSettings = appSettings;
    window.currentSettings = appSettings;
  }
  try {
    const savedTheme = localStorage.getItem('shing_theme');
    if (savedTheme && savedTheme !== appSettings.theme) {
      appSettings.theme = savedTheme;
      window.api.saveSettings(appSettings);
    }
  } catch (e) {}
  applyTheme(appSettings.theme);
  updateUniversalVolumeUI();

  // Initial Modal status
  if (!appSettings.confirmed) {
    showAccountModal();
    updateConnectionUI({ status: 'disconnected', username: appSettings.username || 'shimmy_ming' });
  } else {
    $('modal-account').classList.remove('active');
    $('header-username').textContent = `@${appSettings.username}`;
    window.api.connectTikTok(appSettings.username, { manual: false });
  }

  // Populate Rankings & Headpat
  if (!appSettings.rankings) appSettings.rankings = {};
  if ($('ranking-toplikers-count')) {
    $('ranking-toplikers-count').value = String(appSettings.rankings?.topLikersCount || 3);
  }
  const likersTheme = appSettings.rankings?.topLikersTheme || 'Purple';
  const likersScale = typeof appSettings.rankings?.topLikersScale === 'number' ? appSettings.rankings.topLikersScale : 1.0;
  if ($('ranking-toplikers-theme')) {
    $('ranking-toplikers-theme').value = likersTheme;
  }
  if ($('ranking-toplikers-scale')) {
    $('ranking-toplikers-scale').value = String(likersScale);
  }
  if ($('ranking-toplikers-scale-badge')) {
    $('ranking-toplikers-scale-badge').textContent = `${Math.round(likersScale * 100)}%`;
  }
  if ($('ov-demo-toplikers-card')) {
    $('ov-demo-toplikers-card').dataset.theme = likersTheme;
    $('ov-demo-toplikers-card').style.setProperty('--demo-scale', likersScale);
  }
  renderDemoTopLikersRows();

  if ($('ranking-viewers-count')) {
    $('ranking-viewers-count').value = String(appSettings.rankings?.viewerRankingCount || 3);
  }
  const viewersTheme = appSettings.rankings?.viewerRankingTheme || 'Purple';
  const viewersScale = typeof appSettings.rankings?.viewerRankingScale === 'number' ? appSettings.rankings.viewerRankingScale : 1.0;
  if ($('ranking-viewers-theme')) {
    $('ranking-viewers-theme').value = viewersTheme;
  }
  if ($('ranking-viewers-scale')) {
    $('ranking-viewers-scale').value = String(viewersScale);
  }
  if ($('ranking-viewers-scale-badge')) {
    $('ranking-viewers-scale-badge').textContent = `${Math.round(viewersScale * 100)}%`;
  }
  if ($('ov-demo-viewerranking-card')) {
    $('ov-demo-viewerranking-card').dataset.theme = viewersTheme;
    $('ov-demo-viewerranking-card').style.setProperty('--demo-scale', viewersScale);
  }
  renderDemoStayRows();
  if ($('headpat-on-follow')) {
    $('headpat-on-follow').checked = appSettings.headpat?.triggerOnFollow !== false;
  }
  if ($('headpat-on-gift')) {
    $('headpat-on-gift').checked = appSettings.headpat?.triggerOnGift !== false;
  }
  if ($('headpat-on-command')) {
    $('headpat-on-command').checked = appSettings.headpat?.triggerOnCommand !== false;
  }

  // Populate Triggers & Events Table
  if (appSettings.triggers) {
    if ($('trig-duration')) $('trig-duration').value = appSettings.triggers.alertDuration || 5;
    if ($('trig-likes-thresh')) $('trig-likes-thresh').value = appSettings.triggers.likeThreshold || 50;

    if ($('trig-sound-enabled')) {
      $('trig-sound-enabled').checked = appSettings.triggers.soundEnabled !== false;
    }
    if ($('trig-volume')) {
      const vol = typeof appSettings.triggers.soundVolume === 'number' ? appSettings.triggers.soundVolume : 0.85;
      $('trig-volume').value = vol;
      if ($('trig-volume-val')) $('trig-volume-val').textContent = `${Math.round(vol * 100)}%`;
    }
  }
  renderEventsTable();

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
    if ($('chat-theme')) $('chat-theme').value = appSettings.chat.theme || 'pastel-purple';
    if ($('chat-font-family')) $('chat-font-family').value = appSettings.chat.fontFamily || 'quicksand';
    $('chat-font-size').value = appSettings.chat.fontSize || 14;
    $('chat-font-val').textContent = `${$('chat-font-size').value}px`;
    $('chat-radius').value = appSettings.chat.bubbleRadius || 16;
    $('chat-radius-val').textContent = `${$('chat-radius').value}px`;
    $('chat-autofade').value = appSettings.chat.autoFadeSec ?? 15;
    if ($('chat-max-messages')) $('chat-max-messages').value = appSettings.chat.maxMessages || 8;
    $('chat-badges').checked = appSettings.chat.showBadges !== false;
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
    $('jar-max').value = appSettings.jar.maxGifts || 500;
    if (appSettings.jar.transform) {
      jarTransform = Object.assign({}, appSettings.jar.transform);
    }
  }
  updateJarTransformUI(jarTransform.x, jarTransform.y, jarTransform.scale);

  // Populate Companion
  if (appSettings.companion) {
    $('comp-hairstyle').value = appSettings.companion.hair || 'twintails';
    $('comp-hair-color').value = appSettings.companion.hc || '#7b3fe4';
    $('comp-outfit-color').value = appSettings.companion.oc || '#9b5cf0';
    if ($('comp-bubble-font')) {
      $('comp-bubble-font').value = appSettings.companion.bubbleFont || 'Nunito';
    }
    const bSize = appSettings.companion.bubbleFontSize || 18;
    if ($('comp-bubble-size')) {
      $('comp-bubble-size').value = bSize;
    }
    if ($('comp-bubble-size-val')) {
      $('comp-bubble-size-val').textContent = `${bSize}px`;
    }
    syncPresetSelect('comp-hair-preset', $('comp-hair-color').value);
    syncPresetSelect('comp-outfit-preset', $('comp-outfit-color').value);

    const cats = appSettings.companion.cats || ['purple', 'black'];
    document.querySelectorAll('#comp-cats input[type="checkbox"]').forEach(cb => {
      cb.checked = cats.includes(cb.value);
    });
  }

  // Populate Streamer Info Banner
  populateBannerSettings();

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

  // Populate Timer settings
  if (appSettings.timer) {
    const totalMinutes = Number(appSettings.timer.durationMin) || 30;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if ($('timer-hours')) $('timer-hours').value = h;
    if ($('timer-minutes')) $('timer-minutes').value = m;
    if ($('timer-seconds')) $('timer-seconds').value = 0;
    if ($('timer-deduct-comment')) $('timer-deduct-comment').value = appSettings.timer.reduceSecondsPerComment ?? 1;
    if ($('timer-deduct-like')) $('timer-deduct-like').value = appSettings.timer.reduceSecondsPerLike ?? 0.1;
    if ($('timer-bonus')) $('timer-bonus').value = appSettings.timer.addSecondsPerGift ?? 15;
    if ($('timer-theme')) $('timer-theme').value = appSettings.timer.theme || 'Purple';
    const scale = typeof appSettings.timer.scale === 'number' ? appSettings.timer.scale : 1.0;
    if ($('timer-scale-slider')) $('timer-scale-slider').value = scale;
    if ($('timer-scale-badge')) $('timer-scale-badge').textContent = `${Math.round(scale * 100)}%`;
  }
  if (window.api?.getTimerStatus) {
    window.api.getTimerStatus().then(snap => {
      if (snap) updateTimerUI(snap);
    });
  }

  renderIcons();
  renderFavorites();
  await refreshSoundDropdowns();
  await populateGiftCatalogSelect();
  initUpdater();
  if (typeof OverlayDemoManager !== 'undefined') {
    OverlayDemoManager.start();
  }
  const jarIfr = $('jar-preview-iframe');
  if (jarIfr) {
    const syncJarState = () => {
      const isJarActive = Boolean(document.querySelector('.tab-pane#tab-jar')?.classList.contains('active'));
      try {
        jarIfr.contentWindow?.postMessage({ type: 'jar:set-paused', paused: !isJarActive }, '*');
        jarIfr.contentWindow?.postMessage({
          type: 'jar:transform',
          x: jarTransform.x,
          y: jarTransform.y,
          scale: jarTransform.scale
        }, '*');
      } catch (e) {}
    };
    jarIfr.addEventListener('load', syncJarState);
    syncJarState();
  }
}

let currentPreviewAudio = null;
let fullGiftCatalog = [];

function playSoundPreview(url) {
  if (!url || url === 'none') return;
  if (appSettings.universalMuted) return;
  if (currentPreviewAudio) {
    try {
      currentPreviewAudio.pause();
      currentPreviewAudio.currentTime = 0;
    } catch (e) {}
    currentPreviewAudio = null;
  }
  try {
    const audio = new Audio(url);
    const vol = $('trig-volume') ? +$('trig-volume').value : 0.85;
    const masterVol = typeof appSettings.universalVolume === 'number' ? appSettings.universalVolume : 0.85;
    const baseVol = isNaN(vol) ? 0.85 : Math.max(0, Math.min(1, vol));
    audio.volume = Math.max(0, Math.min(1, baseVol * masterVol));
    currentPreviewAudio = audio;
    audio.play().catch(e => {
      console.warn('Preview play notice:', e.message);
    });
  } catch (err) {
    console.warn('Audio preview error:', err);
  }
}

async function refreshSoundDropdowns() {
  try {
    const sounds = await window.api.listSounds();
    cachedSoundList = Array.isArray(sounds) ? sounds : [];
  } catch (e) {
    cachedSoundList = [];
  }

  const defaultPresets = [
    { filename: 'chime.wav', name: 'Chime (Default)', url: '/assets/sounds/chime.wav' },
    { filename: 'coin.wav', name: 'Coin (Default)', url: '/assets/sounds/coin.wav' },
    { filename: 'fanfare.wav', name: 'Fanfare (Default)', url: '/assets/sounds/fanfare.wav' },
    { filename: 'pop.wav', name: 'Pop (Default)', url: '/assets/sounds/pop.wav' },
    { filename: 'level_up.wav', name: 'Level Up', url: '/assets/sounds/level_up.wav' },
    { filename: 'anime_wow.mp3', name: 'Anime Wow', url: '/assets/sounds/anime_wow.mp3' }
  ];

  const mergedSounds = [...defaultPresets];
  for (const s of cachedSoundList) {
    if (!mergedSounds.some(m => m.url === s.url || m.filename === s.filename)) {
      mergedSounds.push(s);
    }
  }

  const dropdownTargets = [
    { id: 'trig-sound-follow', def: '/assets/sounds/chime.wav', key: 'follow' },
    { id: 'trig-sound-gift', def: '/assets/sounds/coin.wav', key: 'gift' },
    { id: 'trig-sound-gift-big', def: '/assets/sounds/fanfare.wav', key: 'gift_big' },
    { id: 'trig-sound-like', def: '/assets/sounds/pop.wav', key: 'like' }
  ];

  dropdownTargets.forEach(target => {
    const sel = $(target.id);
    if (!sel) return;

    const currentVal = (appSettings.triggers && appSettings.triggers.sounds && appSettings.triggers.sounds[target.key])
      ? appSettings.triggers.sounds[target.key]
      : (sel.value || target.def);

    sel.innerHTML = '';
    mergedSounds.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.url;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });

    const muteOpt = document.createElement('option');
    muteOpt.value = 'none';
    muteOpt.textContent = 'No Sound (Mute)';
    sel.appendChild(muteOpt);

    if (Array.from(sel.options).some(o => o.value === currentVal)) {
      sel.value = currentVal;
    } else if (currentVal) {
      const customOpt = document.createElement('option');
      customOpt.value = currentVal;
      customOpt.textContent = `Custom (${currentVal.split('/').pop()})`;
      sel.insertBefore(customOpt, muteOpt);
      sel.value = currentVal;
    } else {
      sel.value = target.def;
    }
  });

  const eventModalSel = $('event-modal-sound');
  if (eventModalSel) {
    populateEventModalSoundSelect(eventModalSel.value);
  }
}

async function populateGiftCatalogSelect() {
  try {
    const res = await fetch('http://localhost:3333/api/gifts');
    if (res.ok) {
      fullGiftCatalog = await res.json();
    }
  } catch (e) {
    fullGiftCatalog = [];
  }

  const sel = $('select-any-gift');
  if (!sel || !Array.isArray(fullGiftCatalog) || fullGiftCatalog.length === 0) return;

  const existingValues = new Set(Array.from(sel.options).map(o => o.value));
  const sorted = [...fullGiftCatalog].sort((a, b) => (b.diamonds || b.coins || 0) - (a.diamonds || a.coins || 0));

  const frag = document.createDocumentFragment();
  sorted.forEach(g => {
    const safeKey = (g.name || String(g.id)).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!existingValues.has(safeKey) && !existingValues.has(String(g.id))) {
      const opt = document.createElement('option');
      opt.value = safeKey;
      if (g.id !== undefined && g.id !== null) opt.setAttribute('data-id', String(g.id));
      opt.setAttribute('data-name', g.name || safeKey);
      const coins = g.diamonds || g.coins || 1;
      opt.setAttribute('data-coins', coins);
      if (g.image) opt.setAttribute('data-img', g.image);
      opt.textContent = `${g.name} (${coins.toLocaleString()} coins)`;
      frag.appendChild(opt);
      existingValues.add(safeKey);
    }
  });
  sel.appendChild(frag);
}

async function handleSoundSearch(query) {
  const q = (query || '').trim();
  if (!q) return;

  const statusEl = $('sound-search-status');
  const resultsEl = $('sound-search-results');
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.textContent = `Searching MyInstants for "${q}"...`;
  }
  if (resultsEl) {
    resultsEl.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 13px;">Searching online sound buttons...</div>';
  }

  try {
    const results = await window.api.searchSounds(q);
    if (!Array.isArray(results) || results.length === 0) {
      if (statusEl) statusEl.textContent = `No sounds found on MyInstants for "${q}". Try another search term.`;
      if (resultsEl) {
        resultsEl.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted); font-size: 13px;">No sounds found matching that keyword. Try searching anime, chime, level up, coin, fanfare, or applause.</div>';
      }
      return;
    }

    if (statusEl) statusEl.textContent = `Found ${results.length} sound results from MyInstants:`;
    if (resultsEl) {
      resultsEl.innerHTML = '';
      results.forEach(item => {
        const row = document.createElement('div');
        row.className = 'sound-result-item';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'sound-result-title';
        titleDiv.textContent = item.title;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'sound-result-actions';

        const previewBtn = document.createElement('button');
        previewBtn.className = 'sound-preview-btn';
        previewBtn.type = 'button';
        previewBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          <span>Preview</span>
        `;
        previewBtn.addEventListener('click', () => {
          playSoundPreview(item.soundUrl);
        });

        const useBtn = document.createElement('button');
        useBtn.className = 'btn btn-primary btn-small';
        useBtn.type = 'button';
        useBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
          <span>Use Sound</span>
        `;
        useBtn.addEventListener('click', async () => {
          useBtn.disabled = true;
          useBtn.textContent = 'Downloading...';
          try {
            const downloaded = await window.api.downloadSound(item.soundUrl, item.title);
            await refreshSoundDropdowns();

            const targetSelectId = $('modal-target-sound-select') ? $('modal-target-sound-select').value : 'trig-sound-gift';
            if (targetSelectId && targetSelectId !== 'library_only') {
              const targetSelect = $(targetSelectId);
              if (targetSelect) {
                targetSelect.value = downloaded.url;
              }
              const keyMap = {
                'trig-sound-follow': 'follow',
                'trig-sound-gift': 'gift',
                'trig-sound-gift-big': 'gift_big',
                'trig-sound-like': 'like',
                'trig-sound-share': 'share',
                'event-modal-sound': currentEventModalKey
              };
              const key = keyMap[targetSelectId];
              if (key) {
                if (!appSettings.triggers) appSettings.triggers = {};
                if (!appSettings.triggers.sounds) appSettings.triggers.sounds = {};
                appSettings.triggers.sounds[key] = downloaded.url;
                saveCurrentSettings();
              }
              if (targetSelectId === 'event-modal-sound') {
                populateEventModalSoundSelect(downloaded.url);
              }
            }
            useBtn.textContent = 'Assigned!';
            useBtn.classList.remove('btn-primary');
            useBtn.classList.add('btn-secondary');
            setTimeout(() => {
              useBtn.disabled = false;
              useBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                <span>Use Sound</span>
              `;
              useBtn.classList.remove('btn-secondary');
              useBtn.classList.add('btn-primary');
            }, 2500);
          } catch (err) {
            showToast(`Download error: ${err.message}`, 'error', 'Sound Download');
            useBtn.disabled = false;
            useBtn.textContent = 'Retry';
          }
        });

        actionsDiv.appendChild(previewBtn);
        actionsDiv.appendChild(useBtn);
        row.appendChild(titleDiv);
        row.appendChild(actionsDiv);
        resultsEl.appendChild(row);
      });
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = `Search error: ${err.message}`;
  }
}

async function handleImportLocalSound(targetSelectId) {
  try {
    const res = await window.api.selectLocalSound();
    if (!res || res.canceled) return;
    if (res.success && res.url) {
      await refreshSoundDropdowns();
      const targetId = targetSelectId || ($('modal-target-sound-select') ? $('modal-target-sound-select').value : 'trig-sound-gift');
      if (targetId && targetId !== 'library_only') {
        const targetSelect = $(targetId);
        if (targetSelect) targetSelect.value = res.url;
        const keyMap = {
          'trig-sound-follow': 'follow',
          'trig-sound-gift': 'gift',
          'trig-sound-gift-big': 'gift_big',
          'trig-sound-like': 'like',
          'trig-sound-share': 'share',
          'event-modal-sound': currentEventModalKey
        };
        const key = keyMap[targetId];
        if (key) {
          if (!appSettings.triggers) appSettings.triggers = {};
          if (!appSettings.triggers.sounds) appSettings.triggers.sounds = {};
          appSettings.triggers.sounds[key] = res.url;
          saveCurrentSettings();
        }
        if (targetId === 'event-modal-sound') {
          populateEventModalSoundSelect(res.url);
        }
      }
      playSoundPreview(res.url);
      showToast(`Sound "${res.name}" imported and assigned!`, 'success', 'Audio Library');
    }
  } catch (err) {
    showToast(`Import error: ${err.message}`, 'error', 'Audio Import');
  }
}

function syncPresetSelect(selectId, hex) {
  const sel = $(selectId);
  const match = Array.from(sel.options).some(o => o.value.toLowerCase() === hex.toLowerCase());
  sel.value = match ? hex.toLowerCase() : 'custom';
}

function clampBannerScale(val) {
  if (val === null || val === undefined || val === '') return 1.0;
  const num = parseFloat(val);
  if (!Number.isFinite(num)) return 1.0;
  return Math.max(0.5, Math.min(1.5, num));
}

let saveSettingsDebounceTimer = null;
function saveSettingsDebounced(delay = 250) {
  if (saveSettingsDebounceTimer) {
    clearTimeout(saveSettingsDebounceTimer);
  }
  if (delay === 0) {
    saveCurrentSettings();
    saveSettingsDebounceTimer = null;
    return;
  }
  saveSettingsDebounceTimer = setTimeout(() => {
    saveCurrentSettings();
    saveSettingsDebounceTimer = null;
  }, delay);
}

function saveCurrentSettings() {
  const target = (typeof window !== 'undefined' && window.appSettings) || appSettings;
  try {
    if (target.theme) {
      localStorage.setItem('shing_theme', target.theme);
    }
  } catch (e) {}
  if (target) {
    if (!target.jar) target.jar = {};
    if (!target.jar.transform) {
      target.jar.transform = Object.assign({}, jarTransform);
    }
    if (target.banner && target.banner.scale !== undefined) {
      target.banner.scale = clampBannerScale(target.banner.scale);
    }
  }
  if (typeof window !== 'undefined' && window.api && typeof window.api.saveSettings === 'function') {
    window.api.saveSettings(target);
  }
  if (typeof OverlayDemoManager !== 'undefined') {
    OverlayDemoManager.sync();
  }
}

function populateBannerSettings(customSettings = null) {
  const src = customSettings
    || (typeof window !== 'undefined' && window.currentSettings)
    || (typeof window !== 'undefined' && window.appSettings)
    || currentSettings
    || appSettings;
  const banner = src ? src.banner : null;
  if (!banner) return;
  if ($('banner-enable-toggle')) {
    $('banner-enable-toggle').checked = banner.enabled !== false;
  }
  const bScale = clampBannerScale(banner.scale);
  if ($('banner-scale-slider')) {
    $('banner-scale-slider').value = String(bScale);
  }
  if ($('banner-scale-badge')) {
    $('banner-scale-badge').textContent = `${Math.round(bScale * 100)}%`;
    $('banner-scale-badge').style.setProperty('--banner-scale', bScale);
  }
  if ($('banner-topper-select')) {
    $('banner-topper-select').value = banner.topper || 'bear';
  }
  if ($('banner-anim-select')) {
    $('banner-anim-select').value = banner.animation || 'float';
  }
  if ($('banner-template-select')) {
    $('banner-template-select').value = banner.template || 'pastel-dream';
  }
  const tpl = banner.template || 'pastel-dream';
  document.querySelectorAll('#banner-template-cards .template-card').forEach(card => {
    card.classList.toggle('active', card.dataset.template === tpl);
  });
  if ($('banner-aspect-select')) {
    $('banner-aspect-select').value = banner.aspectRatio || '3:1';
  }
  if ($('banner-show-avatar-toggle')) {
    $('banner-show-avatar-toggle').checked = banner.showAvatar !== false;
  }
  if ($('banner-autocycle-toggle')) {
    $('banner-autocycle-toggle').checked = banner.autoCycle !== false;
  }
  const bDur = Math.max(2, Math.min(15, Number(banner.sceneDuration) || 5));
  if ($('banner-duration-slider')) {
    $('banner-duration-slider').value = String(bDur);
  }
  if ($('banner-duration-badge')) {
    $('banner-duration-badge').textContent = `${bDur}s`;
  }
  if ($('banner-transition-select')) {
    $('banner-transition-select').value = banner.transitionStyle || 'slide';
  }
  if ($('banner-particles-select')) {
    $('banner-particles-select').value = banner.particles || 'sparkles';
  }
  if ($('banner-shine-toggle')) {
    $('banner-shine-toggle').checked = banner.shineEffect !== false;
  }
  if ($('banner-name-input')) {
    $('banner-name-input').value = banner.name || '';
  }
  if ($('banner-subtitle-input')) {
    $('banner-subtitle-input').value = banner.subtitle || '';
  }
  if ($('banner-bio-input')) {
    $('banner-bio-input').value = banner.bio || '';
  }
  if ($('banner-schedule-input')) {
    $('banner-schedule-input').value = banner.schedule || '';
  }
  if ($('banner-status-input')) {
    $('banner-status-input').value = banner.statusBadge || '';
  }
  const socials = banner.socials || {};
  if ($('banner-twitch-input')) $('banner-twitch-input').value = socials.twitch || '';
  if ($('banner-tiktok-input')) $('banner-tiktok-input').value = socials.tiktok || '';
  if ($('banner-discord-input')) $('banner-discord-input').value = socials.discord || '';
  if ($('banner-twitter-input')) $('banner-twitter-input').value = socials.twitter || '';
  if ($('banner-instagram-input')) $('banner-instagram-input').value = socials.instagram || '';
  if ($('banner-youtube-input')) $('banner-youtube-input').value = socials.youtube || '';
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
  const imgEl = $('modal-avatar-img');
  if (imgEl) {
    imgEl.onerror = function() {
      this.onerror = null;
      this.src = '../assets/avatar.png';
    };
  }

  const profile = await window.api.searchTikTokUser(username);

  $('modal-display-name').textContent = profile.nickname || username;
  $('modal-unique-id').textContent = `@${profile.uniqueId || username}`;
  if (imgEl) {
    imgEl.src = profile.avatar || '../assets/avatar.png';
  }

  $('modal-step-search').style.display = 'none';
  $('modal-step-confirm').style.display = 'block';
}

// App Updater Manager Logic
const updateState = {
  currentVersion: '1.3.1',
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

  // Only auto-update when the software is opened (startup)
  const autoCheck = appSettings.updates?.autoCheck !== false;
  if (autoCheck) {
    setTimeout(() => {
      checkAppUpdates(false, true);
    }, 1200);
  }
}

async function checkAppUpdates(manual = true, autoInstallOnStartup = false) {
  if (updateState.isChecking) return;
  updateState.isChecking = true;

  const dot = $('status-indicator-dot');
  const txt = $('update-status-text');
  const btnTxt = $('btn-check-updates-text');
  const feedUrl = $('input-update-feed')?.value?.trim() || appSettings.updates?.feedUrl || null;

  if (dot) dot.className = 'status-indicator-dot checking';
  if (txt) txt.textContent = 'Checking...';
  if (btnTxt) btnTxt.textContent = 'Checking...';

  let shouldAutoInstall = false;

  try {
    const result = await window.api.checkForUpdates(feedUrl);
    updateState.hasUpdate = result.hasUpdate;
    updateState.currentVersion = result.currentVersion;
    updateState.latestVersion = result.latestVersion;
    updateState.release = result.release;
    updateState.allReleases = result.allReleases || [];

    // Ensure installed version and header version are always synchronized
    if ($('stat-installed-ver')) $('stat-installed-ver').textContent = `v${result.currentVersion}`;
    if ($('header-version-text')) $('header-version-text').textContent = `v${result.currentVersion}`;

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
      if ($('stat-latest-ver')) $('stat-latest-ver').textContent = `v${result.latestVersion} (New Update!)`;

      // Show banner
      const banner = $('update-banner');
      if (banner) {
        banner.classList.remove('hidden');
        if ($('update-banner-title')) $('update-banner-title').textContent = result.release?.releaseName || `New Update v${result.latestVersion} Available!`;
        if ($('update-badge-ver')) $('update-badge-ver').textContent = `v${result.latestVersion}`;
        if ($('update-banner-desc')) $('update-banner-desc').textContent = result.release?.summary || 'A new version of Shing Live is ready with improvements!';
      }

      if (!manual && autoInstallOnStartup === true && appSettings.updates?.autoCheck !== false) {
        shouldAutoInstall = true;
      }
    } else {
      if (dot) dot.className = 'status-indicator-dot';
      if (txt) txt.textContent = 'Up to Date';
      if ($('header-version-badge')) {
        $('header-version-badge').textContent = 'Up to Date';
        $('header-version-badge').className = 'ver-badge-tag';
      }
      if ($('stat-latest-ver')) $('stat-latest-ver').textContent = `v${result.latestVersion || result.currentVersion} (Latest)`;
      if ($('update-banner')) $('update-banner').classList.add('hidden');

      if (manual) {
        showToast(`Shing Live is up to date (v${result.currentVersion})!`, 'success', 'Software Update');
      }
    }
  } catch (err) {
    console.error('Update check error', err);
    if (dot) dot.className = 'status-indicator-dot';
    if (txt) txt.textContent = 'Check Failed';
    if (manual) showToast(`Could not check for updates: ${err.message}`, 'error', 'Software Update');
  } finally {
    updateState.isChecking = false;
    if (btnTxt) btnTxt.textContent = 'Check for Updates';
  }

  if (shouldAutoInstall) {
    downloadAndInstallUpdate(true);
  }
}

async function downloadAndInstallUpdate(isAutoStartup = false) {
  const autoStartup = isAutoStartup === true;
  if (updateState.isDownloading) return;
  updateState.isDownloading = true;
  const progContainer = $('update-progress-container');
  const progFill = $('progress-bar-fill');
  const progPercent = $('progress-percent-val');
  const progMsg = $('progress-status-msg');
  const installBtn = $('btn-install-update');

  if (progContainer) progContainer.classList.remove('hidden');
  if (installBtn) installBtn.disabled = true;

  if (autoStartup && updateState.latestVersion) {
    showToast(`Auto-updating Shing Live to v${updateState.latestVersion}...`, 'info', 'Auto Update');
    if ($('header-version-badge')) {
      $('header-version-badge').textContent = `Updating to v${updateState.latestVersion}...`;
      $('header-version-badge').className = 'ver-badge-tag has-update';
    }
  }

  const unsubscribe = window.api.onUpdateProgress(p => {
    if (progPercent) progPercent.textContent = `${p.percent}%`;
    if (progFill) progFill.style.width = `${p.percent}%`;
    if (progMsg) progMsg.textContent = p.msg;
  });

  try {
    await window.api.downloadUpdate(updateState);
    const res = await window.api.installUpdate(updateState);
    const installedVer = res?.newVersion || updateState.latestVersion || updateState.currentVersion;
    updateState.currentVersion = installedVer;
    updateState.hasUpdate = false;

    if ($('stat-installed-ver')) $('stat-installed-ver').textContent = `v${installedVer}`;
    if ($('header-version-text')) $('header-version-text').textContent = `v${installedVer}`;
    if ($('header-version-badge')) {
      $('header-version-badge').textContent = 'Up to Date';
      $('header-version-badge').className = 'ver-badge-tag';
    }
    if ($('stat-latest-ver')) $('stat-latest-ver').textContent = `v${installedVer} (Latest)`;
    if ($('update-banner')) $('update-banner').classList.add('hidden');
    if ($('status-indicator-dot')) $('status-indicator-dot').className = 'status-indicator-dot';
    if ($('update-status-text')) $('update-status-text').textContent = 'Up to Date';

    // Refresh embedded preview iframes so updated overlays take effect immediately even before restart
    const demoCompIfr = $('ov-demo-comp-iframe');
    if (demoCompIfr) demoCompIfr.src = `http://localhost:3333/overlays/companion?muted=1&t=${Date.now()}`;
    const compIfr = $('comp-preview-iframe');
    if (compIfr) compIfr.src = `http://localhost:3333/overlays/companion?t=${Date.now()}`;
    const jarIfr = $('jar-preview-iframe');
    if (jarIfr) jarIfr.src = `http://localhost:3333/overlays/jar?t=${Date.now()}`;

    // Show restart modal
    if ($('restart-dialog-msg')) {
      $('restart-dialog-msg').textContent = autoStartup
        ? `Shing Live automatically updated to v${installedVer} on startup. Please restart the app now to activate all new features.`
        : `Shing Live has been updated to v${installedVer}. Please restart the app now to activate all new features.`;
    }
    $('modal-restart').classList.add('active');
  } catch (e) {
    showCustomAlert(`Installation failed: ${e.message}`, 'Update Error', 'error');
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
    showCustomAlert(`Failed to apply local update package: ${e.message}`, 'Update Error', 'error');
  }
}

function openChangelogModal() {
  const container = $('changelog-list-container');
  if (!container) return;
  container.innerHTML = '';

  const list = updateState.allReleases.length > 0 ? updateState.allReleases : [
    {
      version: '1.4.9',
      releaseName: 'Shing Live v1.4.9 - /pet @username Live Chat Command',
      releaseDate: '2026-10-12',
      summary: 'Interactive /pet @username and /pet live chat command triggering the Pet-Pet Headpat animation on the mentioned user avatar or streamer with anti-spam cooldown and dashboard controls.',
      highlights: [
        'Interactive Chat Command: Viewers can type /pet @username in TikTok Live chat to headpat any viewer or moderator on stream with their actual profile picture',
        'Streamer Petting Fallback: Typing /pet by itself without mentioning a user automatically headpats the streamer',
        'Custom Patted-By Caption: Shows who initiated the pat with a clear "Patted by @sender! *pat pat*" caption above the animation',
        'Anti-Spam Cooldown: Integrated a 3-second cooldown buffer preventing chat flooding during high-activity live streams',
        'Dashboard Toggle & Simulation: Streamers can enable/disable /pet command triggering in the Pet-Pet card and test it with one click'
      ]
    },
    {
      version: '1.4.8',
      releaseName: 'Shing Live v1.4.8 - Companion Speech Bubble Font & Size Customization',
      releaseDate: '2026-10-12',
      summary: 'Customizable stream companion speech bubble font family with Nunito default and 6 curated streamer fonts, live font size slider (14px to 28px, default 18px), dynamic auto-fitting bubble layout, and real-time OBS / TikTok LIVE Studio sync.',
      highlights: [
        'Curated Streamer Fonts: Select between Nunito (Default Soft Rounded), Quicksand, Fredoka, Segoe UI, Retro Pixel (VT323), and Classic Monospace in the Companion tab',
        'Live Bubble Font Size Slider: Easily enlarge speech bubbles from 14px to 28px (defaulting to clean, readable 18px) with instant live indicator badge',
        'Dynamic Bubble Auto-Fit: Speech bubble padding and max-width automatically adapt to larger font sizes to prevent cramped or clipped text',
        'Zero-Latency Stream Sync: Live WebSocket updates sync changes to TikTok LIVE Studio and OBS browser sources with 0ms delay without refreshing browser sources',
        'Synchronized Dashboard Preview: Moving the slider or choosing a font updates the dashboard stage preview with an instant greeting demo'
      ]
    },
    {
      version: '1.4.4',
      releaseName: 'Shing Live v1.4.4 - Events Table UI, Event Editor Modal & Disable Join Alerts',
      releaseDate: '2026-10-12',
      summary: 'Redesigned Triggers tab into a TikFinity-style Events Table with per-event active toggles, dedicated Event Editor popup modal for custom messages, sounds, and media, full Share event alerts, and completely eliminated screen-spamming Join alerts.',
      highlights: [
        'TikFinity-Style Events Table: Clean overview of all core live events (Follow, Gift 1+ Coins, Big Gift 1,000+ Coins, Likes Milestone, Share) with direct Active toggles, action summary chips, and test buttons',
        'Dedicated Event Editor Modal: Click Edit on any event to customize alert message template with tag hints, alert sound with preview and search, and custom Video / Photo / GIF uploader',
        'Disable Join Popup Alerts: Completely removed popup alerts and audio on viewer joins, keeping the stream overlay clean and focused while preserving chat and rankings functionality',
        'Full Share Event Support: Added native Share event alert triggers with customizable message template, sound, and media support',
        'General Alert Settings Card: Clean bottom panel for universal Alert Display Duration, Likes Milestone Threshold, Master Volume slider, and Sound FX toggle'
      ]
    },
    {
      version: '1.4.3',
      releaseName: 'Shing Live v1.4.3 - Interactive Stream Timer & Live Reductions',
      releaseDate: '2026-10-12',
      summary: 'Full interactive stream countdown timer with synchronized real-time ticking across dashboard and OBS, custom starting duration (Hours/Minutes/Seconds with presets), TikTok live chat and like deductions, and quick live adjustment buttons.',
      highlights: [
        'Synchronized Live Countdown: Clicking Start counts down both the dashboard clock display and stream overlays in 100% lockstep via central server synchronization',
        'Custom Starting Duration: Streamers can easily set custom Hours, Minutes, and Seconds with instant display updates and quick preset pills (15m, 30m, 45m, 1h, 2h)',
        'Chat Comment Deductions: Configurable time reductions per chat comment (default -1s) with animated floating deduction tags on stream',
        'Like Fractional Reductions: Configurable time reductions per like (default -0.1s; 10 likes = -1s) using a precision fractional accumulator to prevent clock drift',
        'Live Adjust Controls: Added quick adjust buttons (-1 Min, +1 Min, +5 Min) and status indicator (Running, Paused, Finished) with zero-negative clamping at 00:00:00'
      ]
    },
    {
      version: '1.4.2',
      releaseName: 'Shing Live v1.4.2 - Authentic Pet-Pet Headpat Animation',
      releaseDate: '2026-10-12',
      summary: 'Upgraded Pet-Pet Headpat overlay and dashboard preview to the authentic petpetgif.com 5-frame animation with dynamic hand depth tracking and head squish math.',
      highlights: [
        'Authentic 5-Frame Loop: Integrated the canonical 5-frame petpet animation cycle running at authentic 60ms intervals matching petpetgif.com',
        'Dynamic Hand Depth: Hand position dynamically tracks avatar squish depth (handDy) so the hand presses down realistically with each pat',
        'Canonical Squish Matrix: Implemented authentic squish offsets and dimensions for mathematically exact meme fidelity',
        'Sprite Sheet Support: Upgraded asset rendering to use the official 560x112 sprite sheet with automatic graceful fallback',
        'Synchronized Dashboard Preview: Dashboard headpat demo preview now runs the exact same authentic 5-frame engine in real time'
      ]
    },
    {
      version: '1.4.1',
      releaseName: 'Shing Live v1.4.1 - Ranking Size Sliders, Plain Color Themes & Stay Timer Fix',
      releaseDate: '2026-10-12',
      summary: 'Added Size Sliders (50% to 150%) and 6 Plain Color Themes (Purple, Pink, Blue, Green, Dark, Light) for both Viewer Stay Ranking and Top Likers Ranking with real-time live Studio sync and fixed stay timer session continuity.',
      highlights: [
        'Ranking Size Sliders: Adjustable scale sliders (50% to 150% with live percentage badges) for both Viewer Stay Ranking and Top Likers Ranking with GPU-accelerated scaling in TikTok LIVE Studio and OBS',
        '6 Plain Color Themes: Dedicated theme selectors supporting Purple (Default), Pink, Blue, Green, Dark, and Light with custom palettes for background, borders, glows, badges, and high-contrast typography',
        'Real-Time Live Studio Sync: Instant WebSocket synchronization updates active browser source overlays in TikTok LIVE Studio and OBS with 0ms delay without needing browser source refreshes',
        'Dynamic Dashboard Previews: Desktop dashboard preview cards dynamically reflect selected color themes, scale factors, and mock testing events in real time',
        'Stay Timer Continuity Fix: Fixed timer reset bug where subsequent TikTok member events would wipe active session times; viewers now accumulate stay duration continuously until they leave'
      ]
    },
    {
      version: '1.4.0',
      releaseName: 'Shing Live v1.4.0 - 16:9 Landscape Draggable Gift Jar & Live Studio Sync',
      releaseDate: '2026-10-12',
      summary: 'Full 16:9 widescreen landscape Gift Jar overlay with real-time click-and-drag positioning preview, jar size slider (0.4x to 1.5x), instantaneous reset button, and zero-latency live synchronization to TikTok LIVE Studio and OBS.',
      highlights: [
        '16:9 Landscape Canvas: Upgraded Gift Jar overlay to native 16:9 widescreen coordinate space matching standard TikTok LIVE Studio and OBS stream resolutions (1920x1080 and 1440p)',
        'Interactive Drag-to-Position: Drag the jar anywhere on the 16:9 canvas directly inside the desktop dashboard with scale-aware boundary clamping so the jar never clips off-screen',
        'Jar Size Slider: Adjust the jar scale dynamically from 40% to 150% with live percentage readout badge and instant transform updates',
        'Live Studio Sync: Broadcasts drag and scale changes over low-latency WebSockets in real time, synchronizing TikTok LIVE Studio and OBS without needing browser source refreshes',
        'Quick Reset: Instant one-click reset button restoring the jar to its default bottom-center position (50% X, 82% Y) and 100% scale'
      ]
    },
    {
      version: '1.3.7',
      releaseName: 'Shing Live v1.3.7 - Glass Jar Layering & Stream-Stage Contrast',
      releaseDate: '2026-10-12',
      summary: 'Restored full glass body visibility on the Gift Jar overlay by removing desynchronized canvas alpha occlusions and added high-contrast stream-stage backdrops to the dashboard preview.',
      highlights: [
        'Full Glass Jar Visibility: Fixed hardware canvas desynchronization that occluded the lower jar body and cursive logo in Chromium / Electron',
        'Stream-Stage Preview Backdrop: Added dark dotted canvas backdrop with allowtransparency support to the dashboard preview for crystal-clear contrast',
        'Layered Glass Depth: Seamlessly preserved front bow and rim depth at the jar mouth while keeping 100% of falling and settled gifts visible inside the jar'
      ]
    },
    {
      version: '1.3.6',
      releaseName: 'Shing Live v1.3.6 - Zero Blank Gifts & Universal TikTok Icon Resolver',
      releaseDate: '2026-10-12',
      summary: 'Ensured 100% of all TikTok gifts display real icons without blank or missing graphics. Added CDN redirect following, preloading before jar drop, and server-side catalog auto-resolution for all gift routes.',
      highlights: [
        'Zero Blank Gift Graphics: Preloads gift icons before dropping into the jar so the authentic TikTok graphic is visible from frame 1 without flashing fallback circles',
        'Full CDN Redirect Support: Added HTTP 301/302/307/308 redirect resolution to /api/gift-icon with 500-item RAM caching for instant sub-millisecond loads',
        'Server-Side Catalog Asset Resolver: Auto-resolves /assets/gifts/* against the 676+ catalog and live room gifts with rose fallback so gift URLs never return 404',
        'Universal Image Schema Extractor: Extracts TikTok gift graphics across all v1, v2, and v3 protobuf and JSON structures and auto-registers new stream gifts into the catalog'
      ]
    },
    {
      version: '1.3.5',
      releaseName: 'Shing Live v1.3.5 - Low-End PC Gift Jar Performance & 100% Gift Visibility',
      releaseDate: '2026-10-12',
      summary: 'Eliminated Gift Jar lag on low-end PCs with sleeping/auto-freezing physics, offscreen sprite caching, streak delta deduplication, and full unobstructed visibility for all 676+ TikTok gifts.',
      highlights: [
        '100% Unobstructed Gift Visibility: Positioned the physics gift layer in front of the opaque jar body while keeping the top glass rim and bow in front of the mouth so no gifts are ever hidden',
        'All 676+ TikTok Gifts & Live Room Catalog: Fixed String vs Number giftId matching, merged live room gift pages, and fixed /api/gifts loading on file:// so every TikTok gift icon is visible',
        'Low-End PC Physics Optimization: Enabled Matter.js body sleeping, automatic freezing of settled gifts, 96x96 offscreen canvas sprite caching, and 0% CPU/GPU idle mode',
        'Combo Streak Deduplication & Coalescing: Fixed gift combo streaks to drop only incremental delta gifts (20 taps = 20 gifts instead of 230) and coalesced rapid alert popups'
      ]
    },
    {
      version: '1.3.4',
      releaseName: 'Shing Live v1.3.4 - Cute Chat Overlay & Direct TikTok Webcast Engine Fixes',
      releaseDate: '2026-10-12',
      summary: 'Fixed Cute Chat theme contrast (white-on-white text in Dark Purple software theme), TikTok CDN avatar proxy loading, auto-fade message grouping race conditions, and added Direct TikTok Webcast fallback when EulerStream is rate-limited.',
      highlights: [
        'Cute Chat Theme & Contrast Fix: Resolved duplicate preview handler and CSS variable mismatch that caused white text on white speech bubbles in the Dark Purple software theme',
        'TikTok Avatar Proxy in Chat Overlay: Routed chatter profile pictures through /api/avatar-proxy so TikTok CDN avatars always load in OBS and TikTok LIVE Studio',
        'Auto-Fade & Consecutive Grouping Fix: Prevented consecutive messages from disappearing during fade-out transitions and ensured the initial welcome greeting auto-dismisses cleanly',
        'Direct TikTok Webcast Engine: Built-in direct TikTok Webcast fallback (aid 1233 + ttwid cookie) with zero-quota offline checks so Connect works even when EulerStream is rate-limited'
      ]
    },
    {
      version: '1.3.3',
      releaseName: 'Shing Live v1.3.3 - Authentic Petpetgif.com Hand Animation for Headpat Overlay',
      releaseDate: '2026-10-12',
      summary: 'Updated the Pet-Pet Headpat overlay and dashboard preview to use the authentic 10-frame petpetgif.com patting hand sprite animation.',
      highlights: [
        'Authentic Petpetgif.com Hand Sprites: Replaced vector hand drawing with the original 10-frame pet0.gif-pet9.gif hand sprite animation from petpetgif.com',
        'Exact Pet-Pet Squish Physics: Implemented the exact 10-frame petpetgif.com width/height/offset squish formula on the viewer TikTok profile picture',
        'Instant Update Detection: Added uncached GitHub Contents API fallback alongside raw.githubusercontent.com so new updates are detected immediately without CDN delay'
      ]
    },
    {
      version: '1.3.2',
      releaseName: 'Shing Live v1.3.2 - Top Likers, Viewer Stay Ranking, Pet-Pet Headpat & Custom Media Triggers',
      releaseDate: '2026-10-12',
      summary: 'Added standalone Top Likers, Viewer Stay-Time Ranking, and Pet-Pet Headpat overlays, custom Video/Photo/GIF alert media on Follow and Gift triggers, and a Universal Master Volume bar in the top header.',
      highlights: [
        'Top Likers Ranking Overlay (toplikers.html): Standalone leaderboard showing who sent the most likes on stream (default Top 3, configurable 1-10)',
        'Viewer Stay Ranking Overlay (viewerranking.html): Tracks longest viewer stay time; stops timer on leave and resets current session timer to 00:00 on return while keeping Best Time',
        'Pet-Pet Headpat Overlay (headpat.html): Animated Pet-Pet hand patting the viewer TikTok profile picture on Follow or Gift events',
        'Custom Video / Photo / GIF Alerts: Upload custom MP4/WebM/MOV videos or GIF/PNG/JPG/WebP images for Follow and Gift alerts in the Triggers tab',
        'Universal Master Volume & Clean Header: Removed the top Test Events bar and added a Universal Master Volume slider + mute toggle across all overlays'
      ]
    },
    {
      version: '1.3.1',
      releaseName: 'Shing Live v1.3.1 - Manual TikTok Live Connect & Disconnect Controls',
      releaseDate: '2026-10-12',
      summary: 'Added a dedicated manual Connect button in the top header and Settings tab so streamers can connect, reconnect, or disconnect their TikTok Live stream anytime.',
      highlights: [
        'Header Connect Button: Added a prominent Connect / Connected / Reconnect button and quick Disconnect button in the top navigation bar',
        'Settings Live Connection Card: Added real-time connection status badge, direct username editing, and Connect Live / Disconnect controls in App Settings',
        'Race-Safe Connection Handshake: Added immediate Connecting state feedback, 15-second connection timeout protection, and toast notifications for manual connect results'
      ]
    },
    {
      version: '1.3.0',
      releaseName: 'Shing Live v1.3.0 - TikTok LIVE Studio Link Source Compatibility Fix',
      releaseDate: '2026-10-11',
      summary: 'Fixed TikTok LIVE Studio Add Link URL validation and File Not Found errors when adding .html overlay URLs.',
      highlights: [
        'TikTok LIVE Studio Link Compatibility: Updated Copy URL buttons to include .html extension required by TikTok LIVE Studio URL validator',
        'Overlay Route Resolution: Updated OverlayServer to serve both /overlays/<name> and /overlays/<name>.html with HTTP 200 OK'
      ]
    },
    {
      version: '1.2.9',
      releaseName: 'Shing Live v1.2.9 - Automatic Startup Updates & Persistent Theme Storage',
      releaseDate: '2026-10-11',
      summary: 'Added automatic update installation when the software opens and moved user configuration storage to AppData so themes and settings never reset across updates.',
      highlights: [
        'Auto-Update on Startup: Automatically downloads and installs available updates when Shing Live is opened without requiring manual update checks',
        'Persistent Theme & Settings Storage: Moved settings.json and backups to user-writable AppData with localStorage theme synchronization so custom themes never reset on update or restart',
        'Seamless Legacy Migration: Automatically migrates existing settings from the installation directory on first launch'
      ]
    },
    {
      version: '1.2.8',
      releaseName: 'Shing Live v1.2.8 - Companion Card Stage Scaling & Update Modal Alignment',
      releaseDate: '2026-10-11',
      summary: 'Fixed companion card preview canvas squishing when switching tabs, prevented speech bubble top clipping in compact previews, and centered the update confirmation modal icon.',
      highlights: [
        'Companion Card Preview Fix: Guarded canvas resize against hidden display:none tab dimensions so the chibi streamer and cats never collapse to 1px',
        'Speech Bubble Viewport Clamping: Added compact stage scaling and top boundary clamping so speech bubbles never get cut off at the top of the card',
        'Update Modal Alignment: Centered the checkmark badge and typography inside the Update Ready to Install confirmation dialog',
        'Instant Post-Update Refresh: Automatically refreshes embedded preview iframes and version badges immediately after applying an update'
      ]
    },
    {
      version: '1.2.7',
      releaseName: 'Shing Live v1.2.7 - 1-Minute Companion Cat Meow Interval',
      releaseDate: '2026-10-11',
      summary: 'Set companion cat meow interval to strictly once per minute and disabled automatic cat meows on gift, follow, chat, and like events.',
      highlights: [
        '1-Minute Cat Meow Timer: Unified companion cat meowing to a single shared 60-second timer across all active cats',
        'Event Meow Suppression: Cats no longer meow when viewers send gifts, follow, like, or chat',
        'Silent Dashboard Card Preview: Muted miniature Overlays tab companion preview iframe so background tabs never duplicate audio'
      ]
    },
    {
      version: '1.2.6',
      releaseName: 'Shing Live v1.2.6 - Reliable TikTok Live Auto-Connect & Protocol Upgrade',
      releaseDate: '2026-10-11',
      summary: 'Upgraded TikTok Live WebSocket connector to latest v2.5.0 protocol, resolved EulerStream signing failures, and implemented resilient auto-connect with instant live detection.',
      highlights: [
        'Protocol Upgrade: Migrated to modern TikTokLiveConnection v2.5.0 protocol architecture',
        'Live Stream Auto-Connect: Fixed dead signing endpoints (EulerStream 403/404) that previously prevented the app from connecting to active streams',
        'Background Polling: Zero-friction auto-connect that automatically monitors and locks onto the stream the instant the streamer goes live',
        'Full Message Parsing: High-reliability parsing for chat comments, gifts, likes, joins, follows, and shares with comprehensive attribute fallbacks',
        'Graceful Error Recovery: Clean disconnect handling, memory leak prevention, and automated 10-second polling retry loops'
      ]
    },
    {
      version: '1.2.5',
      releaseName: 'Shing Live v1.2.5 - Biggest Gift Spotlight, Overflow Physics & Jar Visuals',
      releaseDate: '2026-10-11',
      summary: 'Enhanced glass jar overlay with crisp high-contrast signature typography, overflow containment, clean transparent gift silhouettes, and Top Gifter spotlight badge.',
      highlights: [
        'Biggest Gift Spotlight: Replaced total count pill with real-time Top Gifter MVP badge highlighting the sender of the biggest stream gift',
        'Overflow Physics: Added outer containment walls and floor so overflowing gifts tumble over the rim and cascade down the glass without despawning',
        'Clean Gift Artwork: Removed artificial circular shadow discs so transparent gifts (galaxy spirals, roses, custom icons) render with natural silhouettes',
        'High-Contrast Glass Typography: Re-crafted the shing cursive signature with pure white luminous fill, deep plum outline, and lavender halo for 100% legibility'
      ]
    },
    {
      version: '1.2.4',
      releaseName: 'Shing Live v1.2.4 - Live Animated Overlay Demo Loops & Real-time Settings Sync',
      releaseDate: '2026-10-11',
      summary: 'Live animated demo loops across all 6 browser overlay cards with instant settings synchronization and zero idle CPU usage.',
      highlights: [
        'Live Animated Demo Loops: Replaced static badges with animated preview loops across all 6 overlay cards (Gift Jar, Companion Cats, Cute Chat, Lower 3rd Socials, Popup Alerts, Stream Timer)',
        'Real-Time Theme Sync: Live demo feeds immediately reflect customized themes, colors, bubble radius, and avatar shapes as you modify them',
        'Companion Stage Preview: Sandboxed companion iframe displaying pixel art chibi, walking cats, and interactive stage animations',
        'Zero Background Overhead: Intelligent tab visibility detection that halts all animations when switching away from Overlays tab',
        'Stream-Ready Countdown: Real-time digital clock with dynamic increment animations'
      ]
    },
    {
      version: '1.2.3',
      releaseName: 'Shing Live v1.2.3 - Smooth In-App Toasts & Custom Alert Modals',
      releaseDate: '2026-10-11',
      summary: 'Replaced intrusive native alert popups with sleek floating pastel toast notifications and custom in-app modal cards.',
      highlights: [
        'Floating Toast Notifications: Non-blocking notifications for settings save confirmations across all dashboard sections',
        'Custom In-App Alert Modal: Branded dialog card with vector icons replacing native Windows message boxes',
        'Auto-Dismiss Countdown: Animated progress bar auto-closing toasts after 3 seconds with manual dismiss button',
        'Zero OS Popups: Intercepts all alerts so the streamer is never interrupted by system dialogs'
      ]
    },
    {
      version: '1.2.2',
      releaseName: 'Shing Live v1.2.2 - Chat Overlay Themes & Stream Auto-Polling',
      releaseDate: '2026-10-11',
      summary: '8 visual themes for the chat overlay, live preview box syncing, and background auto-reconnect stream polling.',
      highlights: [
        'Chat Overlay Themes: 8 themes including Pastel Purple, Dark Cyber Neon, Strawberry Milk, Matcha Latte, Sunset Peach, Frosted Glass, Midnight Dark, and Retro Arcade',
        'Live Preview Sync: Real-time visual theme updates directly inside the settings tab',
        'Continuous Stream Polling: Auto-connect loop so launching the app before going live seamlessly connects as soon as stream starts',
        'TikTok Avatars: Profile picture and bio extraction directly from live streams with offline fallback'
      ]
    },
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

// Settings Export & Import Handlers
async function handleExportSettings() {
  const feedback = $('backup-action-feedback');
  try {
    if (feedback) feedback.textContent = 'Opening save dialog...';
    const res = await window.api.exportSettings();
    if (res && res.success) {
      if (feedback) feedback.textContent = `Backup exported successfully to: ${res.filePath}`;
      showToast(`Settings backup saved successfully!\nLocation: ${res.filePath}`, 'success', 'Backup Export', 4500);
    } else if (res && !res.canceled) {
      if (feedback) feedback.textContent = 'Export cancelled or failed.';
    } else {
      if (feedback) feedback.textContent = '';
    }
  } catch (err) {
    if (feedback) feedback.textContent = `Export error: ${err.message}`;
    showToast(`Could not export backup: ${err.message}`, 'error', 'Backup Export');
  }
}

async function handleImportSettings() {
  const feedback = $('backup-action-feedback');
  try {
    if (feedback) feedback.textContent = 'Opening file selector...';
    const res = await window.api.importSettings();
    if (res && res.success) {
      if (feedback) feedback.textContent = `Configuration restored successfully from: ${res.filePath}`;
      showToast('Settings restored successfully! UI and overlays have been updated.', 'success', 'Backup Restore');
      await initSettings();
    } else if (res && res.error) {
      if (feedback) feedback.textContent = `Import error: ${res.error}`;
      showToast(`Could not restore settings: ${res.error}`, 'error', 'Backup Restore');
    } else {
      if (feedback) feedback.textContent = '';
    }
  } catch (err) {
    if (feedback) feedback.textContent = `Import error: ${err.message}`;
    showToast(`Failed to import configuration: ${err.message}`, 'error', 'Backup Restore');
  }
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
      if (e.target.closest('button, select, input, label, .card-inline-settings')) return;
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

  // Account modal & Manual Connection buttons
  $('modal-search-btn').addEventListener('click', handleSearchUser);
  $('modal-username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSearchUser();
  });
  $('modal-confirm-yes').addEventListener('click', () => {
    const username = $('modal-unique-id').textContent.replace('@', '').trim();
    $('modal-account').classList.remove('active');
    handleManualConnect(username);
  });
  $('modal-confirm-no').addEventListener('click', () => {
    $('modal-step-confirm').style.display = 'none';
    $('modal-step-search').style.display = 'block';
  });
  $('modal-account-close')?.addEventListener('click', () => {
    $('modal-account').classList.remove('active');
  });
  $('account-pill').addEventListener('click', showAccountModal);
  $('switch-account-btn').addEventListener('click', showAccountModal);

  $('header-connect-btn')?.addEventListener('click', () => {
    handleManualConnect(appSettings.username);
  });
  $('header-disconnect-btn')?.addEventListener('click', handleManualDisconnect);
  $('settings-connect-btn')?.addEventListener('click', () => {
    handleManualConnect($('setting-username')?.value);
  });
  $('settings-disconnect-btn')?.addEventListener('click', handleManualDisconnect);
  $('setting-username')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleManualConnect($('setting-username').value);
  });

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

  // Universal Master Volume Bar Controls
  $('universal-volume-slider')?.addEventListener('input', e => {
    appSettings.universalVolume = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
    if (appSettings.universalVolume > 0 && appSettings.universalMuted) {
      appSettings.universalMuted = false;
    }
    updateUniversalVolumeUI();
    saveCurrentSettings();
  });

  $('universal-mute-btn')?.addEventListener('click', () => {
    appSettings.universalMuted = !appSettings.universalMuted;
    updateUniversalVolumeUI();
    saveCurrentSettings();
  });

  // Rankings & Pet-Pet Headpat Card Controls
  $('ranking-toplikers-count')?.addEventListener('change', e => {
    if (!appSettings.rankings) appSettings.rankings = {};
    appSettings.rankings.topLikersCount = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 3));
    renderDemoTopLikersRows();
    saveCurrentSettings();
    showToast(`Top Likers overlay set to Top ${appSettings.rankings.topLikersCount}!`, 'info', 'Top Likers');
  });

  $('ranking-toplikers-theme')?.addEventListener('change', e => {
    if (!appSettings.rankings) appSettings.rankings = {};
    const theme = e.target.value;
    appSettings.rankings.topLikersTheme = theme;
    if ($('ov-demo-toplikers-card')) {
      $('ov-demo-toplikers-card').dataset.theme = theme;
    }
    saveCurrentSettings();
    showToast(`Top Likers theme set to ${theme}!`, 'info', 'Top Likers');
  });

  $('ranking-toplikers-scale')?.addEventListener('input', e => {
    if (!appSettings.rankings) appSettings.rankings = {};
    const scale = parseFloat(e.target.value) || 1.0;
    appSettings.rankings.topLikersScale = scale;
    if ($('ranking-toplikers-scale-badge')) {
      $('ranking-toplikers-scale-badge').textContent = `${Math.round(scale * 100)}%`;
    }
    if ($('ov-demo-toplikers-card')) {
      $('ov-demo-toplikers-card').style.setProperty('--demo-scale', scale);
    }
  });

  $('ranking-toplikers-scale')?.addEventListener('change', () => {
    saveCurrentSettings();
  });

  $('ranking-viewers-count')?.addEventListener('change', e => {
    if (!appSettings.rankings) appSettings.rankings = {};
    appSettings.rankings.viewerRankingCount = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 3));
    renderDemoStayRows();
    saveCurrentSettings();
    showToast(`Viewer Stay Ranking set to Top ${appSettings.rankings.viewerRankingCount}!`, 'info', 'Stay Ranking');
  });

  $('ranking-viewers-theme')?.addEventListener('change', e => {
    if (!appSettings.rankings) appSettings.rankings = {};
    const theme = e.target.value;
    appSettings.rankings.viewerRankingTheme = theme;
    if ($('ov-demo-viewerranking-card')) {
      $('ov-demo-viewerranking-card').dataset.theme = theme;
    }
    saveCurrentSettings();
    showToast(`Viewer Stay Ranking theme set to ${theme}!`, 'info', 'Stay Ranking');
  });

  $('ranking-viewers-scale')?.addEventListener('input', e => {
    if (!appSettings.rankings) appSettings.rankings = {};
    const scale = parseFloat(e.target.value) || 1.0;
    appSettings.rankings.viewerRankingScale = scale;
    if ($('ranking-viewers-scale-badge')) {
      $('ranking-viewers-scale-badge').textContent = `${Math.round(scale * 100)}%`;
    }
    if ($('ov-demo-viewerranking-card')) {
      $('ov-demo-viewerranking-card').style.setProperty('--demo-scale', scale);
    }
  });

  $('ranking-viewers-scale')?.addEventListener('change', () => {
    saveCurrentSettings();
  });

  $('test-toplikers-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    const samples = [
      { user: 'SakuraChan', nickname: 'SakuraChan', username: 'sakurachan' },
      { user: 'MochiVibes', nickname: 'MochiVibes', username: 'mochivibes' },
      { user: 'KawaiiFox', nickname: 'KawaiiFox', username: 'kawaiifox' },
      { user: 'StarryNeko', nickname: 'StarryNeko', username: 'starryneko' }
    ];
    const pick = samples[Math.floor(Math.random() * samples.length)];
    const count = 15 + Math.floor(Math.random() * 60);
    window.api.simulateEvent('like', { ...pick, count, avatar: '/assets/avatar.png' });

    const existing = demoLikersData.find(x => x.name.toLowerCase() === pick.nickname.toLowerCase());
    if (existing) {
      existing.likes += count;
    } else {
      demoLikersData.push({ name: pick.nickname, likes: count, avatar: '../assets/avatar.png' });
    }
    demoLikersData.sort((a, b) => b.likes - a.likes);
    renderDemoTopLikersRows();

    showToast(`Simulated +${count} likes from ${pick.nickname}!`, 'info', 'Top Likers');
  });

  $('reset-toplikers-btn')?.addEventListener('click', async e => {
    e.stopPropagation();
    await window.api.resetRankings('likers');
    demoLikersData.length = 0;
    renderDemoTopLikersRows();
    showToast('Top Likers leaderboard reset!', 'success', 'Top Likers');
  });

  $('test-viewer-join-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    window.api.simulateEvent('join', {
      user: 'LunarNeko',
      nickname: 'LunarNeko',
      username: 'lunarneko',
      avatar: '/assets/avatar.png'
    });

    const existing = demoStayData.find(x => x.name.toLowerCase() === 'lunarneko');
    if (existing) {
      existing.isPresent = true;
      existing.timeSec += 60;
    } else {
      demoStayData.push({ name: 'LunarNeko', timeSec: 60, isPresent: true, avatar: '../assets/avatar.png' });
    }
    demoStayData.sort((a, b) => b.timeSec - a.timeSec);
    renderDemoStayRows();

    showToast('LunarNeko is active in stream (timer ticking)!', 'info', 'Stay Ranking');
  });

  $('test-viewer-leave-btn')?.addEventListener('click', async e => {
    e.stopPropagation();
    await window.api.simulateViewerLeave('lunarneko');

    const existing = demoStayData.find(x => x.name.toLowerCase() === 'lunarneko');
    if (existing) {
      existing.isPresent = false;
    }
    renderDemoStayRows();

    showToast('LunarNeko left stream: timer stopped! Returning will reset current timer to 00:00 while keeping Best Time.', 'warning', 'Stay Ranking', 4200);
  });

  $('reset-viewers-btn')?.addEventListener('click', async e => {
    e.stopPropagation();
    await window.api.resetRankings('viewers');
    demoStayData.length = 0;
    renderDemoStayRows();
    showToast('Viewer Stay Ranking leaderboard reset!', 'success', 'Stay Ranking');
  });

  $('headpat-on-follow')?.addEventListener('change', e => {
    if (!appSettings.headpat) appSettings.headpat = {};
    appSettings.headpat.triggerOnFollow = e.target.checked;
    saveCurrentSettings();
  });

  $('headpat-on-gift')?.addEventListener('change', e => {
    if (!appSettings.headpat) appSettings.headpat = {};
    appSettings.headpat.triggerOnGift = e.target.checked;
    saveCurrentSettings();
  });

  $('headpat-on-command')?.addEventListener('change', e => {
    if (!appSettings.headpat) appSettings.headpat = {};
    appSettings.headpat.triggerOnCommand = e.target.checked;
    saveCurrentSettings();
  });

  $('test-headpat-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    window.api.simulateEvent('headpat:trigger', {
      user: 'SakuraChan',
      nickname: 'SakuraChan',
      username: 'sakurachan',
      avatar: '/assets/avatar.png',
      reasonText: 'Good Viewer Headpat! *pat pat*'
    });
    showToast('Triggered Pet-Pet Headpat on overlay!', 'success', 'Pet-Pet Headpat');
  });

  $('test-headpat-cmd-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    window.api.simulateEvent('chat', {
      comment: '/pet @Gojo',
      user: 'StarViewer',
      nickname: 'StarViewer',
      username: 'starviewer',
      avatar: '/assets/avatar.png'
    });
    showToast('Simulated "/pet @Gojo" chat command!', 'success', 'Pet-Pet Command');
  });

  // Trigger Custom Video / Photo / GIF Media Controls
  $('upload-follow-media-btn')?.addEventListener('click', async () => {
    try {
      const res = await window.api.selectLocalMedia();
      if (!res || res.canceled) return;
      if (res.success && res.url) {
        if (!appSettings.triggers) appSettings.triggers = {};
        appSettings.triggers.followMedia = res.url;
        appSettings.triggers.followMediaType = res.mediaType;
        renderTriggerMediaUI('follow');
        saveCurrentSettings();
        showToast(`Follow alert media set to "${res.name}"!`, 'success', 'Follow Alert Media');
      }
    } catch (err) {
      showToast(`Media error: ${err.message}`, 'error', 'Follow Alert Media');
    }
  });

  // Event Editor Modal Controls
  $('modal-event-editor')?.addEventListener('click', (e) => {
    if (e.target === $('modal-event-editor')) closeEventEditorModal();
  });
  $('event-modal-close')?.addEventListener('click', closeEventEditorModal);
  $('event-modal-cancel-btn')?.addEventListener('click', closeEventEditorModal);
  $('event-modal-save-btn')?.addEventListener('click', saveEventEditorModal);
  $('event-modal-test-btn')?.addEventListener('click', () => {
    testEventAlert(currentEventModalKey);
  });

  $('event-modal-sound-test')?.addEventListener('click', () => {
    const val = $('event-modal-sound')?.value;
    if (val) playSoundPreview(val);
  });

  $('event-modal-sound-search')?.addEventListener('click', () => {
    if ($('modal-target-sound-select')) {
      $('modal-target-sound-select').value = 'event-modal-sound';
    }
    $('modal-sound-search').classList.add('active');
    $('sound-search-input')?.focus();
  });

  $('event-modal-sound-upload')?.addEventListener('click', () => {
    handleImportLocalSound('event-modal-sound');
  });

  $('event-modal-upload-media-btn')?.addEventListener('click', async () => {
    const def = EVENT_DEFINITIONS.find(d => d.key === currentEventModalKey);
    if (!def || !def.mediaKey) return;
    try {
      const res = await window.api.selectLocalMedia();
      if (!res || res.canceled) return;
      if (res.success && res.url) {
        if (!appSettings.triggers) appSettings.triggers = {};
        appSettings.triggers[def.mediaKey] = res.url;
        appSettings.triggers[def.mediaTypeKey] = res.mediaType;
        renderEventModalMediaUI(def);
        saveCurrentSettings();
        renderEventsTable();
        showToast(`${def.name} media updated to "${res.name}"!`, 'success', 'Media Attached');
      }
    } catch (err) {
      showToast(`Media error: ${err.message}`, 'error', 'Media Upload');
    }
  });

  $('event-modal-clear-media-btn')?.addEventListener('click', () => {
    const def = EVENT_DEFINITIONS.find(d => d.key === currentEventModalKey);
    if (!def || !def.mediaKey) return;
    if (!appSettings.triggers) appSettings.triggers = {};
    appSettings.triggers[def.mediaKey] = '';
    appSettings.triggers[def.mediaTypeKey] = '';
    renderEventModalMediaUI(def);
    saveCurrentSettings();
    renderEventsTable();
    showToast(`${def.name} custom media removed.`, 'info', 'Media Removed');
  });

  // General Triggers Settings Save
  $('save-triggers-btn')?.addEventListener('click', () => {
    if (!appSettings.triggers) appSettings.triggers = {};
    appSettings.triggers.alertDuration = +$('trig-duration').value || 5;
    appSettings.triggers.likeThreshold = +$('trig-likes-thresh').value || 50;
    appSettings.triggers.soundEnabled = $('trig-sound-enabled') ? $('trig-sound-enabled').checked : true;
    appSettings.triggers.soundVolume = $('trig-volume') ? +$('trig-volume').value : 0.85;
    saveCurrentSettings();
    renderEventsTable();
    showToast('General alert settings saved!', 'success', 'Triggers Saved');
  });

  // Sound volume slider live preview
  $('trig-volume')?.addEventListener('input', e => {
    if ($('trig-volume-val')) {
      $('trig-volume-val').textContent = `${Math.round(e.target.value * 100)}%`;
    }
    if (currentPreviewAudio) {
      currentPreviewAudio.volume = Math.max(0, Math.min(1, +e.target.value));
    }
  });

  // Sound preview buttons
  document.querySelectorAll('.test-sound-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const sel = $(targetId);
      if (sel) playSoundPreview(sel.value);
    });
  });

  // Open MyInstants search modal from triggers tab
  $('open-myinstants-modal-btn')?.addEventListener('click', () => {
    $('modal-sound-search').classList.add('active');
    $('sound-search-input')?.focus();
  });

  // Row-level search MyInstants buttons
  document.querySelectorAll('.search-sound-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      if ($('modal-target-sound-select') && targetId) {
        $('modal-target-sound-select').value = targetId;
      }
      $('modal-sound-search').classList.add('active');
      $('sound-search-input')?.focus();
    });
  });

  // Row-level local file import buttons
  document.querySelectorAll('.upload-sound-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      handleImportLocalSound(btn.dataset.target);
    });
  });

  // Main local sound import buttons
  $('import-local-sound-btn')?.addEventListener('click', () => {
    handleImportLocalSound('trig-sound-gift');
  });
  $('modal-import-local-btn')?.addEventListener('click', () => {
    const target = $('modal-target-sound-select') ? $('modal-target-sound-select').value : 'trig-sound-gift';
    handleImportLocalSound(target);
  });

  // Sound search submit
  $('sound-search-submit-btn')?.addEventListener('click', () => {
    handleSoundSearch($('sound-search-input').value);
  });
  $('sound-search-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSoundSearch($('sound-search-input').value);
  });

  // Quick search category pills
  document.querySelectorAll('.sound-quick-pill, .sound-modal-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const q = pill.dataset.q;
      if ($('sound-search-input')) $('sound-search-input').value = q;
      $('modal-sound-search').classList.add('active');
      handleSoundSearch(q);
    });
  });

  // Close sound search modal
  $('modal-sound-search-close')?.addEventListener('click', () => {
    $('modal-sound-search').classList.remove('active');
    if (currentPreviewAudio) {
      try { currentPreviewAudio.pause(); } catch (e) {}
    }
  });
  $('modal-sound-search-dismiss')?.addEventListener('click', () => {
    $('modal-sound-search').classList.remove('active');
    if (currentPreviewAudio) {
      try { currentPreviewAudio.pause(); } catch (e) {}
    }
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
    if (!appSettings.lowerThird) appSettings.lowerThird = {};
    appSettings.lowerThird.tiktok = $('lt-tiktok').value;
    if (typeof OverlayDemoManager !== 'undefined') OverlayDemoManager.sync();
  });
  ['lt-instagram', 'lt-youtube', 'lt-discord'].forEach(id => {
    $(id)?.addEventListener('input', () => {
      if (!appSettings.lowerThird) appSettings.lowerThird = {};
      const key = id.replace('lt-', '');
      appSettings.lowerThird[key] = $(id).value;
      if (typeof OverlayDemoManager !== 'undefined') OverlayDemoManager.sync();
    });
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
    showToast('Lower 3rd social banner settings saved!', 'success', 'Lower Third');
  });

  // Chat Settings & Live Preview
  $('chat-theme')?.addEventListener('change', updateChatPreviewBox);
  $('chat-font-family')?.addEventListener('change', updateChatPreviewBox);
  $('chat-avatar-shape')?.addEventListener('change', updateChatPreviewBox);
  $('chat-avatar-anim')?.addEventListener('change', updateChatPreviewBox);
  $('chat-badges')?.addEventListener('change', updateChatPreviewBox);

  $('chat-font-size').addEventListener('input', () => {
    $('chat-font-val').textContent = `${$('chat-font-size').value}px`;
    updateChatPreviewBox();
  });
  $('chat-radius').addEventListener('input', () => {
    $('chat-radius-val').textContent = `${$('chat-radius').value}px`;
    updateChatPreviewBox();
  });
  $('save-chat-btn').addEventListener('click', () => {
    const rawAutoFade = parseInt($('chat-autofade').value, 10);
    appSettings.chat = {
      theme: $('chat-theme') ? $('chat-theme').value : 'pastel-purple',
      fontFamily: $('chat-font-family') ? $('chat-font-family').value : 'quicksand',
      fontSize: +$('chat-font-size').value || 14,
      bubbleRadius: +$('chat-radius').value || 16,
      autoFadeSec: Number.isNaN(rawAutoFade) ? 15 : Math.max(0, rawAutoFade),
      maxMessages: +$('chat-max-messages').value || 8,
      showBadges: $('chat-badges').checked,
      avatarShape: $('chat-avatar-shape').value,
      avatarAnim: $('chat-avatar-anim').value,
      messageGrouping: $('chat-grouping').checked
    };
    updateChatPreviewBox();
    saveCurrentSettings();
    showToast('Chat overlay settings saved!', 'success', 'Chat Box');
  });

  $('send-test-chat-btn').addEventListener('click', () => {
    const user = $('test-chat-user').value || 'Viewer';
    const role = $('test-chat-role').value || 'viewer';
    const comment = $('test-chat-comment').value || 'Hello!';
    window.api.simulateEvent('chat', { user, nickname: user, role, comment });
    appendDashboardChatPreview({ user, nickname: user, role, comment, avatar: '../assets/avatar.png' });
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
    appSettings.jar = Object.assign({}, appSettings.jar, {
      gravity: +$('jar-gravity').value,
      giftScale: +$('jar-scale').value,
      bounciness: +$('jar-bounciness').value,
      maxGifts: +$('jar-max').value,
      overflowAllowed: true,
      transform: Object.assign({}, jarTransform)
    });
    saveCurrentSettings();
    showToast('Jar physics and gift settings saved!', 'success', 'Interactive Jar');
  });
  $('clear-jar-btn').addEventListener('click', () => {
    window.api.clearJar();
  });

  // Jar Interactive 16:9 Drag Engine & Live Studio Sync
  function handlePointerMove(e) {
    if (!isDraggingJar) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    if (dragRafId) cancelAnimationFrame(dragRafId);
    dragRafId = requestAnimationFrame(() => {
      const stageEl = $('jar-preview-stage');
      if (!stageEl) return;
      const rect = stageEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const rawX = ((clientX - rect.left) / rect.width) * 100;
      const rawY = ((clientY - rect.top) / rect.height) * 100;
      const clamped = calculateClampedCoordinates(rawX, rawY, jarTransform.scale);
      jarTransform.x = clamped.x;
      jarTransform.y = clamped.y;
      updateJarTransformUI(jarTransform.x, jarTransform.y, jarTransform.scale);
      sendJarTransform(jarTransform.x, jarTransform.y, jarTransform.scale);
    });
  }

  const stopDrag = e => {
    if (isDraggingJar) {
      isDraggingJar = false;
      if (dragRafId) {
        cancelAnimationFrame(dragRafId);
        dragRafId = null;
      }
      $('jar-drag-target')?.classList.remove('dragging');
      try {
        if (e && e.pointerId !== undefined) {
          $('jar-drag-overlay')?.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
    }
  };

  $('jar-drag-overlay')?.addEventListener('pointerdown', e => {
    isDraggingJar = true;
    try {
      $('jar-drag-overlay')?.setPointerCapture(e.pointerId);
    } catch (_) {}
    $('jar-drag-target')?.classList.add('dragging');
    handlePointerMove(e);
  });
  $('jar-drag-overlay')?.addEventListener('pointermove', handlePointerMove);
  $('jar-drag-overlay')?.addEventListener('pointerup', stopDrag);
  $('jar-drag-overlay')?.addEventListener('pointercancel', stopDrag);
  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('pointercancel', stopDrag);

  // Slider input handling on #jar-scale-slider
  $('jar-scale-slider')?.addEventListener('input', e => {
    const newScale = Math.max(0.4, Math.min(1.5, Number(e.target.value) || 1.0));
    jarTransform.scale = +newScale.toFixed(2);
    const clamped = calculateClampedCoordinates(jarTransform.x, jarTransform.y, jarTransform.scale);
    jarTransform.x = clamped.x;
    jarTransform.y = clamped.y;
    updateJarTransformUI(jarTransform.x, jarTransform.y, jarTransform.scale);
    sendJarTransform(jarTransform.x, jarTransform.y, jarTransform.scale);
  });

  // Reset button handling on #jar-reset-transform-btn
  $('jar-reset-transform-btn')?.addEventListener('click', () => {
    jarTransform = { x: 50.0, y: 82.0, scale: 1.0 };
    updateJarTransformUI(jarTransform.x, jarTransform.y, jarTransform.scale);
    sendJarTransform(jarTransform.x, jarTransform.y, jarTransform.scale);
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
    const rawGiftId = opt.getAttribute('data-id') || giftId;
    const giftName = opt.getAttribute('data-name') || giftId;
    const coins = +(opt.getAttribute('data-coins') || opt.getAttribute('data-diamonds') || 1);
    let giftPictureUrl = opt.getAttribute('data-img') || null;
    if (!giftPictureUrl && fullGiftCatalog.length > 0) {
      const match = fullGiftCatalog.find(g => String(g.id) === String(rawGiftId) || String(g.id) === String(giftId) || (g.name && g.name.toLowerCase() === giftName.toLowerCase()));
      if (match && match.image) giftPictureUrl = match.image;
    }
    window.api.simulateEvent('gift', {
      user: 'Supporter',
      nickname: 'Supporter',
      giftId,
      rawGiftId,
      giftName,
      coins,
      giftPictureUrl: giftPictureUrl || undefined,
      count: 1
    });
  });

  // Timer Controls & Custom Duration
  function getTimerInputSeconds() {
    const h = Math.max(0, parseInt($('timer-hours')?.value, 10) || 0);
    const m = Math.max(0, Math.min(59, parseInt($('timer-minutes')?.value, 10) || 0));
    const s = Math.max(0, Math.min(59, parseInt($('timer-seconds')?.value, 10) || 0));
    return h * 3600 + m * 60 + s;
  }

  ['timer-hours', 'timer-minutes', 'timer-seconds'].forEach(id => {
    $(id)?.addEventListener('input', () => {
      const totalSec = getTimerInputSeconds();
      updateTimerUI({ remainingSeconds: totalSec, isRunning: false });
      window.api.controlTimer('set', totalSec);
      if (typeof OverlayDemoManager !== 'undefined') {
        OverlayDemoManager.simSeconds = totalSec;
        OverlayDemoManager.sync();
      }
    });
  });

  document.querySelectorAll('.timer-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = parseInt(btn.dataset.time, 10) || 1800;
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      if ($('timer-hours')) $('timer-hours').value = h;
      if ($('timer-minutes')) $('timer-minutes').value = m;
      if ($('timer-seconds')) $('timer-seconds').value = s;
      updateTimerUI({ remainingSeconds: sec, isRunning: false });
      window.api.controlTimer('set', sec);
      if (typeof OverlayDemoManager !== 'undefined') {
        OverlayDemoManager.simSeconds = sec;
        OverlayDemoManager.sync();
      }
    });
  });

  $('timer-bonus')?.addEventListener('input', () => {
    if (!appSettings.timer) appSettings.timer = {};
    appSettings.timer.addSecondsPerGift = parseFloat($('timer-bonus').value) || 15;
    if (typeof OverlayDemoManager !== 'undefined') OverlayDemoManager.sync();
  });

  $('timer-theme')?.addEventListener('change', () => {
    if (!appSettings.timer) appSettings.timer = {};
    appSettings.timer.theme = $('timer-theme').value;
    saveCurrentSettings();
  });

  $('timer-scale-slider')?.addEventListener('input', () => {
    if (!appSettings.timer) appSettings.timer = {};
    const val = parseFloat($('timer-scale-slider').value) || 1.0;
    appSettings.timer.scale = val;
    if ($('timer-scale-badge')) $('timer-scale-badge').textContent = `${Math.round(val * 100)}%`;
    saveCurrentSettings();
  });

  $('save-timer-btn')?.addEventListener('click', () => {
    const totalSec = getTimerInputSeconds();
    const durationMin = Math.max(1, Math.round(totalSec / 60));
    if (!appSettings.timer) appSettings.timer = {};
    appSettings.timer.durationMin = durationMin;
    appSettings.timer.reduceSecondsPerComment = Math.max(0, parseFloat($('timer-deduct-comment')?.value) || 0);
    appSettings.timer.reduceSecondsPerLike = Math.max(0, parseFloat($('timer-deduct-like')?.value) || 0);
    appSettings.timer.addSecondsPerGift = Math.max(0, parseFloat($('timer-bonus')?.value) || 0);
    appSettings.timer.theme = $('timer-theme')?.value || 'Purple';
    appSettings.timer.scale = parseFloat($('timer-scale-slider')?.value) || 1.0;
    saveCurrentSettings();
    window.api.controlTimer('set', totalSec);
    showToast('Stream timer settings saved!', 'success', 'Stream Timer');
  });

  $('timer-start-btn')?.addEventListener('click', () => {
    window.api.controlTimer('start');
  });

  $('timer-pause-btn')?.addEventListener('click', () => {
    window.api.controlTimer('pause');
  });

  $('timer-reset-btn')?.addEventListener('click', () => {
    const totalSec = getTimerInputSeconds();
    window.api.controlTimer('reset', totalSec || 1800);
  });

  $('timer-sub1m-btn')?.addEventListener('click', () => {
    window.api.controlTimer('adjust', -60);
  });

  $('timer-add1m-btn')?.addEventListener('click', () => {
    window.api.controlTimer('adjust', 60);
  });

  $('timer-add5m-btn')?.addEventListener('click', () => {
    window.api.controlTimer('adjust', 300);
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

  $('comp-bubble-font')?.addEventListener('change', () => {
    broadcastCompanionChange();
    updateCompanionLivePreview(true);
  });

  $('comp-bubble-size')?.addEventListener('input', () => {
    const val = Number($('comp-bubble-size').value) || 18;
    if ($('comp-bubble-size-val')) {
      $('comp-bubble-size-val').textContent = `${val}px`;
    }
    updateCompanionLivePreview(true);
  });

  $('comp-bubble-size')?.addEventListener('change', () => {
    broadcastCompanionChange();
  });

  function updateCompanionLivePreview(showDemoMsg = false) {
    const iframe = $('comp-preview-iframe');
    if (!iframe || !iframe.contentWindow) return;
    const bubbleFont = $('comp-bubble-font') ? $('comp-bubble-font').value : 'Nunito';
    const bubbleFontSize = $('comp-bubble-size') ? Number($('comp-bubble-size').value) || 18 : 18;
    try {
      iframe.contentWindow.postMessage({
        type: 'companion:preview',
        companion: {
          hair: $('comp-hairstyle')?.value || 'twintails',
          hc: $('comp-hair-color')?.value || '#7b3fe4',
          oc: $('comp-outfit-color')?.value || '#9b5cf0',
          cats: Array.from(document.querySelectorAll('#comp-cats input[type="checkbox"]:checked')).map(c => c.value),
          bubbleFont,
          bubbleFontSize
        },
        demoMessage: showDemoMsg ? 'Hi GOJO! Welcome to the stream!' : undefined
      }, '*');
    } catch (_) {}
  }

  function broadcastCompanionChange() {
    const cats = Array.from(document.querySelectorAll('#comp-cats input[type="checkbox"]:checked')).map(c => c.value);
    const bubbleFont = $('comp-bubble-font') ? $('comp-bubble-font').value : 'Nunito';
    const bubbleFontSize = $('comp-bubble-size') ? Number($('comp-bubble-size').value) || 18 : 18;
    appSettings.companion = {
      hair: $('comp-hairstyle').value,
      hc: $('comp-hair-color').value,
      oc: $('comp-outfit-color').value,
      cats,
      bubbleFont,
      bubbleFontSize
    };
    saveCurrentSettings();
    updateCompanionLivePreview(false);
  }

  $('save-companion-btn').addEventListener('click', () => {
    broadcastCompanionChange();
    showToast('Pixel companion avatar settings saved!', 'success', 'Pixel Companion');
  });
  $('test-comp-happy-btn').addEventListener('click', () => {
    window.api.simulateEvent('gift', { user: 'Tester', giftName: 'Rose' });
  });
  $('test-cat-meow-btn')?.addEventListener('click', () => {
    window.api.simulateEvent('cat:meow', {});
  });

  // Streamer Info Banner Controls
  function ensureBannerSettings() {
    if (!appSettings.banner) {
      appSettings.banner = {
        enabled: true,
        template: 'pastel-dream',
        aspectRatio: '3:1',
        scale: 1.0,
        topper: 'bear',
        animation: 'float',
        transitionStyle: 'slide',
        sceneDuration: 5,
        autoCycle: true,
        particles: 'sparkles',
        shineEffect: true,
        borderGlow: true,
        showAvatar: true,
        name: appSettings.username || 'shimmy_ming',
        subtitle: 'Cozy Variety Streamer',
        bio: 'Welcome to the cozy corner! Streaming daily games, art, and chill chats.',
        schedule: 'Daily at 7:00 PM EST',
        statusBadge: 'LIVE NOW',
        socials: {
          twitch: appSettings.username || 'shimmy_ming',
          tiktok: appSettings.lowerThird?.tiktok || '@shimmy_ming',
          discord: '',
          twitter: '',
          instagram: '',
          youtube: ''
        }
      };
    }
    if (!appSettings.banner.socials) {
      appSettings.banner.socials = {};
    }
    return appSettings.banner;
  }

  $('banner-enable-toggle')?.addEventListener('change', e => {
    const banner = ensureBannerSettings();
    banner.enabled = e.target.checked;
    saveSettingsDebounced();
  });

  $('banner-scale-slider')?.addEventListener('input', e => {
    const banner = ensureBannerSettings();
    const clamped = clampBannerScale(e.target.value);
    banner.scale = clamped;
    if ($('banner-scale-badge')) {
      $('banner-scale-badge').textContent = `${Math.round(clamped * 100)}%`;
      $('banner-scale-badge').style.setProperty('--banner-scale', clamped);
    }
    saveSettingsDebounced();
  });

  $('banner-scale-slider')?.addEventListener('change', () => {
    saveSettingsDebounced(0);
  });

  // Template cards selection
  document.querySelectorAll('#banner-template-cards .template-card').forEach(card => {
    card.addEventListener('click', () => {
      const tpl = card.dataset.template;
      if (!tpl) return;
      document.querySelectorAll('#banner-template-cards .template-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      if ($('banner-template-select')) $('banner-template-select').value = tpl;
      const banner = ensureBannerSettings();
      banner.template = tpl;
      saveSettingsDebounced();
    });
  });

  $('banner-template-select')?.addEventListener('change', e => {
    const banner = ensureBannerSettings();
    banner.template = e.target.value;
    document.querySelectorAll('#banner-template-cards .template-card').forEach(c => {
      c.classList.toggle('active', c.dataset.template === banner.template);
    });
    saveSettingsDebounced();
  });

  $('banner-aspect-select')?.addEventListener('change', e => {
    const banner = ensureBannerSettings();
    banner.aspectRatio = e.target.value;
    saveSettingsDebounced();
  });

  $('banner-topper-select')?.addEventListener('change', e => {
    const banner = ensureBannerSettings();
    const allowed = ['bear', 'ribbon', 'cat', 'wings', 'none'];
    banner.topper = allowed.includes(e.target.value) ? e.target.value : 'bear';
    saveSettingsDebounced();
  });

  $('banner-anim-select')?.addEventListener('change', e => {
    const banner = ensureBannerSettings();
    const allowed = ['float', 'sway', 'pulse', 'breathe', 'bounce'];
    banner.animation = allowed.includes(e.target.value) ? e.target.value : 'float';
    saveSettingsDebounced();
  });

  $('banner-show-avatar-toggle')?.addEventListener('change', e => {
    const banner = ensureBannerSettings();
    banner.showAvatar = e.target.checked;
    saveSettingsDebounced();
  });

  $('banner-autocycle-toggle')?.addEventListener('change', e => {
    const banner = ensureBannerSettings();
    banner.autoCycle = e.target.checked;
    saveSettingsDebounced();
  });

  $('banner-duration-slider')?.addEventListener('input', e => {
    const banner = ensureBannerSettings();
    const dur = Math.max(2, Math.min(15, Number(e.target.value) || 5));
    banner.sceneDuration = dur;
    if ($('banner-duration-badge')) $('banner-duration-badge').textContent = `${dur}s`;
    saveSettingsDebounced();
  });

  $('banner-transition-select')?.addEventListener('change', e => {
    const banner = ensureBannerSettings();
    banner.transitionStyle = e.target.value;
    saveSettingsDebounced();
  });

  $('banner-particles-select')?.addEventListener('change', e => {
    const banner = ensureBannerSettings();
    banner.particles = e.target.value;
    saveSettingsDebounced();
  });

  $('banner-shine-toggle')?.addEventListener('change', e => {
    const banner = ensureBannerSettings();
    banner.shineEffect = e.target.checked;
    saveSettingsDebounced();
  });

  $('banner-name-input')?.addEventListener('input', e => {
    const banner = ensureBannerSettings();
    banner.name = e.target.value;
    saveSettingsDebounced();
  });

  $('banner-subtitle-input')?.addEventListener('input', e => {
    const banner = ensureBannerSettings();
    banner.subtitle = e.target.value;
    saveSettingsDebounced();
  });

  $('banner-bio-input')?.addEventListener('input', e => {
    const banner = ensureBannerSettings();
    banner.bio = e.target.value;
    saveSettingsDebounced();
  });

  $('banner-schedule-input')?.addEventListener('input', e => {
    const banner = ensureBannerSettings();
    banner.schedule = e.target.value;
    saveSettingsDebounced();
  });

  $('banner-status-input')?.addEventListener('input', e => {
    const banner = ensureBannerSettings();
    banner.statusBadge = e.target.value;
    saveSettingsDebounced();
  });

  const bannerSocialFields = [
    { id: 'banner-twitch-input', key: 'twitch' },
    { id: 'banner-tiktok-input', key: 'tiktok' },
    { id: 'banner-discord-input', key: 'discord' },
    { id: 'banner-twitter-input', key: 'twitter' },
    { id: 'banner-instagram-input', key: 'instagram' },
    { id: 'banner-youtube-input', key: 'youtube' }
  ];

  bannerSocialFields.forEach(({ id, key }) => {
    $(id)?.addEventListener('input', e => {
      const banner = ensureBannerSettings();
      banner.socials[key] = e.target.value;
      saveSettingsDebounced();
    });
  });

  // Dual URL Copy actions
  $('banner-copy-localhost-btn')?.addEventListener('click', async () => {
    const url = 'http://localhost:3333/overlays/banner.html';
    try {
      await navigator.clipboard.writeText(url);
      showToast('Banner URL (localhost) copied to clipboard!', 'success', 'Banner');
    } catch (e) {
      showToast(url, 'info', 'Banner URL');
    }
  });

  $('banner-copy-127-btn')?.addEventListener('click', async () => {
    const url = 'http://127.0.0.1:3333/overlays/banner.html';
    try {
      await navigator.clipboard.writeText(url);
      showToast('Banner URL (127.0.0.1) copied to clipboard!', 'success', 'Banner');
    } catch (e) {
      showToast(url, 'info', 'Banner URL');
    }
  });

  // Scene preview test buttons
  function sendBannerTestScene(sceneIndex) {
    const ifr = $('banner-preview-iframe');
    if (ifr && ifr.contentWindow) {
      try {
        ifr.contentWindow.postMessage({ type: 'banner:test-scene', scene: sceneIndex }, '*');
      } catch (e) {}
    }
    fetch('/api/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'banner:test-scene', scene: sceneIndex })
    }).catch(() => {});
  }

  $('preview-scene-1-btn')?.addEventListener('click', () => sendBannerTestScene(0));
  $('preview-scene-2-btn')?.addEventListener('click', () => sendBannerTestScene(1));
  $('preview-scene-3-btn')?.addEventListener('click', () => sendBannerTestScene(2));

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

  // Custom Alert modal actions
  $('custom-alert-close')?.addEventListener('click', closeCustomAlert);
  $('custom-alert-confirm-btn')?.addEventListener('click', closeCustomAlert);
  $('modal-custom-alert')?.addEventListener('click', e => {
    if (e.target.id === 'modal-custom-alert') closeCustomAlert();
  });
  $('modal-event-editor')?.addEventListener('click', e => {
    if (e.target.id === 'modal-event-editor') closeEventEditorModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if ($('modal-custom-alert')?.classList.contains('active')) closeCustomAlert();
      if ($('modal-event-editor')?.classList.contains('active')) closeEventEditorModal();
    }
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

  // Settings Backup & Restore Listeners
  $('btn-export-settings')?.addEventListener('click', handleExportSettings);
  $('btn-import-settings')?.addEventListener('click', handleImportSettings);

  if (typeof window.api !== 'undefined' && window.api.onSettingsLoaded) {
    window.api.onSettingsLoaded(async newSettings => {
      appSettings = newSettings;
      currentSettings = appSettings;
      if (typeof window !== 'undefined') {
        window.appSettings = appSettings;
        window.currentSettings = appSettings;
      }
      await initSettings();
    });
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateClampedCoordinates,
    updateJarTransformUI,
    sendJarTransform,
    EVENT_DEFINITIONS,
    renderEventsTable,
    openEventEditorModal,
    closeEventEditorModal,
    saveEventEditorModal,
    saveSettingsDebounced,
    saveCurrentSettings,
    clampBannerScale,
    populateBannerSettings
  };
}

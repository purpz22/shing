'use strict';

const { app, BrowserWindow, Menu, ipcMain, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

if (app) {
  app.name = 'Shing Live';
}

// Ensure Windows taskbar and system tray uses Shing Live identity and icon
if (process.platform === 'win32' && app && typeof app.setAppUserModelId === 'function') {
  app.setAppUserModelId('com.shing.live');
}

// Remove the default Electron application menu bar (File, Edit, View, Window, Help)
if (Menu && typeof Menu.setApplicationMenu === 'function') {
  Menu.setApplicationMenu(null);
}

const OverlayServer = require('./server/overlayServer');
const AppUpdater = require('./services/updater');

let mainWindow = null;
let overlayServer = null;
let tiktokConnection = null;
let isConnected = false;

// Initialize Updater Service
const updater = new AppUpdater(__dirname);

// Initialize Overlay Server
const PORT = 3333;
overlayServer = new OverlayServer(PORT, __dirname);

let giftCatalog = [];
try {
  const catPath = path.join(__dirname, 'assets', 'gifts-catalog.json');
  if (fs.existsSync(catPath)) {
    giftCatalog = JSON.parse(fs.readFileSync(catPath, 'utf8'));
  }
} catch (e) {}

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', process.platform === 'win32' ? 'app-icon.ico' : 'app-icon.png');
  const appIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1040,
    minHeight: 680,
    title: 'Shing Live',
    icon: appIcon || iconPath,
    backgroundColor: '#f6f0ff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (appIcon) {
    mainWindow.setIcon(appIcon);
  }

  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);

  // Retain standard developer and refresh shortcuts (F12, Ctrl+Shift+I, F5, Ctrl+R)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    } else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      mainWindow.webContents.reload();
      event.preventDefault();
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await overlayServer.start();
  } catch (err) {
    console.error('Failed to start overlay server on port ' + PORT, err);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (tiktokConnection) {
      try { tiktokConnection.disconnect(); } catch (e) {}
    }
    if (overlayServer) overlayServer.stop();
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('settings:get', () => {
  return overlayServer.settings;
});

ipcMain.handle('settings:save', (evt, newSettings) => {
  return overlayServer.saveSettings(newSettings);
});

// Settings Export / Backup
ipcMain.handle('settings:export', async () => {
  const currentSettings = overlayServer.getSettings();
  const dateStr = new Date().toISOString().slice(0, 10);
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Shing Studio Configuration Backup',
    defaultPath: `shing-settings-backup-${dateStr}.json`,
    filters: [{ name: 'JSON Backup', extensions: ['json'] }]
  });

  if (res.canceled || !res.filePath) return { canceled: true };

  fs.writeFileSync(res.filePath, JSON.stringify(currentSettings, null, 2), 'utf8');
  return { success: true, filePath: res.filePath };
});

// Settings Import / Restore
ipcMain.handle('settings:import', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Shing Studio Configuration Backup',
    filters: [{ name: 'JSON Backup', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (res.canceled || !res.filePaths.length) return { canceled: true };

  const targetPath = res.filePaths[0];
  try {
    const raw = fs.readFileSync(targetPath, 'utf8').replace(/^\uFEFF/, '');
    const importedSettings = JSON.parse(raw);

    const saved = overlayServer.saveSettings(importedSettings);
    if (mainWindow) {
      mainWindow.webContents.send('settings:loaded', saved);
    }
    return { success: true, settings: saved, filePath: targetPath };
  } catch (err) {
    return { success: false, error: 'Invalid configuration file: ' + err.message };
  }
});

function fetchTikTokProfile(username) {
  return new Promise((resolve) => {
    const clean = (username || '').replace(/^@/, '').trim();
    if (!clean) return resolve(null);
    const options = {
      hostname: 'www.tiktok.com',
      path: `/@${encodeURIComponent(clean)}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 3500
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 500000) req.destroy();
      });
      res.on('end', () => {
        try {
          const mAvatar = body.match(/"avatarLarger":"(https:[^"]+)"/) ||
                          body.match(/"avatarMedium":"(https:[^"]+)"/) ||
                          body.match(/"avatarThumb":"(https:[^"]+)"/);
          const mNick = body.match(/"nickname":"([^"]+)"/);
          const mBio = body.match(/"signature":"([^"]+)"/);

          const avatar = mAvatar ? mAvatar[1].replace(/\\u002F/g, '/') : null;
          const nickname = mNick ? mNick[1].replace(/\\u002F/g, '/') : null;
          const bio = mBio ? mBio[1].replace(/\\u002F/g, '/') : null;

          if (avatar || nickname) {
            return resolve({ avatar, nickname, bio });
          }
        } catch (e) {}
        resolve(null);
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      try { req.destroy(); } catch (e) {}
      resolve(null);
    });
    req.end();
  });
}

// TikTok User Search & Profile lookup
ipcMain.handle('tiktok:search', async (evt, username) => {
  const cleanUser = (username || 'shimmy_ming').replace(/^@/, '').trim();
  const defaultAvatar = '../assets/avatar.png';

  let profile = null;
  try {
    profile = await fetchTikTokProfile(cleanUser);
  } catch (e) {}

  return {
    success: true,
    uniqueId: cleanUser,
    nickname: profile?.nickname || (cleanUser.toLowerCase() === 'shimmy_ming' ? 'Shimmy Ming' : cleanUser),
    avatar: profile?.avatar || defaultAvatar,
    bio: profile?.bio || 'TikTok Live Streamer',
    isDefault: cleanUser.toLowerCase() === 'shimmy_ming'
  };
});

let currentTargetUser = null;
let reconnectTimer = null;
let isConnecting = false;
let connectAttemptId = 0;
let TikTokConnector = null;
let lastTikTokStatus = {
  status: 'disconnected',
  username: 'shimmy_ming',
  message: 'Disconnected. Click Connect to connect to your TikTok Live stream.'
};

function sendTikTokStatus(payload) {
  lastTikTokStatus = Object.assign({ username: currentTargetUser || overlayServer?.settings?.username || 'shimmy_ming' }, payload);
  if (overlayServer) {
    overlayServer.tiktokStatus = lastTikTokStatus;
    overlayServer.broadcast(Object.assign({ type: 'tiktok:status' }, lastTikTokStatus));
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tiktok:status', lastTikTokStatus);
  }
}

function sanitizeTikTokUsername(input) {
  if (!input) return '';
  const str = String(input).trim();
  const urlMatch = str.match(/(?:tiktok\.com\/@|@)([\w.-]+)/i);
  if (urlMatch) {
    return urlMatch[1];
  }
  return str.replace(/^@/, '').replace(/\/.*$/, '').trim();
}

async function getTikTokConnector() {
  if (!TikTokConnector) {
    TikTokConnector = await import('tiktok-live-connector');
  }
  return TikTokConnector;
}

async function stopTikTokConnection() {
  connectAttemptId++;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const oldConn = tiktokConnection;
  tiktokConnection = null;
  isConnected = false;
  isConnecting = false;
  if (oldConn) {
    try {
      await oldConn.disconnect();
    } catch (e) {}
  }
}

function attachTikTokListeners(conn, targetUser, WebcastEvent) {
  conn.on(WebcastEvent.CHAT, data => {
    const viewerName = data.user?.nickname || data.nickname || data.user?.displayId || data.uniqueId || 'Viewer';
    const username = (data.user?.displayId || data.uniqueId || '').toLowerCase();
    let role = 'viewer';
    if (username === targetUser.toLowerCase() || viewerName.toLowerCase() === targetUser.toLowerCase()) role = 'streamer';
    else if (data.user?.userAttr?.isAdmin || data.isModerator) role = 'moderator';
    else if (data.user?.isSubscribe || data.isSubscriber) role = 'subscriber';
    else if (data.isTopGifter || data.topGifter) role = 'top_gifter';

    const avatar = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl || '../assets/avatar.png';
    const commentText = data.content || data.comment || '';

    const payload = {
      type: 'chat',
      user: viewerName,
      nickname: viewerName,
      username: data.user?.displayId || data.uniqueId || '',
      comment: commentText,
      avatar: avatar,
      badge: data.userBadges?.[0]?.name || (role !== 'viewer' ? role.replace('_', ' ') : null),
      role
    };
    overlayServer.broadcast(payload);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('tiktok:event', payload);
  });

  conn.on(WebcastEvent.GIFT, data => {
    const viewerName = data.user?.nickname || data.nickname || data.user?.displayId || data.uniqueId || 'Viewer';
    const avatar = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl || '../assets/avatar.png';

    const rawGiftName = data.gift?.name || data.giftName || data.extendedGiftInfo?.name || 'Gift';
    const safeKey = rawGiftName.toLowerCase().replace(/\s+/g, '_');

    let giftPic = data.gift?.image?.urlList?.[0] ||
                  data.gift?.icon?.urlList?.[0] ||
                  data.giftPictureUrl ||
                  data.extendedGiftInfo?.image?.url_list?.[0] ||
                  data.extendedGiftInfo?.icon?.url_list?.[0] ||
                  data.image?.url_list?.[0] || null;

    if (!giftPic && giftCatalog.length > 0) {
      const match = giftCatalog.find(g => (data.giftId && g.id === data.giftId) || (g.name && g.name.toLowerCase() === rawGiftName.toLowerCase()));
      if (match) giftPic = match.image;
    }

    if (!giftPic) {
      const localPath = path.join(__dirname, 'assets', 'gifts', `${safeKey}.png`);
      if (fs.existsSync(localPath)) giftPic = `/assets/gifts/${safeKey}.png`;
    }

    const coinCount = data.gift?.diamondCount || data.fanTicketCount || data.diamondCount || data.extendedGiftInfo?.diamond_count || data.coins || 1;
    const repeatCount = data.repeatCount || data.count || 1;

    const payload = {
      type: 'gift',
      user: viewerName,
      nickname: viewerName,
      username: data.user?.displayId || data.uniqueId || '',
      giftId: safeKey,
      giftName: rawGiftName,
      giftPictureUrl: giftPic,
      count: repeatCount,
      coins: coinCount,
      diamonds: coinCount,
      avatar: avatar
    };
    overlayServer.broadcast(payload);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('tiktok:event', payload);
  });

  conn.on(WebcastEvent.LIKE, data => {
    const viewerName = data.user?.nickname || data.nickname || data.user?.displayId || data.uniqueId || 'Viewer';
    const avatar = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl || '../assets/avatar.png';
    const payload = {
      type: 'like',
      user: viewerName,
      nickname: viewerName,
      username: data.user?.displayId || data.uniqueId || '',
      count: data.count || data.likeCount || 1,
      totalLikes: data.total || data.totalLikeCount || 0,
      avatar: avatar
    };
    overlayServer.broadcast(payload);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('tiktok:event', payload);
  });

  conn.on(WebcastEvent.MEMBER, data => {
    const viewerName = data.user?.nickname || data.nickname || data.user?.displayId || data.uniqueId || 'Viewer';
    const avatar = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl || '../assets/avatar.png';
    const payload = {
      type: 'join',
      user: viewerName,
      nickname: viewerName,
      username: data.user?.displayId || data.uniqueId || '',
      avatar: avatar
    };
    overlayServer.broadcast(payload);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('tiktok:event', payload);
  });

  conn.on(WebcastEvent.FOLLOW, data => {
    const viewerName = data.user?.nickname || data.nickname || data.user?.displayId || data.uniqueId || 'Viewer';
    const avatar = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl || '../assets/avatar.png';
    const payload = {
      type: 'follow',
      user: viewerName,
      nickname: viewerName,
      username: data.user?.displayId || data.uniqueId || '',
      avatar: avatar
    };
    overlayServer.broadcast(payload);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('tiktok:event', payload);
  });

  conn.on(WebcastEvent.SHARE, data => {
    const viewerName = data.user?.nickname || data.nickname || data.user?.displayId || data.uniqueId || 'Viewer';
    const avatar = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl || '../assets/avatar.png';
    const payload = {
      type: 'share',
      user: viewerName,
      nickname: viewerName,
      username: data.user?.displayId || data.uniqueId || '',
      avatar: avatar
    };
    overlayServer.broadcast(payload);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('tiktok:event', payload);
  });

  conn.on(WebcastEvent.DISCONNECTED, () => {
    if (tiktokConnection !== conn) return;
    isConnected = false;
    isConnecting = false;
    console.log(`Stream disconnected for @${targetUser}. Resuming background auto-reconnect...`);
    sendTikTokStatus({
      status: 'waiting',
      username: targetUser,
      manual: false,
      message: 'Live stream ended or disconnected. Click Connect to reconnect manually, or wait for auto-reconnect.'
    });
    if (!reconnectTimer && currentTargetUser === targetUser) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        attemptConnect(targetUser, false);
      }, 8000);
    }
  });

  conn.on(WebcastEvent.STREAM_END, () => {
    if (tiktokConnection !== conn) return;
    isConnected = false;
    isConnecting = false;
    console.log(`Stream ended for @${targetUser}. Resuming background auto-reconnect...`);
    sendTikTokStatus({
      status: 'waiting',
      username: targetUser,
      manual: false,
      message: `@${targetUser}'s live stream ended. Click Connect when you go live again.`
    });
    if (!reconnectTimer && currentTargetUser === targetUser) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        attemptConnect(targetUser, false);
      }, 10000);
    }
  });

  conn.on(WebcastEvent.ERROR, err => {
    console.warn(`Connection note for @${targetUser}:`, err.message || err);
  });
}

async function attemptConnect(targetUser, isManual = false) {
  if (!targetUser) {
    return { success: false, status: 'disconnected' };
  }
  if (!isManual && (isConnected || isConnecting)) {
    return lastTikTokStatus;
  }

  const attemptId = ++connectAttemptId;
  isConnecting = true;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  sendTikTokStatus({
    status: 'connecting',
    username: targetUser,
    manual: Boolean(isManual),
    message: `Connecting to @${targetUser}'s TikTok Live stream...`
  });

  let conn = null;
  let connectTimeout = null;
  try {
    const { TikTokLiveConnection, WebcastEvent } = await getTikTokConnector();
    if (attemptId !== connectAttemptId || currentTargetUser !== targetUser) {
      return { success: false, status: 'aborted', username: targetUser };
    }

    if (tiktokConnection) {
      try { await tiktokConnection.disconnect(); } catch (e) {}
      tiktokConnection = null;
    }

    conn = new TikTokLiveConnection(targetUser, {
      processInitialData: false,
      fetchRoomInfoOnConnect: false,
      enableExtendedGiftInfo: false
    });
    tiktokConnection = conn;

    attachTikTokListeners(conn, targetUser, WebcastEvent);

    const isRoomIdNumeric = /^\d{10,}$/.test(targetUser);
    const connectPromise = isRoomIdNumeric ? conn.connect(targetUser) : conn.connect();
    const timeoutPromise = new Promise((_, reject) => {
      connectTimeout = setTimeout(() => {
        reject(new Error('Connection timed out after 15 seconds'));
      }, 15000);
    });

    const state = await Promise.race([connectPromise, timeoutPromise]);
    if (connectTimeout) clearTimeout(connectTimeout);

    if (attemptId !== connectAttemptId || tiktokConnection !== conn || currentTargetUser !== targetUser) {
      try { await conn.disconnect(); } catch (e) {}
      return { success: false, status: 'aborted', username: targetUser };
    }

    isConnecting = false;
    isConnected = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    console.log(`Successfully connected to TikTok Live for @${targetUser} (Room: ${state.roomId})`);
    const connectedPayload = {
      success: true,
      status: 'connected',
      roomId: state.roomId,
      username: targetUser,
      manual: Boolean(isManual),
      message: `Connected to @${targetUser}'s TikTok Live (Room: ${state.roomId || 'Active'})`
    };
    sendTikTokStatus(connectedPayload);
    return connectedPayload;
  } catch (err) {
    if (connectTimeout) clearTimeout(connectTimeout);
    if (conn && tiktokConnection === conn) {
      try { await conn.disconnect(); } catch (e) {}
      tiktokConnection = null;
    }
    if (attemptId !== connectAttemptId || currentTargetUser !== targetUser) {
      return { success: false, status: 'aborted', username: targetUser };
    }

    isConnecting = false;
    isConnected = false;

    const errMsg = err.message || 'not live';
    console.log(`@${targetUser} is offline (${errMsg}). Auto-checking again in 10s...`);
    const waitingPayload = {
      success: false,
      status: 'waiting',
      username: targetUser,
      manual: Boolean(isManual),
      error: errMsg,
      message: `@${targetUser} is not live yet. Click Connect when you start streaming, or wait for auto-connect.`
    };
    sendTikTokStatus(waitingPayload);

    if (!reconnectTimer && currentTargetUser === targetUser) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        attemptConnect(targetUser, false);
      }, 10000);
    }
    return waitingPayload;
  }
}

// TikTok Connect
ipcMain.handle('tiktok:connect', async (evt, username, options = {}) => {
  const isManual = Boolean(options && options.manual);
  const cleanUser = sanitizeTikTokUsername(username || overlayServer?.settings?.username || 'shimmy_ming');
  currentTargetUser = cleanUser;
  await stopTikTokConnection();
  currentTargetUser = cleanUser;

  if (isManual) {
    return await attemptConnect(cleanUser, true);
  }
  attemptConnect(cleanUser, false);
  return { success: true, status: 'connecting', username: cleanUser };
});

// TikTok Disconnect
ipcMain.handle('tiktok:disconnect', async () => {
  const prevUser = currentTargetUser || overlayServer?.settings?.username || 'shimmy_ming';
  currentTargetUser = null;
  await stopTikTokConnection();
  sendTikTokStatus({
    status: 'disconnected',
    username: prevUser,
    manual: true,
    message: 'Disconnected from TikTok Live. Click Connect to manually connect.'
  });
  return { success: true, status: 'disconnected', username: prevUser };
});

// TikTok Status Query
ipcMain.handle('tiktok:status:get', () => {
  return lastTikTokStatus;
});

if (overlayServer) {
  overlayServer.tiktokStatus = lastTikTokStatus;
  overlayServer.onConnectRequest = async (username, options = {}) => {
    const isManual = Boolean(options && options.manual);
    const cleanUser = sanitizeTikTokUsername(username || overlayServer?.settings?.username || 'shimmy_ming');
    currentTargetUser = cleanUser;
    await stopTikTokConnection();
    currentTargetUser = cleanUser;
    if (isManual) {
      return await attemptConnect(cleanUser, true);
    }
    attemptConnect(cleanUser, false);
    return { success: true, status: 'connecting', username: cleanUser };
  };
  overlayServer.onDisconnectRequest = async () => {
    const prevUser = currentTargetUser || overlayServer?.settings?.username || 'shimmy_ming';
    currentTargetUser = null;
    await stopTikTokConnection();
    sendTikTokStatus({
      status: 'disconnected',
      username: prevUser,
      manual: true,
      message: 'Disconnected from TikTok Live. Click Connect to manually connect.'
    });
    return { success: true, status: 'disconnected', username: prevUser };
  };
}

// Event Simulator (fires test follow, gift, like, chat, join)
ipcMain.handle('tiktok:simulate', (evt, type, payload) => {
  const viewerName = payload.nickname || payload.user || payload.uniqueId || 'Viewer';
  let giftPic = payload.giftPictureUrl || null;

  if (type === 'gift' && !giftPic) {
    const rawKey = (payload.giftId || payload.giftName || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const localFile = path.join(__dirname, 'assets', 'gifts', `${rawKey}.png`);
    if (fs.existsSync(localFile)) {
      giftPic = `/assets/gifts/${rawKey}.png`;
    } else if (giftCatalog.length > 0) {
      const match = giftCatalog.find(g => String(g.id) === String(payload.giftId) || (g.name && payload.giftName && g.name.toLowerCase() === payload.giftName.toLowerCase()));
      if (match && match.image) giftPic = match.image;
    }
  }

  const event = Object.assign({ type }, payload, {
    user: viewerName,
    nickname: viewerName,
    username: payload.username || payload.uniqueId || '',
    giftPictureUrl: giftPic || payload.giftPictureUrl || null
  });
  overlayServer.broadcast(event);
  if (mainWindow) mainWindow.webContents.send('tiktok:event', event);
  return { success: true };
});

// Sound Management IPC Handlers
ipcMain.handle('sounds:list', () => {
  const dirs = [
    path.join(__dirname, 'assets', 'sounds'),
    path.join(overlayServer ? overlayServer.userDataDir : app.getPath('userData'), 'sounds')
  ];
  const seen = new Set();
  const list = [];
  for (const d of dirs) {
    try {
      if (!fs.existsSync(d)) continue;
      const files = fs.readdirSync(d).filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f));
      for (const f of files) {
        if (seen.has(f)) continue;
        seen.add(f);
        list.push({
          filename: f,
          name: path.basename(f, path.extname(f)).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          url: `/assets/sounds/${f}`
        });
      }
    } catch (_) {}
  }
  return list;
});

ipcMain.handle('sounds:search', async (evt, query) => {
  if (!query || !query.trim()) return [];
  const https = require('https');
  const searchUrl = `https://www.myinstants.com/en/search/?name=${encodeURIComponent(query.trim())}`;
  return new Promise((resolve) => {
    https.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, res => {
      let html = '';
      res.on('data', chunk => html += chunk);
      res.on('end', () => {
        const results = [];
        const regex = /<button class="small-button" onclick="play\('([^']+)'[^>]*title="([^"]*)"/g;
        let match;
        while ((match = regex.exec(html)) !== null && results.length < 24) {
          let title = match[2].replace(/^Play\s+/i, '').replace(/\s+sound$/i, '').trim();
          let soundUrl = match[1].startsWith('http') ? match[1] : 'https://www.myinstants.com' + match[1];
          results.push({ title, soundUrl });
        }
        resolve(results);
      });
    }).on('error', () => resolve([]));
  });
});

ipcMain.handle('sounds:download', async (evt, soundUrl, title) => {
  if (!soundUrl) throw new Error('Missing soundUrl');
  const https = require('https');
  const http = require('http');
  const cleanTitle = (title || 'sound').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const ext = path.extname(new URL(soundUrl).pathname) || '.mp3';
  const filename = `${cleanTitle}${ext}`;
  const soundsDir = path.join(overlayServer ? overlayServer.userDataDir : app.getPath('userData'), 'sounds');
  if (!fs.existsSync(soundsDir)) fs.mkdirSync(soundsDir, { recursive: true });
  const destPath = path.join(soundsDir, filename);

  return new Promise((resolve, reject) => {
    const client = soundUrl.startsWith('https') ? https : http;
    client.get(soundUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve({
          success: true,
          name: title || cleanTitle,
          filename,
          url: `/assets/sounds/${filename}`
        });
      });
    }).on('error', reject);
  });
});

ipcMain.handle('sounds:select-local', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Alert Sound File',
    filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };

  const srcPath = res.filePaths[0];
  const origName = path.basename(srcPath);
  const cleanBase = path.basename(origName, path.extname(origName)).replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = path.extname(origName).toLowerCase();
  const filename = `custom_${cleanBase}${ext}`;
  const soundsDir = path.join(overlayServer ? overlayServer.userDataDir : app.getPath('userData'), 'sounds');
  if (!fs.existsSync(soundsDir)) fs.mkdirSync(soundsDir, { recursive: true });
  const destPath = path.join(soundsDir, filename);

  fs.copyFileSync(srcPath, destPath);
  return {
    success: true,
    name: path.basename(origName, ext).replace(/_/g, ' '),
    filename,
    url: `/assets/sounds/${filename}`
  };
});

// Media (Video / Photo / GIF) Selection for Trigger Alerts
ipcMain.handle('media:select-local', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Alert Video, Photo, or GIF',
    filters: [
      { name: 'Videos & Images (MP4, WebM, GIF, PNG, JPG, WebP)', extensions: ['mp4', 'webm', 'mov', 'gif', 'png', 'jpg', 'jpeg', 'webp'] },
      { name: 'Videos (MP4, WebM, MOV)', extensions: ['mp4', 'webm', 'mov'] },
      { name: 'Photos & GIFs (GIF, PNG, JPG, WebP)', extensions: ['gif', 'png', 'jpg', 'jpeg', 'webp'] }
    ],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };

  const srcPath = res.filePaths[0];
  const origName = path.basename(srcPath);
  const ext = path.extname(origName).toLowerCase();
  const cleanBase = path.basename(origName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `media_${Date.now()}_${cleanBase}${ext}`;
  const mediaDir = path.join(overlayServer ? overlayServer.userDataDir : app.getPath('userData'), 'media');
  if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
  const destPath = path.join(mediaDir, filename);

  fs.copyFileSync(srcPath, destPath);
  const mediaType = /\.(mp4|webm|mov)$/i.test(ext) ? 'video' : 'image';
  return {
    success: true,
    name: origName,
    filename,
    url: `/media/${filename}`,
    mediaType
  };
});

// Rankings IPC Handlers (Top Likers & Viewer Stay Ranking)
ipcMain.handle('rankings:get', () => {
  return overlayServer ? overlayServer.getRankingsSnapshot() : { topLikers: [], viewerRanking: [] };
});

ipcMain.handle('rankings:reset', (evt, target) => {
  if (!overlayServer) return { success: false };
  if (target === 'likers' || target === 'all') overlayServer.topLikers.clear();
  if (target === 'viewers' || target === 'all') overlayServer.viewerStay.clear();
  overlayServer.broadcastRankings();
  return { success: true, rankings: overlayServer.getRankingsSnapshot() };
});

ipcMain.handle('rankings:leave', (evt, username) => {
  if (!overlayServer) return { success: false };
  overlayServer.processRankingEvent({ type: 'leave', username, user: username });
  return { success: true, rankings: overlayServer.getRankingsSnapshot() };
});

// Timer control
ipcMain.handle('timer:control', (evt, action, seconds) => {
  const payload = { type: 'timer:control', action, seconds };
  overlayServer.broadcast(payload);
  return { success: true };
});

// Clear jar
ipcMain.handle('jar:clear', () => {
  const payload = { type: 'clearJar' };
  overlayServer.broadcast(payload);
  return { success: true };
});

// Open overlay URL in external browser
ipcMain.handle('overlay:open', (evt, name) => {
  const clean = String(name || '').replace(/\.html?$/i, '');
  const url = `http://localhost:${PORT}/overlays/${clean}.html`;
  shell.openExternal(url);
  return { success: true, url };
});

// App Updater Handlers
ipcMain.handle('updater:get-version', () => {
  return {
    version: updater.getCurrentVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch
  };
});

ipcMain.handle('updater:check', async (evt, feedUrl) => {
  return await updater.checkForUpdates(feedUrl);
});

ipcMain.handle('updater:download', async (evt, updateInfo) => {
  return await updater.downloadUpdate(updateInfo, progress => {
    if (mainWindow) mainWindow.webContents.send('updater:progress', progress);
  });
});

ipcMain.handle('updater:install', async (evt, updateInfo) => {
  const result = await updater.applyUpdate(updateInfo);
  return result;
});

ipcMain.handle('updater:select-file', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Shing Studio Update Package (.zip)',
    filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const zipPath = res.filePaths[0];
  return await updater.applyLocalZip(zipPath);
});

ipcMain.handle('updater:relaunch', () => {
  if (tiktokConnection) {
    try { tiktokConnection.disconnect(); } catch (e) {}
  }
  if (overlayServer) {
    try { overlayServer.stop(); } catch (e) {}
  }
  updater.relaunch();
  return { success: true };
});

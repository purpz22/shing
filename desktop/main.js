'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1040,
    minHeight: 680,
    title: 'Shing Studio - TikTok Live Streamer Companion',
    icon: path.join(__dirname, 'assets', 'app-icon.png'),
    backgroundColor: '#f6f0ff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
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

// TikTok User Search & Profile lookup
ipcMain.handle('tiktok:search', async (evt, username) => {
  const cleanUser = (username || 'shimmy_ming').replace(/^@/, '').trim();
  const avatarPath = '/assets/avatar.png'; // default cute anime girl avatar provided by user

  // Return account card
  return {
    success: true,
    uniqueId: cleanUser,
    nickname: cleanUser === 'shimmy_ming' ? 'Shimmy Ming' : cleanUser,
    avatar: avatarPath,
    bio: 'TikTok Live Streamer',
    isDefault: cleanUser.toLowerCase() === 'shimmy_ming'
  };
});

// TikTok Connect
ipcMain.handle('tiktok:connect', async (evt, username) => {
  const cleanUser = (username || 'shimmy_ming').replace(/^@/, '').trim();
  if (tiktokConnection) {
    try { tiktokConnection.disconnect(); } catch (e) {}
    tiktokConnection = null;
  }

  try {
    const { WebcastPushConnection } = require('tiktok-live-connector');
    tiktokConnection = new WebcastPushConnection(cleanUser, {
      processInitialData: false,
      enableExtendedGiftInfo: true
    });

    tiktokConnection.connect().then(state => {
      isConnected = true;
      if (mainWindow) {
        mainWindow.webContents.send('tiktok:status', {
          status: 'connected',
          roomId: state.roomId,
          username: cleanUser
        });
      }
    }).catch(err => {
      isConnected = false;
      if (mainWindow) {
        mainWindow.webContents.send('tiktok:status', {
          status: 'offline',
          username: cleanUser,
          message: err.message || 'Streamer is currently offline. Test mode active!'
        });
      }
    });

    // Listeners
    tiktokConnection.on('chat', data => {
      const viewerName = data.nickname || data.uniqueId || 'Viewer';
      const username = (data.uniqueId || '').toLowerCase();
      let role = 'viewer';
      if (username === cleanUser.toLowerCase() || viewerName.toLowerCase() === cleanUser.toLowerCase()) role = 'streamer';
      else if (data.isModerator) role = 'moderator';
      else if (data.isSubscriber) role = 'subscriber';
      else if (data.isTopGifter || data.topGifter) role = 'top_gifter';

      const payload = {
        type: 'chat',
        user: viewerName,
        nickname: viewerName,
        username: data.uniqueId || '',
        comment: data.comment,
        avatar: data.profilePictureUrl || '/assets/avatar.png',
        badge: data.userBadges?.[0]?.name || (role !== 'viewer' ? role.replace('_', ' ') : null),
        role
      };
      overlayServer.broadcast(payload);
      if (mainWindow) mainWindow.webContents.send('tiktok:event', payload);
    });

    tiktokConnection.on('gift', data => {
      let giftPic = data.giftPictureUrl ||
                    data.extendedGiftInfo?.image?.url_list?.[0] ||
                    data.extendedGiftInfo?.icon?.url_list?.[0] ||
                    data.image?.url_list?.[0] || null;

      const safeKey = (data.giftName || 'rose').toLowerCase().replace(/\s+/g, '_');

      // Check catalog by ID or name
      if (!giftPic && giftCatalog.length > 0) {
        const match = giftCatalog.find(g => g.id === data.giftId || (g.name && data.giftName && g.name.toLowerCase() === data.giftName.toLowerCase()));
        if (match) giftPic = match.image;
      }

      // Check local bundled gift icons
      if (!giftPic) {
        const localPath = path.join(__dirname, 'assets', 'gifts', `${safeKey}.png`);
        if (fs.existsSync(localPath)) giftPic = `/assets/gifts/${safeKey}.png`;
      }

      const coinCount = data.diamondCount || data.extendedGiftInfo?.diamond_count || data.coins || 1;
      const viewerName = data.nickname || data.uniqueId || 'Viewer';
      const payload = {
        type: 'gift',
        user: viewerName,
        nickname: viewerName,
        username: data.uniqueId || '',
        giftId: safeKey,
        giftName: data.giftName || 'Gift',
        giftPictureUrl: giftPic,
        count: data.repeatCount || data.count || 1,
        coins: coinCount,
        diamonds: coinCount,
        avatar: data.profilePictureUrl || '/assets/avatar.png'
      };
      overlayServer.broadcast(payload);
      if (mainWindow) mainWindow.webContents.send('tiktok:event', payload);
    });

    tiktokConnection.on('like', data => {
      const viewerName = data.nickname || data.uniqueId || 'Viewer';
      const payload = {
        type: 'like',
        user: viewerName,
        nickname: viewerName,
        username: data.uniqueId || '',
        count: data.likeCount || 1,
        totalLikes: data.totalLikeCount || 0
      };
      overlayServer.broadcast(payload);
      if (mainWindow) mainWindow.webContents.send('tiktok:event', payload);
    });

    tiktokConnection.on('member', data => {
      const viewerName = data.nickname || data.uniqueId || 'Viewer';
      const payload = {
        type: 'join',
        user: viewerName,
        nickname: viewerName,
        username: data.uniqueId || '',
        avatar: data.profilePictureUrl || '/assets/avatar.png'
      };
      overlayServer.broadcast(payload);
      if (mainWindow) mainWindow.webContents.send('tiktok:event', payload);
    });

    tiktokConnection.on('follow', data => {
      const viewerName = data.nickname || data.uniqueId || 'Viewer';
      const payload = {
        type: 'follow',
        user: viewerName,
        nickname: viewerName,
        username: data.uniqueId || '',
        avatar: data.profilePictureUrl || '/assets/avatar.png'
      };
      overlayServer.broadcast(payload);
      if (mainWindow) mainWindow.webContents.send('tiktok:event', payload);
    });

    tiktokConnection.on('share', data => {
      const viewerName = data.nickname || data.uniqueId || 'Viewer';
      const payload = {
        type: 'share',
        user: viewerName,
        nickname: viewerName,
        username: data.uniqueId || ''
      };
      overlayServer.broadcast(payload);
      if (mainWindow) mainWindow.webContents.send('tiktok:event', payload);
    });

    tiktokConnection.on('disconnected', () => {
      isConnected = false;
      if (mainWindow) mainWindow.webContents.send('tiktok:status', { status: 'disconnected', username: cleanUser });
    });

    return { success: true, status: 'connecting', username: cleanUser };
  } catch (e) {
    console.warn('TikTok Live Connector initialization note:', e.message);
    if (mainWindow) {
      mainWindow.webContents.send('tiktok:status', {
        status: 'offline',
        username: cleanUser,
        message: 'Live stream listener initialized in offline test mode.'
      });
    }
    return { success: true, status: 'test-mode', username: cleanUser };
  }
});

// TikTok Disconnect
ipcMain.handle('tiktok:disconnect', () => {
  if (tiktokConnection) {
    try { tiktokConnection.disconnect(); } catch (e) {}
    tiktokConnection = null;
  }
  isConnected = false;
  if (mainWindow) mainWindow.webContents.send('tiktok:status', { status: 'disconnected' });
  return { success: true };
});

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
  const soundsDir = path.join(__dirname, 'assets', 'sounds');
  if (!fs.existsSync(soundsDir)) fs.mkdirSync(soundsDir, { recursive: true });
  try {
    const files = fs.readdirSync(soundsDir).filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f));
    return files.map(f => ({
      filename: f,
      name: path.basename(f, path.extname(f)).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      url: `/assets/sounds/${f}`
    }));
  } catch (e) {
    return [];
  }
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
  const soundsDir = path.join(__dirname, 'assets', 'sounds');
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
  const soundsDir = path.join(__dirname, 'assets', 'sounds');
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
  const url = `http://localhost:${PORT}/overlays/${name}`;
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
  updater.relaunch();
  return { success: true };
});

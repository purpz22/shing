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
let directPollTimer = null;
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
    const { RouteConfig, IsLiveRouteConfig, RoomIdRouteConfig } = TikTokConnector;
    if (IsLiveRouteConfig) {
      IsLiveRouteConfig.skipFetchRoomIdFromEulerRoute = true;
    }
    if (RoomIdRouteConfig) {
      RoomIdRouteConfig.skipFetchRoomIdFromEulerRoute = true;
    }
    if (RouteConfig) {
      RouteConfig.fetchRoomInfo = async ({ webClient, roomId = webClient.roomId }) => {
        if (!roomId) throw new Error('Missing roomId for fetchRoomInfo');
        return await webClient.getJsonObjectFromWebcastApi('room/info/', {
          ...webClient.clientParams,
          room_id: roomId,
          aid: '8311'
        }, false);
      };
      RouteConfig.fetchRoomGifts = async ({ webClient, roomId = webClient.roomId }) => {
        if (!roomId) throw new Error('Missing roomId for fetchRoomGifts');
        const res = await webClient.getJsonObjectFromWebcastApi('gift/list/', {
          ...webClient.clientParams,
          room_id: roomId,
          aid: '8311'
        }, false);
        const list = [...(res?.data?.gifts || [])];
        if (Array.isArray(res?.data?.pages)) {
          for (const page of res.data.pages) {
            if (Array.isArray(page?.gifts)) list.push(...page.gifts);
          }
        }
        const existingIds = new Set(giftCatalog.map(g => String(g.id)));
        for (const g of list) {
          if (!g || !g.id) continue;
          const imgUrl = g.image?.url_list?.[0] || g.icon?.url_list?.[0] || null;
          if (!imgUrl) continue;
          const entry = {
            id: g.id,
            name: g.name || `Gift ${g.id}`,
            diamonds: g.diamond_count || 1,
            image: imgUrl
          };
          if (overlayServer?.dynamicGifts) {
            overlayServer.dynamicGifts.set(String(g.id), entry);
          }
          if (!existingIds.has(String(g.id))) {
            giftCatalog.push(entry);
            existingIds.add(String(g.id));
          }
        }
        return list;
      };
    }
  }
  return TikTokConnector;
}

function stopDirectWebcastPolling() {
  if (directPollTimer) {
    clearTimeout(directPollTimer);
    directPollTimer = null;
  }
}

async function stopTikTokConnection() {
  connectAttemptId++;
  stopDirectWebcastPolling();
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

async function registerDirectTtwidCookie(conn) {
  try {
    const res = await fetch('https://ttwid.bytedance.com/ttwid/union/register/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        region: 'US',
        aid: 1768,
        needFid: false,
        service: 'www.ixigua.com',
        migrate_info: { ticket: '', source: 'node' },
        cbUrlProtocol: 'https',
        union: true
      })
    });
    const setCookies = typeof res.headers?.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers?.get?.('set-cookie')].filter(Boolean);
    for (const sc of setCookies) {
      const cookiePair = String(sc).split(';')[0];
      if (cookiePair && conn?.webClient?.cookieJar) {
        await conn.webClient.cookieJar.processSetCookieHeader(cookiePair);
      }
    }
  } catch (err) {
    console.warn('Failed to register direct ttwid cookie:', err.message);
  }
}

async function startDirectWebcastPolling(conn, roomId, targetUser, attemptId, WebcastEvent, deserializeMessage) {
  stopDirectWebcastPolling();
  if (conn?.webClient) {
    conn.webClient.roomId = roomId;
  }
  await registerDirectTtwidCookie(conn);

  try {
    conn._availableGifts = await conn.fetchAvailableGifts();
  } catch (e) {}

  const seenMsgIds = new Set();
  const seenMsgQueue = [];
  const rememberMsgId = (id) => {
    if (!id || seenMsgIds.has(id)) return false;
    seenMsgIds.add(id);
    seenMsgQueue.push(id);
    if (seenMsgQueue.length > 1500) {
      const oldest = seenMsgQueue.shift();
      seenMsgIds.delete(oldest);
    }
    return true;
  };

  const fetchBatch = async (cursor, internalExt) => {
    const res = await conn.webClient.request({
      host: 'webcast.tiktok.com',
      path: 'webcast/im/fetch/',
      searchParams: {
        room_id: roomId,
        aid: '1233',
        resp_content_type: 'protobuf',
        version_code: '180800',
        did_rule: '3',
        cursor: cursor || '',
        internal_ext: internalExt || '',
        identity: 'audience',
        live_id: '12',
        fetch_rule: '1'
      },
      signRequest: false,
      responseType: 'buffer'
    });
    if (!res?.body || res.body.length === 0) {
      return null;
    }
    return deserializeMessage('ProtoMessageFetchResult', res.body);
  };

  let initialFetch = await fetchBatch('', '');
  if (!initialFetch) {
    await registerDirectTtwidCookie(conn);
    initialFetch = await fetchBatch('', '');
  }
  if (!initialFetch) {
    throw new Error('Direct TikTok Webcast handshake returned empty payload');
  }

  for (const msg of initialFetch.messages || []) {
    if (msg?.msgId) rememberMsgId(msg.msgId);
  }

  let cursor = initialFetch.cursor || '';
  let internalExt = initialFetch.internalExt || '';
  let pollCount = 0;
  let emptyStreak = 0;
  conn._connectState = 'CONNECTED';

  // Replay up to the 3 most recent chat messages from initial room snapshot so chat overlay populates immediately
  const initialChatMessages = (initialFetch.messages || [])
    .filter(m => m?.method === 'WebcastChatMessage')
    .slice(-3);
  if (initialChatMessages.length > 0) {
    setTimeout(() => {
      if (attemptId === connectAttemptId && tiktokConnection === conn && currentTargetUser === targetUser) {
        conn.processProtoMessageFetchResult({
          ...initialFetch,
          messages: initialChatMessages
        }).catch(() => {});
      }
    }, 250);
  }

  const scheduleNextPoll = (delayMs = 1500) => {
    if (attemptId !== connectAttemptId || tiktokConnection !== conn || currentTargetUser !== targetUser) {
      return;
    }
    directPollTimer = setTimeout(runPoll, delayMs);
  };

  const runPoll = async () => {
    if (attemptId !== connectAttemptId || tiktokConnection !== conn || currentTargetUser !== targetUser) {
      return;
    }
    pollCount++;
    let nextInterval = 1500;
    try {
      const fetched = await fetchBatch(cursor, internalExt);
      if (attemptId !== connectAttemptId || tiktokConnection !== conn || currentTargetUser !== targetUser) {
        return;
      }
      if (fetched) {
        emptyStreak = 0;
        if (fetched.cursor) cursor = fetched.cursor;
        if (fetched.internalExt) internalExt = fetched.internalExt;
        const parsedInterval = Number(fetched.fetchInterval);
        if (Number.isFinite(parsedInterval) && parsedInterval >= 1000 && parsedInterval <= 3000) {
          nextInterval = parsedInterval;
        }
        const freshMessages = (fetched.messages || []).filter(m => !m?.msgId || rememberMsgId(m.msgId));
        if (freshMessages.length > 0) {
          await conn.processProtoMessageFetchResult({
            ...fetched,
            messages: freshMessages
          });
        }
      } else {
        emptyStreak++;
        if (emptyStreak >= 3) {
          await registerDirectTtwidCookie(conn);
          emptyStreak = 0;
        }
      }

      if (pollCount % 10 === 0 && tiktokConnection === conn && isConnected) {
        try {
          const info = await conn.fetchRoomInfo(roomId);
          if (info?.data?.status === 4) {
            stopDirectWebcastPolling();
            conn.emit(WebcastEvent.STREAM_END, { action: 3 });
            return;
          }
        } catch (e) {}
      }
    } catch (err) {
      console.warn(`Direct webcast poll note for @${targetUser}:`, err.message || err);
    }

    if (tiktokConnection === conn && isConnected) {
      scheduleNextPoll(nextInterval);
    }
  };

  scheduleNextPoll(1500);
}

function attachTikTokListeners(conn, targetUser, WebcastEvent) {
  conn.on(WebcastEvent.CHAT, data => {
    const commentText = String(data.content || data.comment || '').trim();
    if (!commentText) return;

    const viewerName = data.user?.nickname || data.nickname || data.user?.displayId || data.uniqueId || 'Viewer';
    const username = (data.user?.displayId || data.uniqueId || '').toLowerCase();
    const identity = data.userIdentity || {};
    let role = 'viewer';
    if (
      identity.isAnchor ||
      username === targetUser.toLowerCase() ||
      viewerName.toLowerCase() === targetUser.toLowerCase()
    ) {
      role = 'streamer';
    } else if (identity.isModeratorOfAnchor || data.user?.userAttr?.isAdmin || data.isModerator) {
      role = 'moderator';
    } else if (
      identity.isSubscriberOfAnchor ||
      data.user?.subscribeInfo?.isSubscribed ||
      data.user?.isSubscribe ||
      data.isSubscriber
    ) {
      role = 'subscriber';
    } else if (identity.isGiftGiverOfAnchor || data.isTopGifter || data.topGifter) {
      role = 'top_gifter';
    }

    const avatar = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl || '/assets/avatar.png';

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

  const giftStreaks = new Map();

  conn.on(WebcastEvent.GIFT, data => {
    const viewerName = data.user?.nickname || data.nickname || data.user?.displayId || data.uniqueId || 'Viewer';
    const userKey = data.user?.id || data.user?.displayId || data.uniqueId || viewerName;
    const avatar = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl || '/assets/avatar.png';

    const rawGiftIdStr = (data.giftId !== undefined && data.giftId !== null && String(data.giftId) !== '0')
      ? String(data.giftId)
      : (data.gift?.id ? String(data.gift.id) : '');

    const roomGifts = Array.isArray(conn?.availableGifts)
      ? conn.availableGifts
      : (Array.isArray(conn?._availableGifts) ? conn._availableGifts : []);
    const roomGiftMatch = rawGiftIdStr
      ? roomGifts.find(g => String(g?.id) === rawGiftIdStr)
      : null;

    let rawGiftName = data.gift?.name ||
                      data.giftName ||
                      data.extendedGiftInfo?.name ||
                      roomGiftMatch?.name ||
                      '';

    const catalogMatch = giftCatalog.find(g =>
      (rawGiftIdStr && String(g.id) === rawGiftIdStr) ||
      (rawGiftName && g.name && g.name.toLowerCase() === rawGiftName.toLowerCase())
    );

    if (!rawGiftName && catalogMatch?.name) {
      rawGiftName = catalogMatch.name;
    }
    if (!rawGiftName) {
      rawGiftName = 'Gift';
    }

    const safeKey = rawGiftName.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'gift';

    let giftPic = data.gift?.image?.urlList?.[0] ||
                  data.gift?.icon?.urlList?.[0] ||
                  data.giftPictureUrl ||
                  data.extendedGiftInfo?.image?.url_list?.[0] ||
                  data.extendedGiftInfo?.icon?.url_list?.[0] ||
                  roomGiftMatch?.image?.url_list?.[0] ||
                  roomGiftMatch?.icon?.url_list?.[0] ||
                  catalogMatch?.image ||
                  data.image?.url_list?.[0] ||
                  null;

    if (!giftPic) {
      const localPath = path.join(__dirname, 'assets', 'gifts', `${safeKey}.png`);
      if (fs.existsSync(localPath)) giftPic = `/assets/gifts/${safeKey}.png`;
    }

    const coinCount = Number(
      data.gift?.diamondCount ||
      data.diamondCount ||
      data.extendedGiftInfo?.diamond_count ||
      roomGiftMatch?.diamond_count ||
      catalogMatch?.diamonds ||
      data.fanTicketCount ||
      data.coins ||
      1
    ) || 1;

    const totalRepeatCount = Math.max(1, Number(data.repeatCount || data.comboCount || data.count || 1));
    const isStreakable = (data.gift?.type === 1) || (data.giftType === 1) || Boolean(data.groupId && String(data.groupId) !== '0');
    const isRepeatEnd = Boolean(data.repeatEnd);
    const groupIdStr = (data.groupId && String(data.groupId) !== '0') ? String(data.groupId) : 'default';
    const streakKey = `${userKey}_${rawGiftIdStr || safeKey}_${groupIdStr}`;

    let jarDelta = totalRepeatCount;
    if (isStreakable) {
      const now = Date.now();
      const prev = giftStreaks.get(streakKey);
      if (prev && (now - prev.ts < 15000)) {
        if (totalRepeatCount > prev.count) {
          jarDelta = totalRepeatCount - prev.count;
          prev.count = totalRepeatCount;
          prev.ts = now;
        } else if (isRepeatEnd && totalRepeatCount <= prev.count) {
          // Final summary message for a streak whose taps were already dropped in real time
          giftStreaks.delete(streakKey);
          return;
        } else {
          jarDelta = 1;
          prev.count += 1;
          prev.ts = now;
        }
      } else {
        giftStreaks.set(streakKey, { count: totalRepeatCount, ts: now });
      }
      if (isRepeatEnd) {
        giftStreaks.delete(streakKey);
      }
      if (giftStreaks.size > 200) {
        for (const [k, v] of giftStreaks.entries()) {
          if (now - v.ts > 20000) giftStreaks.delete(k);
        }
      }
    }

    const payload = {
      type: 'gift',
      user: viewerName,
      nickname: viewerName,
      username: data.user?.displayId || data.uniqueId || '',
      giftId: safeKey,
      rawGiftId: rawGiftIdStr,
      giftName: rawGiftName,
      giftPictureUrl: giftPic,
      count: jarDelta,
      jarCount: jarDelta,
      comboTotal: totalRepeatCount,
      streakKey,
      streakActive: isStreakable && !isRepeatEnd,
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
    stopDirectWebcastPolling();
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
      }, 12000);
    }
  });

  conn.on(WebcastEvent.STREAM_END, () => {
    if (tiktokConnection !== conn) return;
    stopDirectWebcastPolling();
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
      }, 15000);
    }
  });

  conn.on(WebcastEvent.ERROR, err => {
    console.warn(`Connection note for @${targetUser}:`, err?.info || err?.message || err);
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
  stopDirectWebcastPolling();

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
    const { TikTokLiveConnection, WebcastEvent, deserializeMessage } = await getTikTokConnector();
    if (attemptId !== connectAttemptId || currentTargetUser !== targetUser) {
      return { success: false, status: 'aborted', username: targetUser };
    }

    if (tiktokConnection) {
      try { await tiktokConnection.disconnect(); } catch (e) {}
      tiktokConnection = null;
    }

    conn = new TikTokLiveConnection(targetUser, {
      processInitialData: false,
      fetchRoomInfoOnConnect: true,
      enableExtendedGiftInfo: true
    });
    tiktokConnection = conn;

    attachTikTokListeners(conn, targetUser, WebcastEvent);

    const isRoomIdNumeric = /^\d{10,}$/.test(targetUser);
    const resolvedRoomId = isRoomIdNumeric ? targetUser : await conn.fetchRoomId();
    if (attemptId !== connectAttemptId || tiktokConnection !== conn || currentTargetUser !== targetUser) {
      return { success: false, status: 'aborted', username: targetUser };
    }

    let roomInfo = null;
    try {
      roomInfo = await conn.fetchRoomInfo(resolvedRoomId);
    } catch (e) {}

    const roomStatus = roomInfo?.data?.status;
    if (roomStatus === 4) {
      throw new Error('USER_OFFLINE');
    }
    if (roomStatus === undefined && !isRoomIdNumeric) {
      const liveCheck = await conn.fetchIsLive().catch(() => false);
      if (!liveCheck) {
        throw new Error('USER_OFFLINE');
      }
    }

    let connectedRoomId = resolvedRoomId;
    let connectionMode = 'websocket';

    try {
      const connectPromise = conn.connect(resolvedRoomId);
      const timeoutPromise = new Promise((_, reject) => {
        connectTimeout = setTimeout(() => {
          reject(new Error('Connection timed out after 12 seconds'));
        }, 12000);
      });

      const state = await Promise.race([connectPromise, timeoutPromise]);
      if (connectTimeout) {
        clearTimeout(connectTimeout);
        connectTimeout = null;
      }
      connectedRoomId = state?.roomId || resolvedRoomId;
    } catch (wsErr) {
      if (connectTimeout) {
        clearTimeout(connectTimeout);
        connectTimeout = null;
      }
      if (attemptId !== connectAttemptId || tiktokConnection !== conn || currentTargetUser !== targetUser) {
        return { success: false, status: 'aborted', username: targetUser };
      }
      const wsErrText = String(wsErr?.message || wsErr || '');
      if (/isn't online|USER_OFFLINE/i.test(wsErrText)) {
        throw new Error('USER_OFFLINE');
      }
      console.log(`Sign server note for @${targetUser} (${wsErrText.split('\n')[0]}). Switching to Direct TikTok Webcast mode (Room: ${resolvedRoomId})...`);
      await startDirectWebcastPolling(conn, resolvedRoomId, targetUser, attemptId, WebcastEvent, deserializeMessage);
      connectionMode = 'direct';
    }

    if (attemptId !== connectAttemptId || tiktokConnection !== conn || currentTargetUser !== targetUser) {
      stopDirectWebcastPolling();
      try { await conn.disconnect(); } catch (e) {}
      return { success: false, status: 'aborted', username: targetUser };
    }

    isConnecting = false;
    isConnected = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    console.log(`Successfully connected to TikTok Live for @${targetUser} (Room: ${connectedRoomId}, Mode: ${connectionMode})`);
    const connectedPayload = {
      success: true,
      status: 'connected',
      mode: connectionMode,
      roomId: connectedRoomId,
      username: targetUser,
      manual: Boolean(isManual),
      message: `Connected to @${targetUser}'s TikTok Live (Room: ${connectedRoomId || 'Active'})`
    };
    sendTikTokStatus(connectedPayload);
    return connectedPayload;
  } catch (err) {
    if (connectTimeout) clearTimeout(connectTimeout);
    stopDirectWebcastPolling();
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
    const isOfflineErr = errMsg === 'USER_OFFLINE' || /not online|offline|not live/i.test(errMsg);
    console.log(`@${targetUser} is ${isOfflineErr ? 'offline' : 'waiting'} (${errMsg.split('\n')[0]}). Auto-checking again in 15s...`);
    const waitingPayload = {
      success: false,
      status: 'waiting',
      username: targetUser,
      manual: Boolean(isManual),
      error: isOfflineErr ? 'offline' : errMsg.split('\n')[0],
      message: isOfflineErr
        ? (isManual
          ? `@${targetUser} is currently offline on TikTok Live. Start your live stream first, then click Connect.`
          : `@${targetUser} is not live yet. Click Connect when you start streaming, or wait for auto-connect.`)
        : `Could not connect to @${targetUser} (${errMsg.split('\n')[0]}). Retrying in 15s...`
    };
    sendTikTokStatus(waitingPayload);

    if (!reconnectTimer && currentTargetUser === targetUser) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        attemptConnect(targetUser, false);
      }, 15000);
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

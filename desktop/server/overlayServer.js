'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

class OverlayServer {
  constructor(port = 3333, baseDir = path.resolve(__dirname, '..'), userDataDir = null) {
    this.port = port;
    this.baseDir = baseDir;
    this.userDataDir = userDataDir || this.resolveUserDataDir();
    this.server = null;
    this.wss = null;
    this.clients = new Set();
    this.topLikers = new Map();
    this.viewerStay = new Map();
    this.imageCache = new Map();
    this.dynamicGifts = new Map();
    this.cachedGiftCatalog = null;
    this.rankingTimer = null;
    this.settingsSaveTimer = null;
    this.streamTimerTicker = null;
    this.settings = this.loadSettings();
    if (!this.settings.jar) this.settings.jar = {};
    if (!this.settings.jar.transform) {
      this.settings.jar.transform = { x: 50.0, y: 82.0, scale: 1.0 };
    }
    if (!this.settings.rankings) this.settings.rankings = {};
    if (!this.settings.rankings.topLikersTheme) this.settings.rankings.topLikersTheme = 'Purple';
    if (this.settings.rankings.topLikersScale === undefined) this.settings.rankings.topLikersScale = 1.0;
    if (!this.settings.rankings.viewerRankingTheme) this.settings.rankings.viewerRankingTheme = 'Purple';
    if (this.settings.rankings.viewerRankingScale === undefined) this.settings.rankings.viewerRankingScale = 1.0;

    if (!this.settings.timer) this.settings.timer = {};
    if (this.settings.timer.durationMin === undefined) this.settings.timer.durationMin = 30;
    if (this.settings.timer.addSecondsPerGift === undefined) this.settings.timer.addSecondsPerGift = 15;
    if (this.settings.timer.reduceSecondsPerComment === undefined) this.settings.timer.reduceSecondsPerComment = 1;
    if (this.settings.timer.reduceSecondsPerLike === undefined) this.settings.timer.reduceSecondsPerLike = 0.1;
    if (!this.settings.timer.theme) this.settings.timer.theme = 'Purple';
    if (this.settings.timer.scale === undefined) this.settings.timer.scale = 1.0;

    if (!this.settings.triggers) this.settings.triggers = {};
    if (!this.settings.triggers.events) {
      this.settings.triggers.events = {
        follow: { active: true },
        gift: { active: true },
        gift_big: { active: true },
        like: { active: true },
        share: { active: true }
      };
    } else {
      const defaultEvents = {
        follow: { active: true },
        gift: { active: true },
        gift_big: { active: true },
        like: { active: true },
        share: { active: true }
      };
      for (const [k, v] of Object.entries(defaultEvents)) {
        if (!this.settings.triggers.events[k]) {
          this.settings.triggers.events[k] = v;
        }
      }
    }
    if (!this.settings.triggers.sounds) this.settings.triggers.sounds = {};
    if (!this.settings.triggers.sounds.share) this.settings.triggers.sounds.share = '/assets/sounds/chime.wav';
    if (!this.settings.triggers.sounds.gift_big) this.settings.triggers.sounds.gift_big = '/assets/sounds/fanfare.wav';
    if (this.settings.triggers.shareMessage === undefined) this.settings.triggers.shareMessage = 'Thank you {name} for sharing the stream!';
    if (this.settings.triggers.giftBigMessage === undefined) this.settings.triggers.giftBigMessage = 'LEGENDARY: {name} sent {gift} x{count}!';
    if (this.settings.triggers.likeMessage === undefined) this.settings.triggers.likeMessage = '{name} tapped {count} likes!';
    if (this.settings.triggers.shareMedia === undefined) this.settings.triggers.shareMedia = '';
    if (this.settings.triggers.shareMediaType === undefined) this.settings.triggers.shareMediaType = '';
    if (this.settings.triggers.giftBigMedia === undefined) this.settings.triggers.giftBigMedia = '';
    if (this.settings.triggers.giftBigMediaType === undefined) this.settings.triggers.giftBigMediaType = '';

    if (!this.settings.chat) this.settings.chat = {};
    if (!this.settings.chat.fontFamily) this.settings.chat.fontFamily = 'quicksand';

    const initialSec = Math.max(0, (Number(this.settings.timer.durationMin) || 30) * 60);
    this.timerState = {
      remainingSeconds: initialSec,
      initialSeconds: initialSec,
      isRunning: false,
      likeFractionAccumulator: 0
    };
  }

  resolveUserDataDir() {
    const appData = process.env.APPDATA || (process.platform === 'darwin'
      ? path.join(process.env.HOME || '', 'Library', 'Application Support')
      : path.join(process.env.HOME || '', '.config'));
    const dir = appData ? path.join(appData, 'Shing Live') : this.baseDir;
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (e) {
      return this.baseDir;
    }
    return dir;
  }

  getSettingsPath() {
    return path.join(this.userDataDir, 'settings.json');
  }

  getBackupPath() {
    return path.join(this.userDataDir, 'settings.json.bak');
  }

  getLegacySettingsPath() {
    return path.join(this.baseDir, 'settings.json');
  }

  getLegacyBackupPath() {
    return path.join(this.baseDir, 'settings.json.bak');
  }

  getSettings() {
    return this.settings;
  }

  deepMerge(defaults, current) {
    if (!current || typeof current !== 'object') return defaults;
    const output = Object.assign({}, defaults);
    for (const key of Object.keys(current)) {
      if (current[key] && typeof current[key] === 'object' && !Array.isArray(current[key])) {
        output[key] = this.deepMerge(defaults[key] || {}, current[key]);
      } else {
        output[key] = current[key];
      }
    }
    return output;
  }

  loadSettings() {
    const defaults = this.getDefaultSettings();
    const p = this.getSettingsPath();
    const bak = this.getBackupPath();
    const legacyP = this.getLegacySettingsPath();
    const legacyBak = this.getLegacyBackupPath();

    // Migrate legacy settings.json from installation directory to user-writable AppData on first run
    if (!fs.existsSync(p) && fs.existsSync(legacyP)) {
      try {
        fs.copyFileSync(legacyP, p);
        if (fs.existsSync(legacyBak) && !fs.existsSync(bak)) {
          fs.copyFileSync(legacyBak, bak);
        }
      } catch (e) {
        console.warn('Could not migrate legacy settings.json:', e.message);
      }
    }

    let raw = null;
    try {
      if (fs.existsSync(p)) {
        raw = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
      } else if (fs.existsSync(legacyP)) {
        raw = JSON.parse(fs.readFileSync(legacyP, 'utf8').replace(/^\uFEFF/, ''));
      }
    } catch (e) {
      console.warn('Failed to parse settings.json, attempting recovery from backup:', e.message);
      try {
        if (fs.existsSync(bak)) {
          raw = JSON.parse(fs.readFileSync(bak, 'utf8').replace(/^\uFEFF/, ''));
          fs.copyFileSync(bak, p);
          console.log('Successfully recovered settings.json from backup!');
        } else if (fs.existsSync(legacyBak)) {
          raw = JSON.parse(fs.readFileSync(legacyBak, 'utf8').replace(/^\uFEFF/, ''));
          fs.copyFileSync(legacyBak, p);
        }
      } catch (bakErr) {
        console.error('Backup recovery failed', bakErr.message);
      }
    }

    if (raw) {
      return this.deepMerge(defaults, raw);
    }
    return defaults;
  }

  scheduleSettingsSave(delay = 300) {
    if (this.settingsSaveTimer) {
      clearTimeout(this.settingsSaveTimer);
    }
    this.settingsSaveTimer = setTimeout(() => {
      this.settingsSaveTimer = null;
      this.saveSettings();
    }, delay);
  }

  saveSettings(newSettings) {
    if (this.settingsSaveTimer) {
      clearTimeout(this.settingsSaveTimer);
      this.settingsSaveTimer = null;
    }
    if (newSettings) {
      this.settings = this.deepMerge(this.settings, newSettings);
    }
    const p = this.getSettingsPath();
    const bak = this.getBackupPath();
    const serialized = JSON.stringify(this.settings, null, 2);
    try {
      if (fs.existsSync(p)) {
        fs.copyFileSync(p, bak);
      }
      fs.writeFileSync(p, serialized, 'utf8');
    } catch (e) {
      console.error('Failed to save settings.json in userDataDir:', e.message);
    }

    // Best-effort sync to baseDir when writable (e.g. portable or dev mode)
    const legacyP = this.getLegacySettingsPath();
    if (legacyP !== p) {
      try {
        fs.writeFileSync(legacyP, serialized, 'utf8');
      } catch (e) {
        // Ignore EPERM when installed in protected Program Files directory
      }
    }

    this.broadcast({ type: 'settings:update', settings: this.settings });
    return this.settings;
  }

  getDefaultSettings() {
    return {
      username: 'shimmy_ming',
      confirmed: false,
      theme: 'Purple',
      universalVolume: 0.85,
      universalMuted: false,
      favorites: ['jar', 'companion', 'overlays'],
      companion: {
        hair: 'twintails',
        hc: '#7b3fe4',
        oc: '#9b5cf0',
        cats: ['purple', 'black']
      },
      jar: {
        gravity: 0.9,
        giftScale: 0.85,
        bounciness: 0.4,
        maxGifts: 500,
        overflowAllowed: true,
        transform: {
          x: 50.0,
          y: 82.0,
          scale: 1.0
        }
      },
      lowerThird: {
        tiktok: '@shimmy_ming',
        instagram: '',
        youtube: '',
        discord: '',
        speed: 8,
        interval: 30
      },
      chat: {
        theme: 'pastel-purple',
        fontFamily: 'quicksand',
        fontSize: 14,
        bubbleRadius: 16,
        autoFadeSec: 15,
        maxMessages: 8,
        showBadges: true,
        avatarShape: 'circle',
        avatarAnim: 'elastic',
        messageGrouping: true
      },
      triggers: {
        events: {
          follow: { active: true },
          gift: { active: true },
          gift_big: { active: true },
          like: { active: true },
          share: { active: true }
        },
        followMessage: 'Thank you {name} for following!',
        giftMessage: '{name} sent {gift} x{count}!',
        giftBigMessage: 'LEGENDARY: {name} sent {gift} x{count}!',
        shareMessage: 'Thank you {name} for sharing the stream!',
        likeMessage: '{name} tapped {count} likes!',
        likeThreshold: 50,
        alertDuration: 5,
        soundEnabled: true,
        soundVolume: 0.85,
        followMedia: '',
        followMediaType: '',
        giftMedia: '',
        giftMediaType: '',
        giftBigMedia: '',
        giftBigMediaType: '',
        shareMedia: '',
        shareMediaType: '',
        sounds: {
          follow: '/assets/sounds/chime.wav',
          gift: '/assets/sounds/coin.wav',
          gift_big: '/assets/sounds/fanfare.wav',
          like: '/assets/sounds/pop.wav',
          share: '/assets/sounds/chime.wav'
        }
      },
      rankings: {
        topLikersCount: 3,
        viewerRankingCount: 3,
        leaveTimeoutMin: 5,
        topLikersTheme: 'Purple',
        topLikersScale: 1.0,
        viewerRankingTheme: 'Purple',
        viewerRankingScale: 1.0
      },
      headpat: {
        triggerOnFollow: true,
        triggerOnGift: true,
        durationSec: 5,
        speed: 1.0
      },
      timer: {
        durationMin: 30,
        addSecondsPerGift: 15,
        reduceSecondsPerComment: 1,
        reduceSecondsPerLike: 0.1,
        theme: 'Purple',
        scale: 1.0
      },
      updates: {
        autoCheck: true,
        feedUrl: 'https://raw.githubusercontent.com/purpz22/shing/main/desktop/releases.json',
        channel: 'stable',
        lastChecked: null
      }
    };
  }

  getRankingsSnapshot() {
    const topLikersCount = Math.max(1, Math.min(25, Number(this.settings?.rankings?.topLikersCount) || 3));
    const viewerRankingCount = Math.max(1, Math.min(25, Number(this.settings?.rankings?.viewerRankingCount) || 3));

    const allowedThemes = ['Purple', 'Pink', 'Blue', 'Green', 'Dark', 'Light'];
    const topLikersTheme = allowedThemes.includes(this.settings?.rankings?.topLikersTheme)
      ? this.settings.rankings.topLikersTheme
      : 'Purple';
    const viewerRankingTheme = allowedThemes.includes(this.settings?.rankings?.viewerRankingTheme)
      ? this.settings.rankings.viewerRankingTheme
      : 'Purple';

    const clampScale = (val) => {
      if (val === null || val === undefined || val === '') return 1.0;
      const num = Number(val);
      if (!Number.isFinite(num)) return 1.0;
      return Math.max(0.5, Math.min(1.5, num));
    };
    const topLikersScale = clampScale(this.settings?.rankings?.topLikersScale);
    const viewerRankingScale = clampScale(this.settings?.rankings?.viewerRankingScale);

    const allLikers = Array.from(this.topLikers.values())
      .sort((a, b) => (b.likes - a.likes) || (b.updatedAt - a.updatedAt));
    const totalLikes = allLikers.reduce((acc, item) => acc + (item.likes || 0), 0);

    const allViewers = Array.from(this.viewerStay.values())
      .map(v => {
        v.currentSec = v.currentTimeSec;
        v.bestSec = v.bestTimeSec;
        return v;
      })
      .sort((a, b) => (b.bestTimeSec - a.bestTimeSec) || (b.currentTimeSec - a.currentTimeSec) || (b.lastSeenAt - a.lastSeenAt));

    return {
      topLikers: allLikers.slice(0, topLikersCount),
      allLikersCount: allLikers.length,
      totalLikes,
      viewerRanking: allViewers.slice(0, viewerRankingCount),
      allViewersCount: allViewers.length,
      topLikersLimit: topLikersCount,
      viewerRankingLimit: viewerRankingCount,
      topLikersTheme,
      topLikersScale,
      viewerRankingTheme,
      viewerRankingScale,
      timestamp: Date.now()
    };
  }

  broadcastRankings() {
    const snap = this.getRankingsSnapshot();
    this.broadcastRaw({
      type: 'rankings:update',
      rankings: snap,
      topLikers: snap.topLikers,
      viewerRanking: snap.viewerRanking
    });
  }

  processRankingEvent(data) {
    if (!data || typeof data !== 'object' || !data.type) return;

    if (data.type === 'rankings:reset') {
      const target = data.target || 'all';
      if (target === 'likers' || target === 'all') {
        this.topLikers.clear();
      }
      if (target === 'stay' || target === 'viewers' || target === 'all') {
        this.viewerStay.clear();
      }
      this.broadcastRankings();
      return;
    }

    if (data.type === 'viewer:leave' || data.type === 'leave') {
      const rawUser = data.username || data.user || data.nickname || '';
      const key = String(rawUser).toLowerCase().trim();
      if (!key) return;
      const v = this.viewerStay.get(key) || Array.from(this.viewerStay.values()).find(
        item => (item.nickname || '').toLowerCase() === key || (item.username || '').toLowerCase() === key
      );
      if (v && v.isPresent) {
        const now = Date.now();
        v.currentTimeSec = Math.max(v.currentTimeSec, Math.floor((now - v.sessionStartAt) / 1000));
        if (v.currentTimeSec > v.bestTimeSec) {
          v.bestTimeSec = v.currentTimeSec;
        }
        v.isPresent = false;
        this.broadcastRankings();
      }
      return;
    }

    if (!['join', 'chat', 'like', 'gift', 'follow', 'share'].includes(data.type)) {
      return;
    }

    const rawName = (data.nickname || data.user || data.username || 'Viewer').trim();
    const rawUser = (data.username || data.user || rawName).trim();
    const key = String(rawUser).toLowerCase();
    if (!key) return;

    const now = Date.now();
    const cleanAvatar = (data.avatar && !String(data.avatar).startsWith('..'))
      ? data.avatar
      : (data.avatar ? '/assets/avatar.png' : '/assets/avatar.png');

    // 1. Update Viewer Stay-Time Ranking
    let v = this.viewerStay.get(key);
    if (!v) {
      v = {
        key,
        username: rawUser,
        nickname: rawName,
        avatar: cleanAvatar,
        isPresent: true,
        sessionStartAt: now,
        lastSeenAt: now,
        currentTimeSec: 0,
        bestTimeSec: 0
      };
      this.viewerStay.set(key, v);
    } else {
      if (rawName) v.nickname = rawName;
      if (cleanAvatar && !cleanAvatar.includes('avatar.png')) {
        v.avatar = cleanAvatar;
      }
      if (!v.isPresent) {
        // Viewer came back after leaving: start new session, keep bestTimeSec intact
        v.isPresent = true;
        v.sessionStartAt = now;
        v.currentTimeSec = 0;
        v.lastSeenAt = now;
      } else {
        // Active viewer: keep session continuity, refresh lastSeenAt and update stay duration
        v.lastSeenAt = now;
        v.currentTimeSec = Math.max(v.currentTimeSec, Math.floor((now - v.sessionStartAt) / 1000));
        if (v.currentTimeSec > v.bestTimeSec) {
          v.bestTimeSec = v.currentTimeSec;
        }
      }
    }

    // 2. Update Top Likers Ranking
    if (data.type === 'like') {
      const addLikes = Math.max(1, Number(data.count) || 1);
      let liker = this.topLikers.get(key);
      if (!liker) {
        liker = {
          key,
          username: rawUser,
          nickname: rawName,
          avatar: (cleanAvatar && !cleanAvatar.includes('avatar.png')) ? cleanAvatar : (v ? v.avatar : '/assets/avatar.png'),
          likes: addLikes,
          updatedAt: now
        };
        this.topLikers.set(key, liker);
      } else {
        liker.likes += addLikes;
        if (rawName) liker.nickname = rawName;
        if (cleanAvatar && !cleanAvatar.includes('avatar.png')) {
          liker.avatar = cleanAvatar;
        }
        liker.updatedAt = now;
      }
    }

    this.broadcastRankings();
  }

  tickViewerRankings(stepSeconds) {
    if (this.viewerStay.size === 0) return;
    const now = Date.now();
    const timeoutMin = Math.max(1, Number(this.settings?.rankings?.leaveTimeoutMin) || 5);
    const timeoutMs = timeoutMin * 60 * 1000;
    let changed = false;

    for (const v of this.viewerStay.values()) {
      if (!v.isPresent) continue;
      if (now - v.lastSeenAt > timeoutMs) {
        // Viewer left / timed out: stop their timer and preserve bestTimeSec
        if (v.currentTimeSec > v.bestTimeSec) {
          v.bestTimeSec = v.currentTimeSec;
        }
        v.isPresent = false;
        changed = true;
      } else {
        const elapsed = typeof stepSeconds === 'number'
          ? (v.currentTimeSec + stepSeconds)
          : Math.max(v.currentTimeSec, Math.floor((now - v.sessionStartAt) / 1000));
        if (elapsed !== v.currentTimeSec) {
          v.currentTimeSec = elapsed;
          if (v.currentTimeSec > v.bestTimeSec) {
            v.bestTimeSec = v.currentTimeSec;
          }
          changed = true;
        }
      }
    }

    if (changed) {
      this.broadcastRankings();
    }
  }

  getTimerSnapshot() {
    return {
      remainingSeconds: this.timerState.remainingSeconds,
      initialSeconds: this.timerState.initialSeconds,
      isRunning: this.timerState.isRunning,
      theme: this.settings?.timer?.theme || 'Purple',
      scale: typeof this.settings?.timer?.scale === 'number' ? this.settings.timer.scale : 1.0
    };
  }

  handleTimerControl(action, seconds) {
    if (action === 'start') {
      if (this.timerState.isRunning) return this.getTimerSnapshot();
      if (this.timerState.remainingSeconds <= 0) {
        this.timerState.remainingSeconds = this.timerState.initialSeconds || 1800;
      }
      this.timerState.isRunning = true;
      if (this.streamTimerTicker) clearInterval(this.streamTimerTicker);
      this.streamTimerTicker = setInterval(() => this.tickStreamTimer(), 1000);
      this.broadcast({
        type: 'timer:sync',
        timer: this.getTimerSnapshot(),
        action: 'start'
      });
      return this.getTimerSnapshot();
    }

    if (action === 'pause') {
      this.timerState.isRunning = false;
      if (this.streamTimerTicker) {
        clearInterval(this.streamTimerTicker);
        this.streamTimerTicker = null;
      }
      this.broadcast({
        type: 'timer:sync',
        timer: this.getTimerSnapshot(),
        action: 'pause'
      });
      return this.getTimerSnapshot();
    }

    if (action === 'reset') {
      this.timerState.isRunning = false;
      if (this.streamTimerTicker) {
        clearInterval(this.streamTimerTicker);
        this.streamTimerTicker = null;
      }
      const resetSec = (seconds !== undefined && seconds !== null)
        ? Math.max(0, Number(seconds) || 0)
        : this.timerState.initialSeconds;
      this.timerState.remainingSeconds = resetSec;
      this.timerState.initialSeconds = resetSec;
      this.timerState.likeFractionAccumulator = 0;
      this.broadcast({
        type: 'timer:sync',
        timer: this.getTimerSnapshot(),
        action: 'reset'
      });
      return this.getTimerSnapshot();
    }

    if (action === 'set') {
      const setSec = Math.max(0, Number(seconds) || 0);
      this.timerState.remainingSeconds = setSec;
      this.timerState.initialSeconds = setSec;
      this.timerState.likeFractionAccumulator = 0;
      this.broadcast({
        type: 'timer:sync',
        timer: this.getTimerSnapshot(),
        action: 'set'
      });
      return this.getTimerSnapshot();
    }

    if (action === 'adjust' || action === 'add') {
      const delta = Number(seconds) || 0;
      if (delta > 0) {
        this.addTimer(delta, 'adjust');
      } else if (delta < 0) {
        this.deductTimer(Math.abs(delta), 'adjust');
      }
      return this.getTimerSnapshot();
    }

    return this.getTimerSnapshot();
  }

  tickStreamTimer() {
    if (!this.timerState.isRunning) return;
    if (this.timerState.remainingSeconds > 0) {
      this.timerState.remainingSeconds--;
      this.broadcast({
        type: 'timer:tick',
        remainingSeconds: this.timerState.remainingSeconds
      });
      if (this.timerState.remainingSeconds === 0) {
        this.timerState.isRunning = false;
        if (this.streamTimerTicker) {
          clearInterval(this.streamTimerTicker);
          this.streamTimerTicker = null;
        }
        this.broadcast({
          type: 'timer:sync',
          timer: this.getTimerSnapshot(),
          action: 'finish'
        });
      }
    } else {
      this.timerState.isRunning = false;
      if (this.streamTimerTicker) {
        clearInterval(this.streamTimerTicker);
        this.streamTimerTicker = null;
      }
    }
  }

  onCommentDeduct() {
    if (!this.timerState.isRunning) return;
    const perComment = Number(this.settings.timer?.reduceSecondsPerComment);
    if (!perComment || perComment <= 0) return;
    this.deductTimer(Math.round(perComment), 'comment');
  }

  onLikeDeduct(count = 1) {
    if (!this.timerState.isRunning) return;
    const perLike = Number(this.settings.timer?.reduceSecondsPerLike);
    if (!perLike || perLike <= 0) return;
    this.timerState.likeFractionAccumulator += count * perLike;
    if (this.timerState.likeFractionAccumulator >= 1) {
      const wholeSec = Math.floor(this.timerState.likeFractionAccumulator);
      this.timerState.likeFractionAccumulator -= wholeSec;
      this.deductTimer(wholeSec, 'like');
    }
  }

  onGiftBonus(count = 1) {
    const perGift = Number(this.settings.timer?.addSecondsPerGift);
    if (!perGift || perGift <= 0) return;
    const bonus = perGift * count;
    this.addTimer(bonus, 'gift');
  }

  deductTimer(seconds, reason = 'manual') {
    if (this.timerState.remainingSeconds <= 0) return;
    const actualDeduct = Math.min(this.timerState.remainingSeconds, seconds);
    this.timerState.remainingSeconds = Math.max(0, this.timerState.remainingSeconds - actualDeduct);
    this.broadcast({
      type: 'timer:deduct',
      seconds: actualDeduct,
      reason,
      remainingSeconds: this.timerState.remainingSeconds
    });
    if (this.timerState.remainingSeconds === 0 && this.timerState.isRunning) {
      this.timerState.isRunning = false;
      if (this.streamTimerTicker) {
        clearInterval(this.streamTimerTicker);
        this.streamTimerTicker = null;
      }
      this.broadcast({
        type: 'timer:sync',
        timer: this.getTimerSnapshot(),
        action: 'finish'
      });
    }
  }

  addTimer(seconds, reason = 'gift') {
    this.timerState.remainingSeconds += seconds;
    this.broadcast({
      type: 'timer:bonus',
      seconds,
      reason,
      remainingSeconds: this.timerState.remainingSeconds
    });
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.wss = new WebSocketServer({ server: this.server });

      if (this.rankingTimer) clearInterval(this.rankingTimer);
      this.rankingTimer = setInterval(() => this.tickViewerRankings(), 1000);

      this.wss.on('connection', ws => {
        this.clients.add(ws);
        ws.send(JSON.stringify({
          type: 'init',
          settings: this.settings,
          rankings: this.getRankingsSnapshot(),
          timer: this.getTimerSnapshot()
        }));
        if (this.tiktokStatus) {
          ws.send(JSON.stringify(Object.assign({ type: 'tiktok:status' }, this.tiktokStatus)));
        }
        ws.on('close', () => this.clients.delete(ws));
        ws.on('error', () => this.clients.delete(ws));
        ws.on('message', raw => {
          try {
            const data = JSON.parse(raw);
            this.handleWsMessage(ws, data);
          } catch (e) {
            console.warn('Bad message from client', e);
          }
        });
      });

      let retries = 0;
      const tryListen = () => {
        this.server.listen(this.port, '0.0.0.0', () => {
          console.log(`Overlay server running at http://localhost:${this.port}`);
          resolve(this.port);
        });
      };

      this.server.on('error', err => {
        if (err.code === 'EADDRINUSE' && retries < 8) {
          retries++;
          setTimeout(tryListen, 250);
        }
        reject(err);
      });

      tryListen();
    });
  }

  handleWsMessage(ws, data) {
    if (!data || typeof data !== 'object') return;

    if (data.type === 'jar:transform') {
      const x = Math.max(5, Math.min(95, Number(data.x) || 50));
      const y = Math.max(8, Math.min(96, Number(data.y) || 82));
      const scale = Math.max(0.4, Math.min(1.5, Number(data.scale) || 1.0));
      if (!this.settings.jar) this.settings.jar = {};
      this.settings.jar.transform = { x, y, scale };
      this.broadcast({ type: 'jar:transform', x, y, scale });
      this.scheduleSettingsSave();
      return;
    }

    if (data.type === 'timer:control') {
      this.handleTimerControl(data.action, data.seconds);
      return;
    }

    if (data.type === 'settings:save') {
      this.saveSettings(data.settings);
    } else if (data.type === 'test:event') {
      this.broadcast(data.event);
    } else if (data.type === 'rankings:reset' || data.type === 'viewer:leave') {
      this.processRankingEvent(data);
    } else if (data.type === 'tiktok:connect' && typeof this.onConnectRequest === 'function') {
      this.onConnectRequest(data.username, { manual: Boolean(data.manual) });
    } else if (data.type === 'tiktok:disconnect' && typeof this.onDisconnectRequest === 'function') {
      this.onDisconnectRequest();
    }
  }

  stop() {
    if (this.streamTimerTicker) {
      clearInterval(this.streamTimerTicker);
      this.streamTimerTicker = null;
    }
    if (this.rankingTimer) {
      clearInterval(this.rankingTimer);
      this.rankingTimer = null;
    }
    if (this.settingsSaveTimer) {
      clearTimeout(this.settingsSaveTimer);
      this.settingsSaveTimer = null;
    }
    for (const ws of this.clients) {
      try { ws.terminate(); } catch (e) {}
    }
    this.clients.clear();
    if (this.wss) {
      try { this.wss.close(); } catch (e) {}
    }
    if (this.server) {
      try { this.server.close(); } catch (e) {}
    }
  }

  broadcastRaw(msg) {
    const payload = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(payload); } catch (e) {}
      }
    }
  }

  broadcast(msg) {
    const obj = typeof msg === 'string' ? (() => { try { return JSON.parse(msg); } catch (e) { return null; } })() : msg;
    this.broadcastRaw(msg);
    if (obj) {
      this.processRankingEvent(obj);
      if (obj.type === 'chat') {
        this.onCommentDeduct();
      } else if (obj.type === 'like') {
        this.onLikeDeduct(obj.count || 1);
      } else if (obj.type === 'gift') {
        this.onGiftBonus(obj.count || 1);
      } else if (obj.type === 'timer:control') {
        this.handleTimerControl(obj.action, obj.seconds);
      }
      if (obj.type === 'settings:update') {
        this.broadcastRaw({ type: 'rankings:update', rankings: this.getRankingsSnapshot() });
      }
    }
  }

  handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // CORS headers for overlays
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    // Dashboard Root & Static Files
    if (pathname === '/' || pathname === '/index.html') {
      const filePath = path.join(this.baseDir, 'renderer', 'index.html');
      return this.serveFile(filePath, 'text/html', res);
    }

    if (pathname === '/styles.css' || pathname === '/renderer/styles.css') {
      const filePath = path.join(this.baseDir, 'renderer', 'styles.css');
      return this.serveFile(filePath, 'text/css', res);
    }

    if (pathname === '/app.js' || pathname === '/renderer/app.js') {
      const filePath = path.join(this.baseDir, 'renderer', 'app.js');
      return this.serveFile(filePath, 'text/javascript', res);
    }

    if (pathname.startsWith('/renderer/')) {
      const relPath = pathname.replace('/renderer/', '');
      const filePath = path.join(this.baseDir, 'renderer', relPath);
      return this.serveStatic(filePath, res);
    }

    if (pathname === '/api/settings') {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const saved = this.saveSettings(parsed);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(saved));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(this.settings));
    }

    if (pathname === '/api/simulate' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const viewerName = parsed.nickname || parsed.user || parsed.uniqueId || 'Viewer';

          let giftPic = parsed.giftPictureUrl || null;
          if (parsed.type === 'gift' && !giftPic) {
            const rawKey = (parsed.giftId || parsed.giftName || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
            const localFile = path.join(this.baseDir, 'assets', 'gifts', `${rawKey}.png`);
            if (fs.existsSync(localFile)) {
              giftPic = `/assets/gifts/${rawKey}.png`;
            } else {
              const catalogPath = path.join(this.baseDir, 'assets', 'gifts-catalog.json');
              if (fs.existsSync(catalogPath)) {
                try {
                  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
                  const match = catalog.find(g => String(g.id) === String(parsed.giftId) || (g.name && parsed.giftName && g.name.toLowerCase() === parsed.giftName.toLowerCase()));
                  if (match && match.image) giftPic = match.image;
                } catch (e) {}
              }
            }
          }

          const event = Object.assign({}, parsed, {
            user: viewerName,
            nickname: viewerName,
            username: parsed.username || parsed.uniqueId || '',
            giftPictureUrl: giftPic || parsed.giftPictureUrl || null
          });
          this.broadcast(event);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // Sound Management APIs
    if (pathname === '/api/sounds') {
      const baseSoundsDir = path.join(this.baseDir, 'assets', 'sounds');
      const userSoundsDir = path.join(this.userDataDir, 'sounds');
      try {
        if (!fs.existsSync(userSoundsDir)) fs.mkdirSync(userSoundsDir, { recursive: true });
      } catch (e) {}
      try {
        const soundMap = new Map();
        for (const dir of [baseSoundsDir, userSoundsDir]) {
          if (!fs.existsSync(dir)) continue;
          const files = fs.readdirSync(dir).filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f));
          for (const f of files) {
            soundMap.set(f, {
              filename: f,
              name: path.basename(f, path.extname(f)).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              url: `/assets/sounds/${f}`
            });
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(Array.from(soundMap.values())));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    if (pathname === '/api/sounds/search') {
      const query = (url.searchParams.get('q') || '').trim();
      if (!query) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify([]));
      }

      const searchUrl = `https://www.myinstants.com/en/search/?name=${encodeURIComponent(query)}`;
      https.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }, searchRes => {
        let html = '';
        searchRes.on('data', chunk => html += chunk);
        searchRes.on('end', () => {
          const results = [];
          const regex = /<button class="small-button" onclick="play\('([^']+)'[^>]*title="([^"]*)"/g;
          let match;
          while ((match = regex.exec(html)) !== null && results.length < 24) {
            let title = match[2].replace(/^Play\s+/i, '').replace(/\s+sound$/i, '').trim();
            let soundUrl = match[1].startsWith('http') ? match[1] : 'https://www.myinstants.com' + match[1];
            results.push({ title, soundUrl });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(results));
        });
      }).on('error', err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
      return;
    }

    if (pathname === '/api/sounds/download' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const soundUrl = parsed.soundUrl || parsed.url;
          const title = parsed.title;
          if (!soundUrl) throw new Error('Missing soundUrl');
          const cleanTitle = (title || 'sound').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
          const ext = path.extname(new URL(soundUrl).pathname) || '.mp3';
          const filename = `${cleanTitle}${ext}`;
          const soundsDir = path.join(this.userDataDir, 'sounds');
          if (!fs.existsSync(soundsDir)) fs.mkdirSync(soundsDir, { recursive: true });
          const destPath = path.join(soundsDir, filename);

          const client = soundUrl.startsWith('https') ? https : http;
          client.get(soundUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, fileRes => {
            if (fileRes.statusCode !== 200) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ error: `HTTP ${fileRes.statusCode}` }));
            }
            const fileStream = fs.createWriteStream(destPath);
            fileRes.pipe(fileStream);
            fileStream.on('finish', () => {
              fileStream.close();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: true,
                name: title || cleanTitle,
                filename,
                url: `/assets/sounds/${filename}`
              }));
            });
          }).on('error', err => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          });
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // Rankings API
    if (pathname === '/api/rankings') {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body || '{}');
            if (parsed.action === 'reset') {
              this.processRankingEvent({ type: 'rankings:reset', target: parsed.target || 'all' });
            } else if (parsed.action === 'leave') {
              this.processRankingEvent({ type: 'viewer:leave', username: parsed.username || parsed.user });
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.getRankingsSnapshot()));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(this.getRankingsSnapshot()));
    }

    // Avatar & Gift Icon Proxy with In-Memory Cache for CORS-safe Canvas & Zero-Lag Repeat Loads
    if (pathname === '/api/avatar-proxy' || pathname === '/api/gift-icon') {
      const targetUrl = (url.searchParams.get('url') || '').trim();
      const isGift = pathname === '/api/gift-icon' || targetUrl.includes('webcast');
      const fallbackPath = path.join(this.baseDir, 'assets', isGift ? path.join('gifts', 'rose.png') : 'avatar.png');
      return this.proxyRemoteImage(targetUrl, fallbackPath, res);
    }

    if (pathname === '/api/gifts') {
      const catalogPath = path.join(this.baseDir, 'assets', 'gifts-catalog.json');
      try {
        if (!this.cachedGiftCatalog && fs.existsSync(catalogPath)) {
          this.cachedGiftCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
        }
        if (Array.isArray(this.cachedGiftCatalog)) {
          const merged = [...this.cachedGiftCatalog];
          if (this.dynamicGifts.size > 0) {
            const seenIds = new Set(merged.map(g => String(g.id)));
            for (const dynGift of this.dynamicGifts.values()) {
              if (!seenIds.has(String(dynGift.id))) {
                merged.push(dynGift);
                seenIds.add(String(dynGift.id));
              }
            }
          }
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          return res.end(JSON.stringify(merged));
        }
        const giftsDir = path.join(this.baseDir, 'assets', 'gifts');
        const files = fs.readdirSync(giftsDir);
        const gifts = files.map(f => ({
          id: path.basename(f, path.extname(f)),
          name: path.basename(f, path.extname(f)).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          image: `/assets/gifts/${f}`
        }));
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        return res.end(JSON.stringify(gifts));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    if (pathname === '/api/version') {
      const pkgPath = path.join(this.baseDir, 'package.json');
      let ver = '1.1.0';
      try { ver = JSON.parse(fs.readFileSync(pkgPath, 'utf8').replace(/^\uFEFF/, '')).version || '1.1.0'; } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ version: ver, app: 'Shing Studio' }));
    }

    if (pathname === '/api/releases') {
      const relPath = path.join(this.baseDir, 'releases.json');
      if (fs.existsSync(relPath)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(fs.readFileSync(relPath, 'utf8'));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ latest: '1.0.0', releases: [] }));
    }

    // Serve overlays (supports both /overlays/triggers and /overlays/triggers.html for TikTok LIVE Studio)
    if (pathname.startsWith('/overlays/')) {
      const rawName = pathname.replace('/overlays/', '').split('?')[0].replace(/\/+$/, '').replace(/\.html?$/i, '');
      const safeName = rawName.replace(/[^a-zA-Z0-9_-]/g, '');
      const filePath = path.join(this.baseDir, 'overlays', `${safeName}.html`);
      return this.serveFile(filePath, 'text/html', res);
    }

    // Serve custom uploaded media from userDataDir/media
    if (pathname.startsWith('/media/')) {
      const relPath = path.basename(decodeURIComponent(pathname.replace('/media/', '')));
      const userMediaPath = path.join(this.userDataDir, 'media', relPath);
      return this.serveStatic(userMediaPath, res, req);
    }

    // Serve assets (check userDataDir/sounds fallback for custom sounds, and catalog fallback for /assets/gifts/*)
    if (pathname.startsWith('/assets/')) {
      const relPath = pathname.replace('/assets/', '');
      const filePath = path.join(this.baseDir, 'assets', relPath);
      if (!fs.existsSync(filePath)) {
        if (relPath.startsWith('sounds/')) {
          const soundName = path.basename(relPath);
          const userSoundPath = path.join(this.userDataDir, 'sounds', soundName);
          if (fs.existsSync(userSoundPath)) {
            return this.serveStatic(userSoundPath, res, req);
          }
        } else if (relPath.startsWith('gifts/')) {
          const requestedKey = path.basename(relPath, path.extname(relPath)).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
          const matchedUrl = this.findCatalogGiftImage(requestedKey);
          const roseFallback = path.join(this.baseDir, 'assets', 'gifts', 'rose.png');
          if (matchedUrl) {
            return this.proxyRemoteImage(matchedUrl, roseFallback, res);
          }
          return this.serveStatic(roseFallback, res, req);
        }
      }
      return this.serveStatic(filePath, res, req);
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  findCatalogGiftImage(requestedKey) {
    if (!requestedKey) return null;
    const catalogPath = path.join(this.baseDir, 'assets', 'gifts-catalog.json');
    try {
      if (!this.cachedGiftCatalog && fs.existsSync(catalogPath)) {
        this.cachedGiftCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      }
    } catch (e) {}

    const compactReq = requestedKey.replace(/_/g, '');
    const allGifts = [
      ...Array.from(this.dynamicGifts.values()),
      ...(Array.isArray(this.cachedGiftCatalog) ? this.cachedGiftCatalog : [])
    ];

    for (const g of allGifts) {
      if (!g || !g.image) continue;
      if (String(g.id).toLowerCase() === requestedKey) return g.image;
      const nameSnake = (g.name || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
      const nameCompact = nameSnake.replace(/_/g, '');
      if (nameSnake === requestedKey || (compactReq && nameCompact === compactReq)) {
        return g.image;
      }
    }
    return null;
  }

  proxyRemoteImage(targetUrl, fallbackPath, res, redirectDepth = 0) {
    if (!targetUrl || !/^https?:\/\//i.test(targetUrl) || redirectDepth > 3) {
      return this.serveStatic(fallbackPath, res);
    }

    const cached = this.imageCache.get(targetUrl);
    if (cached && cached.buffer && (Date.now() - cached.ts < 3600000)) {
      res.writeHead(200, {
        'Content-Type': cached.contentType || 'image/webp',
        'Content-Length': cached.buffer.length,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(cached.buffer);
    }

    try {
      const client = targetUrl.startsWith('https') ? https : http;
      const proxyReq = client.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://www.tiktok.com/'
        },
        timeout: 5000
      }, proxyRes => {
        if ([301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
          proxyRes.resume();
          const nextUrl = proxyRes.headers.location.startsWith('http')
            ? proxyRes.headers.location
            : new URL(proxyRes.headers.location, targetUrl).toString();
          return this.proxyRemoteImage(nextUrl, fallbackPath, res, redirectDepth + 1);
        }
        if (proxyRes.statusCode !== 200) {
          proxyRes.resume();
          return this.serveStatic(fallbackPath, res);
        }
        const contentType = proxyRes.headers['content-type'] || 'image/webp';
        const chunks = [];
        let totalLen = 0;
        proxyRes.on('data', chunk => {
          chunks.push(chunk);
          totalLen += chunk.length;
        });
        proxyRes.on('end', () => {
          const buf = Buffer.concat(chunks, totalLen);
          if (buf.length > 0 && buf.length < 1500000) {
            if (this.imageCache.size >= 500) {
              const oldestKey = this.imageCache.keys().next().value;
              if (oldestKey) this.imageCache.delete(oldestKey);
            }
            this.imageCache.set(targetUrl, { buffer: buf, contentType, ts: Date.now() });
          }
          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': buf.length,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(buf);
        });
      });
      proxyReq.on('error', () => this.serveStatic(fallbackPath, res));
      proxyReq.on('timeout', () => {
        try { proxyReq.destroy(); } catch (e) {}
        this.serveStatic(fallbackPath, res);
      });
    } catch (e) {
      return this.serveStatic(fallbackPath, res);
    }
  }

  serveFile(filePath, contentType, res) {
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File Not Found');
    }
  }

  serveStatic(filePath, res, req = null) {
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('File Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime'
    };
    const mime = mimeMap[ext] || 'application/octet-stream';
    const stat = fs.statSync(filePath);

    // Support HTTP Range headers for video streaming
    if (req && req.headers && req.headers.range && mime.startsWith('video/')) {
      const range = req.headers.range;
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = (end - start) + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mime
      });
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

module.exports = OverlayServer;

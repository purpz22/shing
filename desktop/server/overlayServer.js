'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

class OverlayServer {
  constructor(port = 3333, baseDir = path.resolve(__dirname, '..')) {
    this.port = port;
    this.baseDir = baseDir;
    this.server = null;
    this.wss = null;
    this.clients = new Set();
    this.settings = this.loadSettings();
  }

  getSettingsPath() {
    return path.join(this.baseDir, 'settings.json');
  }

  getBackupPath() {
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

    let raw = null;
    try {
      if (fs.existsSync(p)) {
        raw = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
      }
    } catch (e) {
      console.warn('Failed to parse settings.json, attempting recovery from backup:', e.message);
      try {
        if (fs.existsSync(bak)) {
          raw = JSON.parse(fs.readFileSync(bak, 'utf8').replace(/^\uFEFF/, ''));
          fs.copyFileSync(bak, p);
          console.log('Successfully recovered settings.json from backup!');
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

  saveSettings(newSettings) {
    this.settings = this.deepMerge(this.settings, newSettings);
    const p = this.getSettingsPath();
    const bak = this.getBackupPath();
    try {
      if (fs.existsSync(p)) {
        fs.copyFileSync(p, bak);
      }
      fs.writeFileSync(p, JSON.stringify(this.settings, null, 2), 'utf8');
      this.broadcast({ type: 'settings:update', settings: this.settings });
    } catch (e) {
      console.error('Failed to save settings.json', e.message);
    }
    return this.settings;
  }

  getDefaultSettings() {
    return {
      username: 'shimmy_ming',
      confirmed: false,
      theme: 'Purple',
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
        overflowAllowed: true
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
        followMessage: 'Thank you {user} for following!',
        giftMessage: '{user} sent {gift} x{count}!',
        likeThreshold: 50,
        alertDuration: 5,
        soundEnabled: true,
        soundVolume: 0.85,
        sounds: {
          follow: '/assets/sounds/chime.wav',
          gift: '/assets/sounds/coin.wav',
          gift_big: '/assets/sounds/fanfare.wav',
          like: '/assets/sounds/pop.wav'
        }
      },
      timer: {
        durationMin: 30,
        addSecondsPerGift: 15
      },
      updates: {
        autoCheck: true,
        feedUrl: 'https://raw.githubusercontent.com/purpz22/shing/main/desktop/releases.json',
        channel: 'stable',
        lastChecked: null
      }
    };
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.wss = new WebSocketServer({ server: this.server });

      this.wss.on('connection', ws => {
        this.clients.add(ws);
        ws.send(JSON.stringify({ type: 'init', settings: this.settings }));
        ws.on('close', () => this.clients.delete(ws));
        ws.on('error', () => this.clients.delete(ws));
        ws.on('message', raw => {
          try {
            const data = JSON.parse(raw);
            if (data.type === 'settings:save') {
              this.saveSettings(data.settings);
            } else if (data.type === 'test:event') {
              this.broadcast(data.event);
            }
          } catch (e) {
            console.warn('Bad message from client', e);
          }
        });
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        console.log(`Overlay server running at http://localhost:${this.port}`);
        resolve(this.port);
      });

      this.server.on('error', err => reject(err));
    });
  }

  stop() {
    if (this.wss) this.wss.close();
    if (this.server) this.server.close();
  }

  broadcast(msg) {
    const payload = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(payload); } catch (e) {}
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
      const soundsDir = path.join(this.baseDir, 'assets', 'sounds');
      if (!fs.existsSync(soundsDir)) fs.mkdirSync(soundsDir, { recursive: true });
      try {
        const files = fs.readdirSync(soundsDir).filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f));
        const sounds = files.map(f => ({
          filename: f,
          name: path.basename(f, path.extname(f)).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          url: `/assets/sounds/${f}`
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(sounds));
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
          const soundsDir = path.join(this.baseDir, 'assets', 'sounds');
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


    if (pathname === '/api/gifts') {
      const catalogPath = path.join(this.baseDir, 'assets', 'gifts-catalog.json');
      try {
        if (fs.existsSync(catalogPath)) {
          const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(catalog));
        }
        const giftsDir = path.join(this.baseDir, 'assets', 'gifts');
        const files = fs.readdirSync(giftsDir);
        const gifts = files.map(f => ({
          id: path.basename(f, path.extname(f)),
          name: path.basename(f, path.extname(f)).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          image: `/assets/gifts/${f}`
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
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

    // Serve overlays
    if (pathname.startsWith('/overlays/')) {
      const name = pathname.replace('/overlays/', '').split('?')[0];
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
      const filePath = path.join(this.baseDir, 'overlays', `${safeName}.html`);
      return this.serveFile(filePath, 'text/html', res);
    }

    // Serve assets
    if (pathname.startsWith('/assets/')) {
      const relPath = pathname.replace('/assets/', '');
      const filePath = path.join(this.baseDir, 'assets', relPath);
      return this.serveStatic(filePath, res);
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
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

  serveStatic(filePath, res) {
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
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg'
    };
    const mime = mimeMap[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  }
}

module.exports = OverlayServer;

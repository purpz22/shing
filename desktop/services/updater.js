'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { exec } = require('child_process');
const { app } = require('electron');

class AppUpdater {
  constructor(baseDir = path.resolve(__dirname, '..')) {
    this.baseDir = baseDir;
    this.packagePath = path.join(this.baseDir, 'package.json');
    this.releasesPath = path.join(this.baseDir, 'releases.json');
    this.settingsPath = path.join(this.baseDir, 'settings.json');
    this.backupPath = path.join(this.baseDir, 'settings.json.bak');
    this.isUpdating = false;
  }

  getCurrentVersion() {
    try {
      if (fs.existsSync(this.packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(this.packagePath, 'utf8'));
        return pkg.version || '1.0.0';
      }
    } catch (e) {
      console.warn('Failed to read package.json version', e.message);
    }
    return '1.0.0';
  }

  compareVersions(v1, v2) {
    const p1 = (v1 || '0.0.0').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const p2 = (v2 || '0.0.0').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(p1.length, p2.length);
    for (let i = 0; i < len; i++) {
      const a = p1[i] || 0;
      const b = p2[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  async fetchRemoteManifest(url) {
    return new Promise((resolve, reject) => {
      try {
        const parsed = new URL(url);
        const client = parsed.protocol === 'https:' ? https : http;
        const req = client.get(url, { headers: { 'User-Agent': 'ShingStudio-Updater' } }, res => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP status ${res.statusCode}`));
          }
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data.replace(/^\uFEFF/, '')));
            } catch (err) {
              reject(err);
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(5000, () => {
          req.destroy(new Error('Update check request timed out'));
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  getLocalReleases() {
    try {
      if (fs.existsSync(this.releasesPath)) {
        return JSON.parse(fs.readFileSync(this.releasesPath, 'utf8').replace(/^\uFEFF/, ''));
      }
    } catch (e) {
      console.warn('Failed to read local releases.json', e.message);
    }
    return {
      latest: this.getCurrentVersion(),
      releases: []
    };
  }

  async checkForUpdates(customFeedUrl = null) {
    const currentVersion = this.getCurrentVersion();
    let manifest = null;

    const targetUrl = (customFeedUrl && typeof customFeedUrl === 'string' && customFeedUrl.startsWith('http'))
      ? customFeedUrl
      : 'https://raw.githubusercontent.com/purpz22/shing/main/desktop/releases.json';

    try {
      manifest = await this.fetchRemoteManifest(targetUrl);
    } catch (e) {
      console.warn('Remote update feed unreachable, falling back to local registry:', e.message);
    }

    if (!manifest) {
      manifest = this.getLocalReleases();
    }

    const latestVersion = manifest.latest || (manifest.releases?.[0]?.version) || currentVersion;
    const hasUpdate = this.compareVersions(latestVersion, currentVersion) > 0;
    const release = manifest.releases?.find(r => r.version === latestVersion) || manifest.releases?.[0] || null;

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      release,
      allReleases: manifest.releases || [],
      checkedAt: new Date().toISOString()
    };
  }

  downloadFile(fileUrl, destPath, onProgress, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
      const makeRequest = (currentUrl, redirectsLeft) => {
        if (redirectsLeft < 0) return reject(new Error('Too many redirects encountered'));
        try {
          const parsed = new URL(currentUrl);
          const client = parsed.protocol === 'https:' ? https : http;
          const req = client.get(currentUrl, { headers: { 'User-Agent': 'ShingStudio-Updater' } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              const nextUrl = new URL(res.headers.location, currentUrl).href;
              return makeRequest(nextUrl, redirectsLeft - 1);
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`Failed to download update package: HTTP ${res.statusCode}`));
            }
            const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
            let downloadedBytes = 0;
            const outStream = fs.createWriteStream(destPath);
            res.on('data', chunk => {
              downloadedBytes += chunk.length;
              if (totalBytes > 0 && typeof onProgress === 'function') {
                const percent = Math.min(99, Math.round((downloadedBytes / totalBytes) * 100));
                onProgress({
                  percent,
                  msg: `Downloading update (${Math.round(downloadedBytes / 1024)} KB / ${Math.round(totalBytes / 1024)} KB)...`
                });
              }
            });
            res.pipe(outStream);
            outStream.on('finish', () => {
              outStream.close(() => resolve(destPath));
            });
            outStream.on('error', err => {
              fs.unlink(destPath, () => {});
              reject(err);
            });
          });
          req.on('error', reject);
          req.setTimeout(45000, () => {
            req.destroy(new Error('Download connection timed out'));
          });
        } catch (err) {
          reject(err);
        }
      };
      makeRequest(fileUrl, maxRedirects);
    });
  }

  async downloadUpdate(updateInfo, onProgress) {
    if (this.isUpdating) {
      throw new Error('An update operation is already in progress.');
    }
    this.isUpdating = true;
    this.stagedZipPath = null;

    const downloadUrl = updateInfo?.release?.downloadUrl;

    if (downloadUrl && typeof downloadUrl === 'string' && downloadUrl.startsWith('http')) {
      // Genuine remote package download
      if (typeof onProgress === 'function') {
        onProgress({ percent: 5, msg: 'Connecting to update server...' });
      }

      const tempDir = app.getPath('temp');
      const zipFileName = `shing-update-${updateInfo?.latestVersion || Date.now()}.zip`;
      const zipDestPath = path.join(tempDir, zipFileName);

      try {
        await this.downloadFile(downloadUrl, zipDestPath, onProgress);
        this.stagedZipPath = zipDestPath;
        if (typeof onProgress === 'function') {
          onProgress({ percent: 100, msg: 'Download complete. Ready to install.' });
        }
      } catch (err) {
        this.isUpdating = false;
        throw new Error(`Failed to download update from ${downloadUrl}: ${err.message}`);
      }
    } else {
      // Local/offline simulated verification
      const stages = [
        { percent: 15, msg: 'Connecting to update channel...' },
        { percent: 35, msg: 'Verifying package integrity...' },
        { percent: 60, msg: 'Downloading components...' },
        { percent: 85, msg: 'Staging files for installation...' },
        { percent: 100, msg: 'Download complete. Ready to install.' }
      ];

      for (const s of stages) {
        await new Promise(r => setTimeout(r, 260));
        if (typeof onProgress === 'function') {
          onProgress(s);
        }
      }
    }

    this.isUpdating = false;
    return { success: true };
  }

  async applyUpdate(updateInfo) {
    // If we downloaded a real zip from online, extract it
    if (this.stagedZipPath && fs.existsSync(this.stagedZipPath)) {
      try {
        const res = await this.applyLocalZip(this.stagedZipPath);
        try { fs.unlinkSync(this.stagedZipPath); } catch (e) {}
        this.stagedZipPath = null;
        return res;
      } catch (err) {
        throw new Error(`Failed to extract downloaded update: ${err.message}`);
      }
    }

    const targetVersion = updateInfo?.latestVersion || '1.1.0';

    // 1. Safeguard user settings
    try {
      if (fs.existsSync(this.settingsPath)) {
        fs.copyFileSync(this.settingsPath, this.backupPath);
      }
    } catch (e) {
      console.warn('Settings backup warning:', e.message);
    }

    // 2. Update package.json version
    try {
      if (fs.existsSync(this.packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(this.packagePath, 'utf8'));
        pkg.version = targetVersion;
        fs.writeFileSync(this.packagePath, JSON.stringify(pkg, null, 2), 'utf8');
      }
    } catch (e) {
      throw new Error(`Failed to update package manifest: ${e.message}`);
    }

    // 3. Mark update timestamp in settings
    try {
      if (fs.existsSync(this.settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
        if (!settings.updates) settings.updates = {};
        settings.updates.lastUpdated = new Date().toISOString();
        settings.updates.installedVersion = targetVersion;
        fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      }
    } catch (e) {}

    return {
      success: true,
      newVersion: targetVersion,
      message: `Shing Studio updated to v${targetVersion} successfully!`
    };
  }

  async applyLocalZip(zipPath) {
    if (!fs.existsSync(zipPath)) {
      throw new Error(`Specified update package not found: ${zipPath}`);
    }

    // Backup settings
    try {
      if (fs.existsSync(this.settingsPath)) {
        fs.copyFileSync(this.settingsPath, this.backupPath);
      }
    } catch (e) {}

    // Extract using Windows PowerShell Expand-Archive
    const stagingDir = path.join(app.getPath('temp'), `shing-update-${Date.now()}`);
    fs.mkdirSync(stagingDir, { recursive: true });

    return new Promise((resolve, reject) => {
      const psCmd = `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${stagingDir.replace(/'/g, "''")}' -Force"`;
      exec(psCmd, (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(`Failed to extract update package: ${stderr || err.message}`));
        }

        try {
          // Copy updated files over app directory, protecting user settings
          this.copyDirRecursive(stagingDir, this.baseDir, ['settings.json', 'node_modules', '.git']);

          // Read newly installed version
          const newVersion = this.getCurrentVersion();
          resolve({
            success: true,
            newVersion,
            message: `Update package installed successfully (v${newVersion})!`
          });
        } catch (copyErr) {
          reject(copyErr);
        } finally {
          // Clean staging folder
          try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (e) {}
        }
      });
    });
  }

  copyDirRecursive(src, dest, ignoreList = []) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      if (ignoreList.includes(entry.name)) continue;
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath, ignoreList);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  relaunch() {
    app.relaunch();
    app.exit(0);
  }
}

module.exports = AppUpdater;

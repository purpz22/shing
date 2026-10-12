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
    this.userDataDir = this.resolveUserDataDir();
    this.packagePath = path.join(this.baseDir, 'package.json');
    this.releasesPath = path.join(this.baseDir, 'releases.json');
    this.settingsPath = path.join(this.userDataDir, 'settings.json');
    this.backupPath = path.join(this.userDataDir, 'settings.json.bak');
    this.isUpdating = false;
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

  getCurrentVersion() {
    try {
      if (fs.existsSync(this.packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(this.packagePath, 'utf8').replace(/^\uFEFF/, ''));
        return pkg.version || '1.2.1';
      }
    } catch (e) {
      console.warn('Failed to read package.json version', e.message);
    }
    return '1.2.1';
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

  async fetchRemoteManifest(url, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      try {
        const parsed = new URL(url);
        const client = parsed.protocol === 'https:' ? https : http;
        const headers = Object.assign({
          'User-Agent': 'ShingStudio-Updater',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }, extraHeaders);
        const req = client.get(url, { headers }, res => {
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

    // 1. Try uncached GitHub Contents API first so updates appear immediately without Fastly 5-minute CDN lag
    const apiUrl = `https://api.github.com/repos/purpz22/shing/contents/desktop/releases.json?ref=main&_=${Date.now()}`;
    try {
      manifest = await this.fetchRemoteManifest(apiUrl, { 'Accept': 'application/vnd.github.v3.raw' });
    } catch (_) {}

    // 2. Also check raw feed URL (or fallback to it) and pick whichever has the newest version
    const baseUrl = (customFeedUrl && typeof customFeedUrl === 'string' && customFeedUrl.startsWith('http'))
      ? customFeedUrl
      : 'https://raw.githubusercontent.com/purpz22/shing/main/desktop/releases.json';
    const targetUrl = baseUrl.includes('?') ? `${baseUrl}&_=${Date.now()}` : `${baseUrl}?_=${Date.now()}`;

    try {
      const rawManifest = await this.fetchRemoteManifest(targetUrl);
      if (!manifest || (rawManifest?.latest && this.compareVersions(rawManifest.latest, manifest.latest || '0.0.0') > 0)) {
        manifest = rawManifest;
      }
    } catch (e) {
      if (!manifest) {
        console.warn('Remote update feed unreachable, falling back to local registry:', e.message);
      }
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

    const ver = updateInfo?.latestVersion || this.getCurrentVersion();
    const primaryUrl = updateInfo?.release?.downloadUrl;
    const tempDir = app.getPath('temp');
    const zipFileName = `shing-update-${ver}.zip`;
    const zipDestPath = path.join(tempDir, zipFileName);

    // Build URL candidates list
    const remoteCandidates = [];
    if (primaryUrl && typeof primaryUrl === 'string' && primaryUrl.startsWith('http')) {
      remoteCandidates.push(primaryUrl);
    }
    const rawRepoUrl = `https://raw.githubusercontent.com/purpz22/shing/main/desktop/updates/shing-live-v${ver}.zip`;
    const githubRawUrl = `https://github.com/purpz22/shing/raw/main/desktop/updates/shing-live-v${ver}.zip`;
    const releaseUrl = `https://github.com/purpz22/shing/releases/download/v${ver}/shing-live-v${ver}.zip`;

    if (!remoteCandidates.includes(rawRepoUrl)) remoteCandidates.push(rawRepoUrl);
    if (!remoteCandidates.includes(githubRawUrl)) remoteCandidates.push(githubRawUrl);
    if (!remoteCandidates.includes(releaseUrl)) remoteCandidates.push(releaseUrl);

    let downloaded = false;
    let lastError = null;

    if (typeof onProgress === 'function') {
      onProgress({ percent: 5, msg: 'Connecting to update server...' });
    }

    for (const url of remoteCandidates) {
      try {
        if (typeof onProgress === 'function') {
          onProgress({ percent: 10, msg: `Connecting to ${new URL(url).hostname}...` });
        }
        await this.downloadFile(url, zipDestPath, onProgress);
        if (fs.existsSync(zipDestPath) && fs.statSync(zipDestPath).size > 1000) {
          this.stagedZipPath = zipDestPath;
          downloaded = true;
          break;
        }
      } catch (err) {
        lastError = err;
        console.warn(`Failed candidate ${url}:`, err.message);
      }
    }

    // Local disk fallbacks if remote unreachable
    if (!downloaded) {
      const localCandidates = [
        path.join(this.baseDir, 'updates', `shing-live-v${ver}.zip`),
        path.join(this.baseDir, 'dist', `shing-live-v${ver}.zip`),
        path.join(this.baseDir, `shing-live-v${ver}.zip`)
      ];
      for (const loc of localCandidates) {
        if (fs.existsSync(loc) && fs.statSync(loc).size > 1000) {
          try {
            fs.copyFileSync(loc, zipDestPath);
            this.stagedZipPath = zipDestPath;
            downloaded = true;
            console.log(`Using local update package from ${loc}`);
            break;
          } catch (e) {
            console.warn(`Local copy failed for ${loc}:`, e.message);
          }
        }
      }
    }

    if (downloaded) {
      if (typeof onProgress === 'function') {
        onProgress({ percent: 100, msg: 'Download complete. Ready to install.' });
      }
      this.isUpdating = false;
      return { success: true };
    }

    this.isUpdating = false;
    throw new Error(`Failed to download update package: ${lastError ? lastError.message : 'All download mirrors unreachable'}`);
  }

  createSettingsBackup(tag = 'update') {
    try {
      if (fs.existsSync(this.settingsPath)) {
        fs.copyFileSync(this.settingsPath, this.backupPath);

        const backupsDir = path.join(this.userDataDir, 'backups');
        if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const snapPath = path.join(backupsDir, `settings-${tag}-${timestamp}.json`);
        fs.copyFileSync(this.settingsPath, snapPath);

        const files = fs.readdirSync(backupsDir)
          .filter(f => f.startsWith('settings-') && f.endsWith('.json'))
          .sort()
          .reverse();
        if (files.length > 10) {
          for (let i = 10; i < files.length; i++) {
            try { fs.unlinkSync(path.join(backupsDir, files[i])); } catch (e) {}
          }
        }
      }
    } catch (e) {
      console.warn('Backup creation notice:', e.message);
    }
  }

  ensureSettingsIntact() {
    try {
      if (!fs.existsSync(this.settingsPath) || fs.statSync(this.settingsPath).size === 0) {
        if (fs.existsSync(this.backupPath)) {
          fs.copyFileSync(this.backupPath, this.settingsPath);
          console.log('Restored settings.json from primary backup!');
        } else {
          const backupsDir = path.join(this.userDataDir, 'backups');
          if (fs.existsSync(backupsDir)) {
            const files = fs.readdirSync(backupsDir)
              .filter(f => f.startsWith('settings-') && f.endsWith('.json'))
              .sort()
              .reverse();
            if (files.length > 0) {
              fs.copyFileSync(path.join(backupsDir, files[0]), this.settingsPath);
              console.log('Restored settings.json from historical snapshot:', files[0]);
            }
          }
        }
      }
    } catch (e) {
      console.error('Settings verification note:', e.message);
    }
  }

  async applyUpdate(updateInfo) {
    // 1. Create multi-layer snapshot backups before touching any file
    this.createSettingsBackup('pre-update');

    // If we downloaded a real zip from online, extract it
    if (this.stagedZipPath && fs.existsSync(this.stagedZipPath)) {
      try {
        const res = await this.applyLocalZip(this.stagedZipPath);
        try { fs.unlinkSync(this.stagedZipPath); } catch (e) {}
        this.stagedZipPath = null;
        this.ensureSettingsIntact();
        return res;
      } catch (err) {
        throw new Error(`Failed to extract downloaded update: ${err.message}`);
      }
    }

    const targetVersion = updateInfo?.latestVersion || '1.1.0';

    // 2. Update package.json version
    try {
      if (fs.existsSync(this.packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(this.packagePath, 'utf8').replace(/^\uFEFF/, ''));
        pkg.version = targetVersion;
        fs.writeFileSync(this.packagePath, JSON.stringify(pkg, null, 2), 'utf8');
      }
    } catch (e) {
      throw new Error(`Failed to update package manifest: ${e.message}`);
    }

    // 3. Mark update timestamp in settings
    try {
      if (fs.existsSync(this.settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8').replace(/^\uFEFF/, ''));
        if (!settings.updates) settings.updates = {};
        settings.updates.lastUpdated = new Date().toISOString();
        settings.updates.installedVersion = targetVersion;
        fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      }
    } catch (e) {}

    this.ensureSettingsIntact();

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

    // 1. Create multi-layer snapshot backups
    this.createSettingsBackup('pre-local-update');

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
          // Check if destination directory is writable by standard user process
          let isWritable = true;
          const testFile = path.join(this.baseDir, `.shing-write-test-${Date.now()}`);
          try {
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
          } catch (permErr) {
            isWritable = false;
          }

          if (!isWritable) {
            // Protected directory (e.g. C:\Program Files (x86)): run elevated PowerShell worker
            const elevatedCmd = `Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command Copy-Item -Path \"\"${stagingDir}\\*\"\" -Destination \"\"${this.baseDir}\"\" -Recurse -Force -Exclude settings.json,settings.json.bak,app-icon.ico'`;
            const psRunner = `powershell -NoProfile -Command "${elevatedCmd}"`;

            exec(psRunner, (elevErr) => {
              try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (e) {}
              if (elevErr) {
                return reject(new Error(`Elevated installation failed or was cancelled: ${elevErr.message}`));
              }
              this.ensureSettingsIntact();
              const newVersion = this.getCurrentVersion();
              resolve({
                success: true,
                newVersion,
                message: `Update package installed successfully with administrator elevation (v${newVersion})!`
              });
            });
            return;
          }

          // Copy updated files over app directory, explicitly preserving settings.json and backups
          this.copyDirRecursive(stagingDir, this.baseDir, ['settings.json', 'settings.json.bak', 'backups', 'node_modules', '.git']);

          // Safeguard: Guarantee settings.json exists and is valid
          this.ensureSettingsIntact();

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
        // Skip in-use icons if already present to prevent Windows file lock EPERM
        if ((entry.name === 'app-icon.ico' || entry.name === 'app-icon.png') && fs.existsSync(destPath)) {
          continue;
        }
        try {
          fs.copyFileSync(srcPath, destPath);
        } catch (copyErr) {
          if (entry.name.endsWith('.ico') || entry.name.endsWith('.png')) {
            console.warn(`Skipping in-use asset ${entry.name}:`, copyErr.message);
            continue;
          }
          throw copyErr;
        }
      }
    }
  }

  relaunch() {
    app.relaunch();
    app.exit(0);
  }
}

module.exports = AppUpdater;

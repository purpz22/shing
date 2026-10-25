'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const baseDir = path.resolve(__dirname, '..');
const updatesDir = path.join(baseDir, 'updates');
if (!fs.existsSync(updatesDir)) fs.mkdirSync(updatesDir, { recursive: true });

const ver = '1.8.0';
const zipName = `shing-live-v${ver}.zip`;
const zipPath = path.join(updatesDir, zipName);

const includeItems = [
  'assets',
  'overlays',
  'renderer',
  'server',
  'services',
  'main.js',
  'preload.js',
  'package.json',
  'releases.json'
];

if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const existingItems = includeItems
  .filter(item => fs.existsSync(path.join(baseDir, item)))
  .join(' ');

const cmd = `tar -a -cf "updates/${zipName}" ${existingItems}`;
console.log('Compressing update archive with tar...');
execSync(cmd, { cwd: baseDir, stdio: 'inherit' });

const fileBytes = fs.readFileSync(zipPath);
const sizeMB = `${(fileBytes.length / (1024 * 1024)).toFixed(2)} MB`;
const hash = crypto.createHash('sha256').update(fileBytes).digest('hex');

console.log(`Created: ${zipPath}`);
console.log(`Size:    ${sizeMB}`);
console.log(`SHA-256: ${hash}`);

const releasesPath = path.join(baseDir, 'releases.json');
const releases = JSON.parse(fs.readFileSync(releasesPath, 'utf8'));
releases.latest = ver;
const rel = releases.releases.find(r => r.version === ver);
if (rel) {
  rel.checksum = hash;
  rel.packageSize = sizeMB;
}
fs.writeFileSync(releasesPath, JSON.stringify(releases, null, 2), 'utf8');
console.log('Successfully updated releases.json.');

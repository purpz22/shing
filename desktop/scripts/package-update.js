'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const baseDir = path.resolve(__dirname, '..');
const distDir = path.join(baseDir, 'dist');
const pkgPath = path.join(baseDir, 'package.json');
const releasesPath = path.join(baseDir, 'releases.json');

// Get version from CLI argument or package.json
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const targetVersion = process.argv[2] || pkg.version || '1.1.0';

console.log(`====================================================`);
console.log(`Shing Studio - Packaging Update v${targetVersion}`);
console.log(`====================================================\n`);

// Ensure dist folder exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const zipName = `shing-studio-v${targetVersion}.zip`;
const zipPath = path.join(distDir, zipName);

// Files and folders to include in the update zip
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

const existingItems = includeItems
  .filter(item => fs.existsSync(path.join(baseDir, item)))
  .join(', ');

console.log(`Packaging items: ${existingItems}...`);

// Compress using Windows PowerShell Compress-Archive
try {
  if (fs.existsSync(zipPath)) {
    try { fs.unlinkSync(zipPath); } catch (e) {}
  }

  const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path ${existingItems} -DestinationPath 'dist/${zipName}' -Force"`;
  execSync(psCmd, { cwd: baseDir, stdio: 'inherit' });

  // Calculate file size and SHA256 checksum
  const fileBytes = fs.readFileSync(zipPath);
  const sizeMB = (fileBytes.length / (1024 * 1024)).toFixed(2);
  const hash = crypto.createHash('sha256').update(fileBytes).digest('hex');

  console.log(`\nSuccessfully created update package!`);
  console.log(`  File:     ${zipPath}`);
  console.log(`  Size:     ${sizeMB} MB`);
  console.log(`  SHA-256:  ${hash}`);

  // Update releases.json if present
  if (fs.existsSync(releasesPath)) {
    const releasesData = JSON.parse(fs.readFileSync(releasesPath, 'utf8'));
    releasesData.latest = targetVersion;
    const existingRelease = releasesData.releases?.find(r => r.version === targetVersion);
    if (existingRelease) {
      existingRelease.checksum = hash;
      existingRelease.packageSize = `${sizeMB} MB`;
    }
    fs.writeFileSync(releasesPath, JSON.stringify(releasesData, null, 2), 'utf8');
    console.log(`  Updated ${releasesPath} with target version v${targetVersion}.`);
  }

  console.log(`\n----------------------------------------------------`);
  console.log(`NEXT STEPS TO PUBLISH THIS UPDATE ONLINE:`);
  console.log(`----------------------------------------------------`);
  console.log(`1. Upload '${zipName}' from '${distDir}' to GitHub Releases or your file host.`);
  console.log(`2. Copy the public download URL of the uploaded zip.`);
  console.log(`3. In 'releases.json', set 'downloadUrl' to that public URL.`);
  console.log(`4. Push 'releases.json' to GitHub or host it at your Feed URL.`);
  console.log(`All streamers running Shing Studio will now detect and download this update!\n`);

} catch (err) {
  console.error(`Failed to create update zip archive:`, err.message);
  process.exit(1);
}

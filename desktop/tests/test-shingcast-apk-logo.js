'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

console.log('Testing ShingCast APK Logo and Android Launcher Branding...');

const apkPaths = [
  path.join(__dirname, '../../android/ShingCast-debug.apk'),
  path.join(__dirname, '../assets/ShingCast-debug.apk')
];

apkPaths.forEach(apkPath => {
  assert(fs.existsSync(apkPath), `APK must exist at ${apkPath}`);
  const stat = fs.statSync(apkPath);
  assert(stat.size > 10 * 1024 * 1024, `APK at ${apkPath} is too small (${stat.size} bytes)`);
});

const primaryApk = apkPaths[0];

const pythonScript = `
import zipfile, sys

with zipfile.ZipFile(sys.argv[1], "r") as z:
    names = set(z.namelist())
    required = [
        "res/drawable/ic_logo.png",
        "res/drawable/ic_launcher_background.xml",
        "res/mipmap-anydpi-v26/ic_launcher.xml",
        "res/mipmap-anydpi-v26/ic_launcher_round.xml",
        "res/mipmap-mdpi-v4/ic_launcher.webp",
        "res/mipmap-mdpi-v4/ic_launcher_round.webp",
        "res/mipmap-mdpi-v4/ic_launcher_foreground.webp",
        "res/mipmap-hdpi-v4/ic_launcher.webp",
        "res/mipmap-hdpi-v4/ic_launcher_round.webp",
        "res/mipmap-hdpi-v4/ic_launcher_foreground.webp",
        "res/mipmap-xhdpi-v4/ic_launcher.webp",
        "res/mipmap-xhdpi-v4/ic_launcher_round.webp",
        "res/mipmap-xhdpi-v4/ic_launcher_foreground.webp",
        "res/mipmap-xxhdpi-v4/ic_launcher.webp",
        "res/mipmap-xxhdpi-v4/ic_launcher_round.webp",
        "res/mipmap-xxhdpi-v4/ic_launcher_foreground.webp",
        "res/mipmap-xxxhdpi-v4/ic_launcher.webp",
        "res/mipmap-xxxhdpi-v4/ic_launcher_round.webp",
        "res/mipmap-xxxhdpi-v4/ic_launcher_foreground.webp",
    ]
    missing = [r for r in required if r not in names]
    if missing:
        print("Missing in APK:", missing)
        sys.exit(1)

    for r in required:
        info = z.getinfo(r)
        if info.file_size < 100:
            print(f"File {r} is too small: {info.file_size} bytes")
            sys.exit(1)

print("APK logo and launcher assets verified inside APK archive.")
`;

execFileSync('python', ['-c', pythonScript, primaryApk], { stdio: 'inherit' });

// Also verify source project files in android/ShingCast
const resDir = path.join(__dirname, '../../android/ShingCast/app/src/main/res');
assert(fs.existsSync(path.join(resDir, 'drawable/ic_logo.png')), 'Source drawable/ic_logo.png must exist');
assert(fs.existsSync(path.join(resDir, 'drawable/ic_launcher_background.xml')), 'Source drawable/ic_launcher_background.xml must exist');
assert(fs.existsSync(path.join(resDir, 'mipmap-anydpi-v26/ic_launcher.xml')), 'Source mipmap-anydpi-v26/ic_launcher.xml must exist');
assert(fs.existsSync(path.join(resDir, 'mipmap-anydpi-v26/ic_launcher_round.xml')), 'Source mipmap-anydpi-v26/ic_launcher_round.xml must exist');

// Verify MainScreen.kt references ic_logo
const mainScreenPath = path.join(__dirname, '../../android/ShingCast/app/src/main/java/com/example/shingcast/ui/main/MainScreen.kt');
const mainScreenContent = fs.readFileSync(mainScreenPath, 'utf8');
assert(mainScreenContent.includes('R.drawable.ic_logo'), 'MainScreen.kt must reference R.drawable.ic_logo');
assert(mainScreenContent.includes('contentDescription = "Shing Cast Logo"'), 'MainScreen.kt must have logo image');

console.log('PASS: All ShingCast APK logo and launcher branding tests passed successfully!');

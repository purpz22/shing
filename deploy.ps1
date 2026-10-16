param(
    [switch]$Force,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$FtpHost = 'ftpupload.net'
$FtpUser = 'if0_41895622'
$FtpPass = 'lkKLW25q6ThWgvj'
$RemoteBase = 'ftp://ftpupload.net/purpleeez.site/htdocs/shing'

$RootDir = $PSScriptRoot
$CacheFile = Join-Path $RootDir '.deploy-cache.json'

# Keep live.svg synced with index.html for Cloudflare edge caching (bypasses InfinityFree cookie challenge in TikTok Studio)
$IndexFile = Join-Path $RootDir 'index.html'
$LiveSvgFile = Join-Path $RootDir 'live.svg'
if (Test-Path $IndexFile) {
    $IndexHash = (Get-FileHash -Path $IndexFile -Algorithm SHA256).Hash
    $LiveHash = if (Test-Path $LiveSvgFile) { (Get-FileHash -Path $LiveSvgFile -Algorithm SHA256).Hash } else { '' }
    if ($IndexHash -ne $LiveHash) {
        Copy-Item -Path $IndexFile -Destination $LiveSvgFile -Force
    }
}

# Keep root banner.html synced with desktop/overlays/banner.html for remote web hosting (purpleeez.site/shing/banner.html)
$OverlayBannerFile = Join-Path $RootDir 'desktop\overlays\banner.html'
$RootBannerFile = Join-Path $RootDir 'banner.html'
if (Test-Path $OverlayBannerFile) {
    $OverlayBannerHash = (Get-FileHash -Path $OverlayBannerFile -Algorithm SHA256).Hash
    $RootBannerHash = if (Test-Path $RootBannerFile) { (Get-FileHash -Path $RootBannerFile -Algorithm SHA256).Hash } else { '' }
    if ($OverlayBannerHash -ne $RootBannerHash) {
        Copy-Item -Path $OverlayBannerFile -Destination $RootBannerFile -Force
    }
}

# Keep root pngtuber.html synced with desktop/overlays/pngtuber.html for remote web hosting (purpleeez.site/shing/pngtuber.html)
$OverlayPngTuberFile = Join-Path $RootDir 'desktop\overlays\pngtuber.html'
$RootPngTuberFile = Join-Path $RootDir 'pngtuber.html'
if (Test-Path $OverlayPngTuberFile) {
    $OverlayPngTuberHash = (Get-FileHash -Path $OverlayPngTuberFile -Algorithm SHA256).Hash
    $RootPngTuberHash = if (Test-Path $RootPngTuberFile) { (Get-FileHash -Path $RootPngTuberFile -Algorithm SHA256).Hash } else { '' }
    if ($OverlayPngTuberHash -ne $RootPngTuberHash) {
        Copy-Item -Path $OverlayPngTuberFile -Destination $RootPngTuberFile -Force
    }
}

# Keep root phone.html synced with desktop/overlays/phone.html for remote web hosting (purpleeez.site/shing/phone.html)
$OverlayPhoneFile = Join-Path $RootDir 'desktop\overlays\phone.html'
$RootPhoneFile = Join-Path $RootDir 'phone.html'
if (Test-Path $OverlayPhoneFile) {
    $OverlayPhoneHash = (Get-FileHash -Path $OverlayPhoneFile -Algorithm SHA256).Hash
    $RootPhoneHash = if (Test-Path $RootPhoneFile) { (Get-FileHash -Path $RootPhoneFile -Algorithm SHA256).Hash } else { '' }
    if ($OverlayPhoneHash -ne $RootPhoneHash) {
        Copy-Item -Path $OverlayPhoneFile -Destination $RootPhoneFile -Force
    }
}

$AllowedExtensions = @(
    '.html', '.htm', '.css', '.js', '.mjs', '.json',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
    '.mp3', '.ogg', '.wav', '.mp4', '.webm',
    '.woff', '.woff2', '.ttf', '.otf'
)
$ExcludedNames = @(
    '.deploy-cache.json', 'deploy.ps1', 'deploy.bat', 'overlay.svg'
)
$ExcludedDirs = @(
    'desktop', 'node_modules', 'bedrock_server'
)

# Load previous SHA-256 cache
$Cache = @{}
if ((Test-Path $CacheFile) -and -not $Force) {
    try {
        $RawJson = Get-Content -Path $CacheFile -Raw | ConvertFrom-Json
        foreach ($Prop in $RawJson.PSObject.Properties) {
            $Cache[$Prop.Name] = [string]$Prop.Value
        }
    } catch {
        Write-Warning "Could not parse .deploy-cache.json, starting fresh cache."
    }
}

# Scan local web files (including .htaccess)
$Files = Get-ChildItem -Path $RootDir -File -Force -Recurse | Where-Object {
    $Rel = $_.FullName.Substring($RootDir.Length).TrimStart('\', '/')
    $TopSeg = ($Rel -split '[\\/]')[0]
    ($ExcludedDirs -notcontains $TopSeg) -and
    ($ExcludedNames -notcontains $_.Name) -and
    (($_.Name -eq '.htaccess') -or (
        (-not $TopSeg.StartsWith('.')) -and
        ($AllowedExtensions -contains $_.Extension.ToLowerInvariant())
    ))
}

$Changed = @()
$Skipped = 0

foreach ($File in $Files) {
    $RelPath = $File.FullName.Substring($RootDir.Length).TrimStart('\', '/').Replace('\', '/')
    $Hash = (Get-FileHash -Path $File.FullName -Algorithm SHA256).Hash
    if ($Cache.ContainsKey($RelPath) -and $Cache[$RelPath] -eq $Hash) {
        $Skipped++
    } else {
        $Changed += [PSCustomObject]@{
            FullName = $File.FullName
            RelPath  = $RelPath
            Length   = $File.Length
            Hash     = $Hash
        }
    }
}

if ($Changed.Count -eq 0) {
    Write-Host "No changed files to upload ($Skipped unchanged file(s) skipped)." -ForegroundColor Green
    exit 0
}

Write-Host "Found $($Changed.Count) changed file(s) to upload ($Skipped unchanged skipped):" -ForegroundColor Cyan
foreach ($Item in $Changed) {
    Write-Host "  -> $($Item.RelPath) ($($Item.Length) bytes)"
}

if ($DryRun) {
    Write-Host "Dry run complete. No files uploaded." -ForegroundColor Yellow
    exit 0
}

$UploadedCount = 0
foreach ($Item in $Changed) {
    if ($UploadedCount -gt 0) {
        Start-Sleep -Milliseconds 600
    }
    $RemoteUrl = "$RemoteBase/$($Item.RelPath)"
    Write-Host "Uploading [$($UploadedCount + 1)/$($Changed.Count)] $($Item.RelPath) ..." -NoNewline
    & curl.exe -s -S --ftp-create-dirs --user "${FtpUser}:${FtpPass}" -T $Item.FullName $RemoteUrl
    if ($LASTEXITCODE -ne 0) {
        Write-Host " FAILED (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host " OK" -ForegroundColor Green
    $Cache[$Item.RelPath] = $Item.Hash
    $UploadedCount++

    # Save cache after each file so interrupted runs never re-upload completed files
    $Cache | ConvertTo-Json -Depth 4 | Set-Content -Path $CacheFile -Encoding UTF8
}

# Warm Cloudflare edge cache for live.svg so cookieless clients (TikTok LIVE Studio / OBS) get a direct HIT
Write-Host "Warming Cloudflare edge cache for https://purpleeez.site/shing/live.svg?v=6 ..." -NoNewline
@'
const crypto = require('crypto');
const https = require('https');
function get(url, cookie) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        ...(cookie ? { 'Cookie': cookie } : {})
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
    }).on('error', reject);
  });
}
(async () => {
  const r1 = await get('https://purpleeez.site/shing/');
  const hexes = [...r1.body.matchAll(/toNumbers\("([0-9a-f]+)"\)/g)].map(x => x[1]);
  let cookie = '';
  if (hexes.length >= 3) {
    const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(hexes[0], 'hex'), Buffer.from(hexes[1], 'hex'));
    decipher.setAutoPadding(false);
    cookie = '__test=' + Buffer.concat([decipher.update(Buffer.from(hexes[2], 'hex')), decipher.final()]).toString('hex');
  }
  await get('https://purpleeez.site/shing/live.svg', cookie);
  await get('https://purpleeez.site/shing/live.svg?v=6', cookie);
  const verify = await get('https://purpleeez.site/shing/live.svg?v=6');
  if (verify.body.includes('slowAES') || !verify.body.includes('hairStyle')) process.exit(1);
})();
'@ | node -
if ($LASTEXITCODE -eq 0) {
    Write-Host " OK (Cloudflare HIT verified)" -ForegroundColor Green
} else {
    Write-Host " Warning: cache warm check returned non-zero" -ForegroundColor Yellow
}

Write-Host "Done. Uploaded $UploadedCount changed file(s) to https://purpleeez.site/shing" -ForegroundColor Green

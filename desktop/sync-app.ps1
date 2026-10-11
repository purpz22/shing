param(
  [string]$CommitMessage = "Update Shing Studio - Full application sync",
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$desktopDir = $PSScriptRoot
$rootDir = (Get-Item $desktopDir).Parent.FullName

Write-Host "===================================================="
Write-Host "Shing Studio - Full Application Sync & Packaging"
Write-Host "===================================================="

# Determine Version
$pkgPath = Join-Path $desktopDir "package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$currentVer = $pkg.version

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = $currentVer
} else {
  $pkg.version = $Version
  $pkg | ConvertTo-Json -Depth 5 | Set-Content $pkgPath -Encoding UTF8
  Write-Host "Updated package.json to v$Version"
}

# 1. Validate JS syntax
Write-Host "`n[1/4] Validating JavaScript syntax..."
$jsFiles = @("main.js", "preload.js", "server/overlayServer.js", "services/updater.js", "renderer/app.js")
foreach ($f in $jsFiles) {
  $full = Join-Path $desktopDir $f
  if (Test-Path $full) {
    node -c $full
  }
}
Write-Host "Syntax check passed!"

# 2. Package the complete application bundle
Write-Host "`n[2/4] Packaging full application archive (.zip)..."
& (Join-Path $desktopDir "package-update.ps1") -Version $Version

# 3. Git Stage & Commit
Write-Host "`n[3/4] Staging and committing full application changes..."
Set-Location $rootDir
git add .
$status = git status --porcelain
if ($status) {
  git commit -m "$CommitMessage (v$Version)"
} else {
  Write-Host "No unstaged changes to commit."
}

# 4. Push to GitHub
Write-Host "`n[4/4] Pushing whole app to GitHub (origin main)..."
git push origin main

Write-Host "`n===================================================="
Write-Host "Whole App Sync Complete! Version v$Version is live online."
Write-Host "====================================================`n"

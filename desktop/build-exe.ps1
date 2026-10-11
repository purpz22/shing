param(
  [string]$Version = "",
  [switch]$BuildInstaller
)

$ErrorActionPreference = "Stop"
$desktopDir = $PSScriptRoot

Write-Host "===================================================="
Write-Host "Shing Live - Windows Executable (.exe) Builder"
Write-Host "===================================================="

# Load package.json
$pkgPath = Join-Path $desktopDir "package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$appVersion = if ([string]::IsNullOrWhiteSpace($Version)) { $pkg.version } else { $Version }

Write-Host "Application Name: Shing Live"
Write-Host "Target Version:   v$appVersion"
Write-Host "Executable Name:  Shing Live.exe"
Write-Host "Architecture:     Windows x64"

# Ensure output directory
$distDir = Join-Path $desktopDir "dist"
if (!(Test-Path $distDir)) {
  New-Item -ItemType Directory -Path $distDir | Out-Null
}

Write-Host "`nRunning electron-packager..."
& npx electron-packager $desktopDir "Shing Live" `
  --platform=win32 `
  --arch=x64 `
  --out=$distDir `
  --icon=(Join-Path $desktopDir "assets/app-icon.ico") `
  --executable-name="Shing Live" `
  --overwrite `
  --prune=true `
  --win32metadata.ProductName="Shing Live" `
  --win32metadata.FileDescription="Shing Live - TikTok Live Streamer Companion" `
  --win32metadata.OriginalFilename="Shing Live.exe" `
  --win32metadata.CompanyName="Shing"

$exeDir = Join-Path $distDir "Shing Live-win32-x64"
$exePath = Join-Path $exeDir "Shing Live.exe"

if (Test-Path $exePath) {
  Write-Host "`nSUCCESS! Executable created at:"
  Write-Host "  $exePath"

  # Also create a standalone zip archive of the complete executable distribution
  $portableZip = Join-Path $distDir "Shing-Live-v$appVersion-Windows-Portable.zip"
  Write-Host "`nCreating portable distribution archive..."
  if (Test-Path $portableZip) { Remove-Item $portableZip -Force }
  Compress-Archive -Path "$exeDir\*" -DestinationPath $portableZip -Force
  Write-Host "Portable archive created at:"
  Write-Host "  $portableZip"
  if ($BuildInstaller) {
    Write-Host "`nInvoking Windows Installer compiler..."
    & (Join-Path $desktopDir "build-installer.ps1") -Version $appVersion
  }

  Write-Host "`n===================================================="
  Write-Host "Build complete! You can run 'Shing Live.exe' directly."
  Write-Host "===================================================="
} else {
  Write-Error "Failed to find built executable at $exePath"
}

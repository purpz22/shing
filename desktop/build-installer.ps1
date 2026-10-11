param(
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$desktopDir = $PSScriptRoot

Write-Host "===================================================="
Write-Host "Shing Live - Windows Setup Installer (.exe) Builder"
Write-Host "===================================================="

# Load package.json
$pkgPath = Join-Path $desktopDir "package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$appVersion = if ([string]::IsNullOrWhiteSpace($Version)) { $pkg.version } else { $Version }

$distDir = Join-Path $desktopDir "dist"
$exePath = Join-Path $distDir "Shing Live-win32-x64\Shing Live.exe"

if (!(Test-Path $exePath)) {
  Write-Host "Packaged binaries not found. Building executable first..."
  & (Join-Path $desktopDir "build-exe.ps1") -Version $appVersion
}

$issPath = Join-Path $desktopDir "installer.iss"
if (!(Test-Path $issPath)) {
  Write-Error "Installer script not found at $issPath"
}

# Update version in installer.iss to match current app version
$issContent = Get-Content $issPath -Raw
$issContent = [regex]::Replace($issContent, '(#define\s+MyAppVersion\s+)".*?"', "`$1`"$appVersion`"")
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($issPath, $issContent, $utf8NoBom)

# Find ISCC.exe
$isccPath = Join-Path $desktopDir "node_modules\innosetup-compiler\bin\ISCC.exe"
if (!(Test-Path $isccPath)) {
  $isccCmd = Get-Command "iscc.exe" -ErrorAction SilentlyContinue
  if ($isccCmd) {
    $isccPath = $isccCmd.Source
  } else {
    Write-Error "Inno Setup Compiler (ISCC.exe) not found in node_modules or system PATH."
  }
}

Write-Host "Compiling Windows installer with Inno Setup..."
& $isccPath $issPath

$setupExePath = Join-Path $distDir "Shing-Live-Setup-v$appVersion.exe"
if (Test-Path $setupExePath) {
  $sizeMB = [math]::Round(((Get-Item -Path $setupExePath).Length / 1MB), 2)
  Write-Host "`nSUCCESS! Windows Installer created at:"
  Write-Host "  $setupExePath ($sizeMB MB)"
  Write-Host "`n===================================================="
  Write-Host "Installer ready! Streamers can run this to install Shing Live."
  Write-Host "===================================================="
} else {
  Write-Error "Failed to find generated installer at $setupExePath"
}

param(
  [string]$Version = "1.2.1"
)

Write-Host "===================================================="
Write-Host "Shing Live - Packaging Update v$Version"
Write-Host "===================================================="

$baseDir = $PSScriptRoot
$distDir = Join-Path $baseDir "dist"
if (!(Test-Path $distDir)) {
  New-Item -ItemType Directory -Path $distDir | Out-Null
}

$zipName = "shing-live-v$Version.zip"
$zipPath = Join-Path $distDir $zipName
if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

$items = @("assets", "overlays", "renderer", "server", "services", "main.js", "preload.js", "package.json", "releases.json")
$stagingDir = Join-Path $env:TEMP "shing-pkg-$Version"
if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $stagingDir | Out-Null

foreach ($item in $items) {
  $p = Join-Path $baseDir $item
  if (Test-Path $p) {
    if ((Get-Item $p).PSIsContainer) {
      Copy-Item -Path $p -Destination $stagingDir -Recurse -Force
    } else {
      Copy-Item -Path $p -Destination $stagingDir -Force
    }
  }
}

# Remove in-use locked icons from update archive so client never encounters file lock
$icoFile = Join-Path $stagingDir "assets/app-icon.ico"
if (Test-Path $icoFile) { Remove-Item $icoFile -Force }
$pngFile = Join-Path $stagingDir "assets/app-icon.png"
if (Test-Path $pngFile) { Remove-Item $pngFile -Force }
# Remove APK binaries from desktop update archive so update package remains lightweight
Get-ChildItem -Path $stagingDir -Recurse -Filter "*.apk" | Remove-Item -Force

Write-Host "Compressing components to $zipName..."
Compress-Archive -Path "$stagingDir\*" -DestinationPath $zipPath -Force
Remove-Item $stagingDir -Recurse -Force

$hasher = [System.Security.Cryptography.SHA256]::Create()
$fileStream = [System.IO.File]::OpenRead($zipPath)
$hash = [System.BitConverter]::ToString($hasher.ComputeHash($fileStream)).Replace("-", "").ToLower()
$fileStream.Close()
$sizeMB = [math]::Round(((Get-Item -Path $zipPath).Length / 1MB), 2)

Write-Host "`nSuccessfully created update package!"
Write-Host "  Path:    $zipPath"
Write-Host "  Size:    $sizeMB MB"
Write-Host "  SHA-256: $hash"

# Also copy to desktop/updates directory for direct GitHub hosting
$updatesDir = Join-Path $baseDir "updates"
if (!(Test-Path $updatesDir)) {
  New-Item -ItemType Directory -Path $updatesDir | Out-Null
}
Copy-Item $zipPath (Join-Path $updatesDir $zipName) -Force

# Update releases.json
$releasesPath = Join-Path $baseDir "releases.json"
if (Test-Path $releasesPath) {
  try {
    $json = Get-Content $releasesPath -Raw | ConvertFrom-Json
    $json.latest = $Version
    $rel = $json.releases | Where-Object { $_.version -eq $Version }
    if ($rel) {
      $relUrl = "https://raw.githubusercontent.com/purpz22/shing/main/desktop/updates/$zipName"
      if ($rel.PSObject.Properties['downloadUrl']) { $rel.downloadUrl = $relUrl } else { $rel | Add-Member -NotePropertyName "downloadUrl" -NotePropertyValue $relUrl }
      if ($rel.PSObject.Properties['checksum']) { $rel.checksum = $hash } else { $rel | Add-Member -NotePropertyName "checksum" -NotePropertyValue $hash }
      if ($rel.PSObject.Properties['packageSize']) { $rel.packageSize = "$sizeMB MB" } else { $rel | Add-Member -NotePropertyName "packageSize" -NotePropertyValue "$sizeMB MB" }
    }
    $jsonTxt = $json | ConvertTo-Json -Depth 10
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($releasesPath, $jsonTxt, $utf8NoBom)
    Write-Host "  Updated releases.json with latest checksum and size."
  } catch {
    Write-Warning "Could not update releases.json: $_"
  }
}

Write-Host "`n----------------------------------------------------"
Write-Host "NEXT STEPS TO PUBLISH ONLINE:"
Write-Host "----------------------------------------------------"
Write-Host "1. Upload '$zipName' to GitHub Releases (or Google Drive, Dropbox, Vercel, etc.)."
Write-Host "2. Copy the public download link of the uploaded zip."
Write-Host "3. In 'releases.json', set 'downloadUrl' to that public link."
Write-Host "4. Host 'releases.json' online (e.g. GitHub raw URL)."
Write-Host "Streamers will automatically detect and install this update!`n"

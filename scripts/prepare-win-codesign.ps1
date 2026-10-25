# electron-builder downloads a winCodeSign bundle containing macOS symlinks. On
# Windows without Developer Mode, 7-Zip cannot create those links and aborts the
# whole extraction. The Windows signing tools we need do not use them, so extract
# the bundle without preserving symlinks before electron-builder runs.
$ErrorActionPreference = 'Stop'

$cacheRoot = if ($env:ELECTRON_BUILDER_CACHE) {
  $env:ELECTRON_BUILDER_CACHE.TrimEnd('\', '/')
} else {
  Join-Path $env:LOCALAPPDATA 'electron-builder\Cache'
}
$vendorRoot = Join-Path $cacheRoot 'winCodeSign'
$target = Join-Path $vendorRoot 'winCodeSign-2.6.0'
$signtool = Join-Path $target 'windows-10\x64\signtool.exe'

if (Test-Path $signtool) {
  Write-Host 'winCodeSign cache already prepared.'
  exit 0
}

$sevenZip = Join-Path $PSScriptRoot '..\node_modules\7zip-bin\win\x64\7za.exe'
if (-not (Test-Path $sevenZip)) {
  throw "7-Zip not found at $sevenZip. Run npm install first."
}

New-Item -ItemType Directory -Force -Path $vendorRoot, $target | Out-Null
$archive = Join-Path $vendorRoot 'winCodeSign-2.6.0.7z'
if (-not (Test-Path $archive)) {
  $url = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z'
  Write-Host 'Downloading winCodeSign tools...'
  Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing
}

Write-Host 'Extracting winCodeSign tools without macOS symlinks...'
& $sevenZip x $archive "-o$target" -y -snl- | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "winCodeSign extraction failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $signtool)) {
  throw "winCodeSign extraction finished but $signtool is missing."
}
Write-Host 'winCodeSign cache ready.'

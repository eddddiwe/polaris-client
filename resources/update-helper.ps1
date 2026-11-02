param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][string]$Sha256,
  [Parameter(Mandatory = $true)][int]$ParentPid,
  [string]$AppExe = "",
  [string]$LogPath = "",
  [string]$TaskXml = ""
)

$ErrorActionPreference = "SilentlyContinue"
$taskName = "PolarisClientUpdate"

if (-not $LogPath) {
  $LogPath = Join-Path $env:APPDATA "Polaris\logs\update-helper.log"
}
$logDir = Split-Path -Parent $LogPath
if ($logDir -and -not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Write-Log([string]$message) {
  Add-Content -LiteralPath $LogPath -Value ((Get-Date).ToString("o") + " " + $message)
}

Write-Log "helper start parent=$ParentPid"

if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) {
  Write-Log "installer is missing: $Installer"
  exit 2
}

$expected = $Sha256.Trim().ToUpperInvariant()
if ($expected -notmatch "^[0-9A-F]{64}$") {
  Write-Log "invalid expected SHA-256"
  exit 2
}

# Hold a read-only handle before hashing and through execution. Windows then
# refuses writes that could replace the installer between verification and
# Start-Process.
$stream = [System.IO.File]::Open(
  $Installer,
  [System.IO.FileMode]::Open,
  [System.IO.FileAccess]::Read,
  [System.IO.FileShare]::Read
)

$installed = $false
try {
  $actual = (Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash
  if ($actual -ne $expected) {
    Write-Log "installer hash mismatch; refusing to execute"
    exit 3
  }
  Write-Log "installer hash verified"

  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline -and (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) {
    Start-Sleep -Milliseconds 400
  }
  Start-Sleep -Milliseconds 1200
  Write-Log "launcher process exited; starting installer"

  for ($attempt = 0; $attempt -lt 8; $attempt++) {
    try {
      $proc = Start-Process -FilePath $Installer -ArgumentList "/S" -Wait -PassThru
      Write-Log "installer attempt $attempt exit=$($proc.ExitCode)"
      if ($proc -and $proc.ExitCode -eq 0) {
        $installed = $true
        break
      }
    } catch {
      Write-Log "installer attempt $attempt failed: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 2
  }

  if ($installed) {
    Write-Log "install succeeded"
    if ($AppExe -and (Test-Path -LiteralPath $AppExe)) {
      Write-Log "relaunching $AppExe"
      Start-Process -FilePath $AppExe
    } else {
      Write-Log "app executable not found for relaunch"
    }
  } else {
    Write-Log "silent install failed; opening the verified installer"
    Start-Process -FilePath $Installer
  }
} finally {
  $stream.Dispose()
}

schtasks.exe /Delete /TN $taskName /F | Out-Null
if ($TaskXml -and (Test-Path -LiteralPath $TaskXml)) {
  Remove-Item -LiteralPath $TaskXml -Force
}
Write-Log "helper finished"

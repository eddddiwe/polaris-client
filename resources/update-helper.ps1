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

function Remove-UpdateTask {
  schtasks.exe /Delete /TN $taskName /F | Out-Null
  if ($TaskXml -and (Test-Path -LiteralPath $TaskXml)) {
    Remove-Item -LiteralPath $TaskXml -Force
  }
}

function Wait-ForLauncher {
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline -and (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) {
    Start-Sleep -Milliseconds 400
  }
  Start-Sleep -Milliseconds 1200
}

function Start-Launcher {
  if ($AppExe -and (Test-Path -LiteralPath $AppExe -PathType Leaf)) {
    Write-Log "relaunching $AppExe"
    try {
      Start-Process -FilePath $AppExe -ErrorAction Stop
    } catch {
      Write-Log "could not relaunch the launcher: $($_.Exception.Message)"
    }
  } elseif ($AppExe) {
    Write-Log "app executable not found for relaunch"
  }
}

# A failed handoff must still remove its task and reopen the old version.
function Stop-Failed([int]$code, [string]$message) {
  Write-Log $message
  Wait-ForLauncher
  Remove-UpdateTask
  Start-Launcher
  Write-Log "helper finished"
  exit $code
}

trap {
  Write-Log "helper failed: $($_.Exception.Message)"
  if ($stream) { $stream.Dispose() }
  Stop-Failed 1 "helper failed"
}

Write-Log "helper start parent=$ParentPid"

if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) {
  Stop-Failed 2 "installer is missing: $Installer"
}

$expected = $Sha256.Trim().ToUpperInvariant()
if ($expected -notmatch "^[0-9A-F]{64}$") {
  Stop-Failed 2 "invalid expected SHA-256"
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
    Stop-Failed 3 "installer hash mismatch; refusing to execute"
  }
  Write-Log "installer hash verified"

  Wait-ForLauncher
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
    Start-Launcher
  } else {
    Write-Log "silent install failed; opening the verified installer"
    try {
      Start-Process -FilePath $Installer -ErrorAction Stop
    } catch {
      Stop-Failed 1 "could not open the installer: $($_.Exception.Message)"
    }
  }
} finally {
  $stream.Dispose()
}

Remove-UpdateTask
Write-Log "helper finished"

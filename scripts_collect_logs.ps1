param(
  [string]$TvIp = "192.168.1.10",
  [int]$Port = 26101
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$LogFile = Join-Path $ScriptDir "tizen_dlog_$Timestamp.log"

Write-Host "Connecting to TV: $TvIp`:$Port"
sdb connect "$TvIp`:$Port"

Write-Host "Devices:"
sdb devices

Write-Host "Saving logs to: $LogFile"
Write-Host "Press Ctrl+C to stop."

# Tee to both console and file, and keep only app-tagged lines
sdb dlog | Select-String 'TizenYouTube' | Tee-Object -FilePath $LogFile -Append
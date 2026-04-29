# FortDefend Agent — removal (no placeholders required)
$ErrorActionPreference = 'Stop'

function Test-IsAdministrator {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = [Security.Principal.WindowsPrincipal]$id
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
  Write-Host 'FortDefend: this uninstaller must run as Administrator.' -ForegroundColor Red
  exit 1
}

$TaskName = 'FortDefend Agent'
$InstallDir = 'C:\ProgramData\FortDefend'

Write-Host 'FortDefend: stopping scheduled task…' -ForegroundColor Cyan
Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Stop-ScheduledTask -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -like '*FortDefend*' } | Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path $InstallDir) {
  Write-Host "FortDefend: removing $InstallDir …" -ForegroundColor Cyan
  Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
}

if (Test-Path 'HKLM:\SOFTWARE\FortDefend') {
  Write-Host 'FortDefend: removing registry keys…' -ForegroundColor Cyan
  Remove-Item -Path 'HKLM:\SOFTWARE\FortDefend' -Recurse -Force
}

Write-Host 'FortDefend Agent removed successfully.' -ForegroundColor Green

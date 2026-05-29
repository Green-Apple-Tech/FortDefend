#Requires -Version 5.1
<#
.SYNOPSIS
  Installs FortDefend agent folders, scheduled task, and device registration.
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$ApiUrl,
  [Parameter(Mandatory = $true)]
  [string]$OrgToken,
  [string]$DeviceName = $env:COMPUTERNAME,
  [string]$ScheduleTime = '02:00'
)

$ErrorActionPreference = 'Stop'
$BaseDir = 'C:\ProgramData\FortDefend'
$DownloadDir = Join-Path $BaseDir 'Downloads'
$LogDir = Join-Path $BaseDir 'logs'
$ConfigPath = Join-Path $BaseDir 'config.json'
$ManifestPath = Join-Path $BaseDir 'manifests.json'
$AgentScript = Join-Path $BaseDir 'FortDefendAgent.ps1'
$TaskName = 'FortDefendPatchAgent'

New-Item -ItemType Directory -Force -Path $BaseDir, $DownloadDir, $LogDir | Out-Null

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item -Path (Join-Path $scriptDir 'FortDefendAgent.ps1') -Destination $AgentScript -Force
Copy-Item -Path (Join-Path $scriptDir 'manifests.json') -Destination $ManifestPath -Force

Write-Host "Registering device with FortDefend..."
$body = @{
  name = $DeviceName
  orgToken = $OrgToken
  osVersion = [System.Environment]::OSVersion.VersionString
  ipAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress
} | ConvertTo-Json

$registration = Invoke-RestMethod -Method Post -Uri "$ApiUrl/api/patch/agent/register" -ContentType 'application/json' -Body $body

$config = @{
  apiUrl = $ApiUrl
  deviceToken = $registration.deviceToken
  deviceId = $registration.deviceId
  deviceName = $DeviceName
}
$config | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8

Write-Host "Device registered. Token saved to $ConfigPath"

$trigger = New-ScheduledTaskTrigger -Daily -At $ScheduleTime
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$AgentScript`""
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Trigger $trigger -Action $action -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "Scheduled task '$TaskName' registered for daily run at $ScheduleTime"

Write-Host "Running initial patch check..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $AgentScript
Write-Host "FortDefend agent installation complete."

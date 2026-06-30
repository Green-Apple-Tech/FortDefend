# FortDefend Agent — one-shot installer (served with __INSTALL_SCRIPT_URL__, __APP_URL__, __ORG_ID__, __GROUP_ID__, __DOWNLOAD_URL__ replaced)
$ErrorActionPreference = 'Stop'
$Script:FortDefendInstallSourceUrl = '__INSTALL_SCRIPT_URL__'

function Test-IsAdministrator {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = [Security.Principal.WindowsPrincipal]$id
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
  Write-Host 'FortDefend: elevation required. Re-launching as administrator…' -ForegroundColor Yellow
  $u = $Script:FortDefendInstallSourceUrl
  if ($u -match '__INSTALL_SCRIPT') {
    throw "This script must be run with the real install URL. Use: iex (irm 'https://<app>/api/agent/installer?org=...')"
  }
  $arg = "-NoProfile -ExecutionPolicy Bypass -Command `"& { iex (irm -UseBasicParsing '$u') }`""
  Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList $arg
  exit
}

$AppUrl = ('__APP_URL__' -replace '/$', '')
$OrgId = '__ORG_ID__'
$GroupId = '__GROUP_ID__'
$DownloadUrl = '__DOWNLOAD_URL__'

$InstallDir = 'C:\ProgramData\FortDefend'
$AgentPath = Join-Path $InstallDir 'FortDefendAgent.exe'
$LogDir = Join-Path $InstallDir 'logs'

Write-Host 'FortDefend: preparing directories…' -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $InstallDir, $LogDir | Out-Null

Write-Host "FortDefend: downloading agent from $DownloadUrl" -ForegroundColor Cyan
Invoke-WebRequest -Uri $DownloadUrl -OutFile $AgentPath -UseBasicParsing

if (-not (Test-Path $AgentPath)) { throw 'Download failed: FortDefendAgent.exe not found' }

Write-Host 'FortDefend: writing registry…' -ForegroundColor Cyan
New-Item -Path 'HKLM:\SOFTWARE\FortDefend' -Force | Out-Null
Set-ItemProperty -Path 'HKLM:\SOFTWARE\FortDefend' -Name 'OrgToken' -Value $OrgId -Type String
Set-ItemProperty -Path 'HKLM:\SOFTWARE\FortDefend' -Name 'ApiUrl' -Value $AppUrl -Type String
if ($GroupId -and $GroupId.Trim() -ne '') {
  Set-ItemProperty -Path 'HKLM:\SOFTWARE\FortDefend' -Name 'GroupId' -Value $GroupId -Type String
} else {
  Remove-ItemProperty -Path 'HKLM:\SOFTWARE\FortDefend' -Name 'GroupId' -ErrorAction SilentlyContinue
}

$TaskName = 'FortDefend Agent'
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute $AgentPath -WorkingDirectory $InstallDir
$trBoot = New-ScheduledTaskTrigger -AtStartup
$trRep = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-18' -LogonType ServiceAccount -RunLevel Highest

Write-Host 'FortDefend: registering scheduled task (at startup + every 15 min)…' -ForegroundColor Cyan
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($trBoot, $trRep) -Settings $settings -Principal $principal -Force

Write-Host 'FortDefend: starting agent…' -ForegroundColor Cyan
Start-Process -FilePath $AgentPath -WorkingDirectory $InstallDir -WindowStyle Hidden
Start-ScheduledTask -TaskName $TaskName

Write-Host 'FortDefend agent installed and running.' -ForegroundColor Green

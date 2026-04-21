$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error "Please run this script as Administrator."
  exit 1
}

$AppUrl = "__APP_URL__"
$OrgToken = "__ORG_TOKEN__"
$BaseDir = "C:\ProgramData\FortDefend"
$LogsDir = "$BaseDir\logs"
$AgentExe = "$BaseDir\agent.exe"
$NssmExe = "$BaseDir\nssm.exe"

New-Item -ItemType Directory -Path $BaseDir -Force | Out-Null
New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null

Invoke-WebRequest -Uri "$AppUrl/download/agent.exe" -OutFile $AgentExe -UseBasicParsing
Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile "$BaseDir\nssm.zip" -UseBasicParsing
Expand-Archive -Path "$BaseDir\nssm.zip" -DestinationPath "$BaseDir\nssm" -Force
Copy-Item "$BaseDir\nssm\nssm-2.24\win64\nssm.exe" $NssmExe -Force

New-Item -Path "HKLM:\SOFTWARE\FortDefend" -Force | Out-Null
Set-ItemProperty -Path "HKLM:\SOFTWARE\FortDefend" -Name "Token" -Value $OrgToken -Type String

& $NssmExe install FortDefendAgent $AgentExe
& $NssmExe set FortDefendAgent AppDirectory $BaseDir
& $NssmExe set FortDefendAgent Start SERVICE_AUTO_START
& $NssmExe set FortDefendAgent AppStdout "$LogsDir\agent-stdout.log"
& $NssmExe set FortDefendAgent AppStderr "$LogsDir\agent-stderr.log"
Start-Service FortDefendAgent

Write-Output "FortDefend agent installed and running."

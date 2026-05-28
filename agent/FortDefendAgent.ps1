#Requires -Version 5.1
<#
.SYNOPSIS
  FortDefend Windows patching agent (Installomator-style for Windows).
#>

param(
  [string[]]$Label,
  [int]$Debug = 0,
  [ValidateSet('silent_fail', 'prompt_user', 'kill', 'tell_user')]
  [string]$BlockingProcessAction = 'prompt_user',
  [ValidateSet('success', 'silent', 'all')]
  [string]$Notify = 'success',
  [ValidateSet('yes', 'no')]
  [string]$Reopen = 'no',
  [string]$ApiUrl,
  [string]$DeviceToken
)

$ErrorActionPreference = 'Stop'
$BaseDir = 'C:\ProgramData\FortDefend'
$DownloadDir = Join-Path $BaseDir 'Downloads'
$LogDir = Join-Path $BaseDir 'logs'
$ConfigPath = Join-Path $BaseDir 'config.json'
$ManifestPath = Join-Path $BaseDir 'manifests.json'
$LogPath = Join-Path $LogDir 'patch.log'

function Write-Log {
  param([string]$Message)
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -Path $LogPath -Value $line
  if ($Debug -ge 0) { Write-Host $line }
}

function Get-Config {
  if (-not (Test-Path $ConfigPath)) { throw "Missing config at $ConfigPath" }
  return Get-Content $ConfigPath -Raw | ConvertFrom-Json
}

function Get-InstalledVersion {
  param($Manifest)
  if (-not $Manifest.registryPath) { return $null }
  try {
    $path = $Manifest.registryPath -replace '^HKLM:', 'HKLM:' -replace '^HKCU:', 'HKCU:'
    if ($path -match '^HKLM:') {
      $regPath = $path -replace '^HKLM:\\', ''
      $value = Get-ItemProperty -Path "HKLM:\$regPath" -ErrorAction Stop
    } else {
      $regPath = $path -replace '^HKCU:\\', ''
      $value = Get-ItemProperty -Path "HKCU:\$regPath" -ErrorAction Stop
    }
    return $value.($Manifest.versionKey)
  } catch {
    return $null
  }
}

function Test-BlockingProcesses {
  param([string[]]$Processes)
  $running = @()
  foreach ($proc in $Processes) {
    if (Get-Process -Name $proc -ErrorAction SilentlyContinue) {
      $running += $proc
    }
  }
  return $running
}

function Invoke-BlockingProcessAction {
  param([string[]]$Running)
  switch ($BlockingProcessAction) {
    'silent_fail' { return $false }
    'prompt_user' {
      $msg = "FortDefend needs to close: $($Running -join ', '). Continue?"
      $result = [System.Windows.Forms.MessageBox]::Show($msg, 'FortDefend', 'YesNo')
      if ($result -ne 'Yes') { return $false }
      foreach ($p in $Running) { Stop-Process -Name $p -Force -ErrorAction SilentlyContinue }
      return $true
    }
    'kill' {
      foreach ($p in $Running) { Stop-Process -Name $p -Force -ErrorAction SilentlyContinue }
      return $true
    }
    'tell_user' {
      Write-Log "Blocking processes running: $($Running -join ', ')"
      return $false
    }
  }
}

function Test-PublisherSignature {
  param([string]$FilePath, [string]$ExpectedPublisher)
  if (-not $ExpectedPublisher) { return $true }
  $sig = Get-AuthenticodeSignature -FilePath $FilePath
  if ($sig.Status -ne 'Valid') { return $false }
  return ($sig.SignerSubject -match [regex]::Escape($ExpectedPublisher))
}

function Install-Package {
  param($Manifest, [string]$InstallerPath)
  switch ($Manifest.type) {
    'msi' { Start-Process msiexec.exe -ArgumentList "/i `"$InstallerPath`" $($Manifest.silentArgs)" -Wait -NoNewWindow }
    default { Start-Process -FilePath $InstallerPath -ArgumentList $Manifest.silentArgs -Wait -NoNewWindow }
  }
}

function Send-AgentReport {
  param($Payload)
  if (-not $script:ApiUrl -or -not $script:DeviceToken) { return }
  try {
    $headers = @{ 'Content-Type' = 'application/json'; 'X-Device-Token' = $script:DeviceToken }
    Invoke-RestMethod -Method Post -Uri "$($script:ApiUrl)/api/agent/report" -Headers $headers -Body ($Payload | ConvertTo-Json)
  } catch {
    Write-Log "Report failed: $($_.Exception.Message)"
  }
}

function Process-Label {
  param($Manifest)
  $installed = Get-InstalledVersion -Manifest $Manifest
  $target = $Manifest.appNewVersion

  if ($target -and $installed -and ($installed -eq $target)) {
    Write-Log "SKIP $($Manifest.label) already at $installed"
    Send-AgentReport @{
      label = $Manifest.label; name = $Manifest.name; action = 'skipped'
      fromVersion = $installed; toVersion = $target; installedVersion = $installed; latestVersion = $target
    }
    return
  }

  if ($Debug -eq 2) {
    Write-Log "CHECK $($Manifest.label) installed=$installed target=$target"
    return
  }

  $running = Test-BlockingProcesses -Processes $Manifest.blockingProcesses
  if ($running.Count -gt 0) {
    if (-not (Invoke-BlockingProcessAction -Running $running)) {
      Write-Log "FAIL $($Manifest.label) blocked by processes"
      Send-AgentReport @{
        label = $Manifest.label; name = $Manifest.name; action = 'failed'
        errorMessage = "Blocking processes: $($running -join ', ')"
      }
      return
    }
  }

  $fileName = Split-Path $Manifest.downloadURL -Leaf
  if ([string]::IsNullOrWhiteSpace($fileName) -or $fileName -match '\?') {
    $fileName = "$($Manifest.label).$($Manifest.type)"
  }
  $dest = Join-Path $DownloadDir $fileName

  try {
    Write-Log "DOWNLOAD $($Manifest.label) from $($Manifest.downloadURL)"
    Invoke-WebRequest -Uri $Manifest.downloadURL -OutFile $dest -UseBasicParsing

    if ($Debug -eq 1) {
      Write-Log "DEBUG download-only for $($Manifest.label)"
      return
    }

    if (-not (Test-PublisherSignature -FilePath $dest -ExpectedPublisher $Manifest.expectedPublisher)) {
      throw "Publisher signature mismatch for $($Manifest.expectedPublisher)"
    }

    Write-Log "INSTALL $($Manifest.label)"
    Install-Package -Manifest $Manifest -InstallerPath $dest

    $newVersion = Get-InstalledVersion -Manifest $Manifest
    $action = if ($installed) { 'updated' } else { 'installed' }
    Write-Log "SUCCESS $($Manifest.label) $action $installed -> $newVersion"

    Send-AgentReport @{
      label = $Manifest.label; name = $Manifest.name; action = $action
      fromVersion = $installed; toVersion = $newVersion
      installedVersion = $newVersion; latestVersion = $Manifest.appNewVersion
    }

    if ($Notify -in @('success', 'all')) {
      Write-Host "FortDefend: $($Manifest.name) $action successfully."
    }
  } catch {
    Write-Log "FAIL $($Manifest.label) $($_.Exception.Message)"
    Send-AgentReport @{
      label = $Manifest.label; name = $Manifest.name; action = 'failed'
      fromVersion = $installed; errorMessage = $_.Exception.Message
    }
  } finally {
    if (Test-Path $dest) { Remove-Item $dest -Force -ErrorAction SilentlyContinue }
  }
}

# Bootstrap
New-Item -ItemType Directory -Force -Path $DownloadDir, $LogDir | Out-Null
Add-Type -AssemblyName System.Windows.Forms

$config = Get-Config
$script:ApiUrl = if ($ApiUrl) { $ApiUrl } else { $config.apiUrl }
$script:DeviceToken = if ($DeviceToken) { $DeviceToken } else { $config.deviceToken }

if (-not (Test-Path $ManifestPath)) { throw "Missing manifests at $ManifestPath" }
$manifests = Get-Content $ManifestPath -Raw | ConvertFrom-Json

if ($Label) {
  $manifests = $manifests | Where-Object { $Label -contains $_.label }
}

Write-Log "FortDefend agent started. Labels: $($manifests.Count)"
foreach ($entry in $manifests) {
  Process-Label -Manifest $entry
}
Write-Log "FortDefend agent finished."

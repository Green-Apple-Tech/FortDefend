#Requires -Version 5.1
<#
.SYNOPSIS
  FortDefend Windows patching agent (Installomator-style for Windows).
#>

param(
  [string[]]$Label,
  [int]$Debug = 0,
  [ValidateSet('auto', 'update_only', 'install_only', 'force')]
  [string]$InstallMode = 'auto',
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
$Script:AgentScriptPath = $PSCommandPath
$BaseDir = 'C:\ProgramData\FortDefend'
$DownloadDir = Join-Path $BaseDir 'Downloads'
$LogDir = Join-Path $BaseDir 'logs'
$ConfigPath = Join-Path $BaseDir 'config.json'
$ManifestPath = Join-Path $BaseDir 'manifests.json'
$LogPath = Join-Path $LogDir 'patch.log'
$AGENT_VERSION = '1.0.3'
$script:VersionCheckCache = @{}

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

function Save-Config {
  param($Config)
  $Config | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8
}

function Ensure-PatchRegistration {
  if ($script:DeviceToken) { return }
  $config = Get-Config
  $orgToken = $config.orgToken
  if (-not $orgToken) { throw "Missing orgToken in $ConfigPath" }
  $body = @{
    name = $env:COMPUTERNAME
    osVersion = [System.Environment]::OSVersion.VersionString
    orgToken = $orgToken
    agentVersion = $AGENT_VERSION
  }
  Write-Log "Registering patch agent for $($body.name)..."
  $result = Invoke-RestMethod -Method Post -Uri "$($script:ApiUrl)/api/patch/agent/register" -Body ($body | ConvertTo-Json) -ContentType 'application/json'
  if (-not $result.deviceToken) { throw 'Patch agent registration did not return a device token.' }
  $script:DeviceToken = $result.deviceToken
  $config | Add-Member -NotePropertyName deviceToken -NotePropertyValue $result.deviceToken -Force
  Save-Config -Config $config
  Write-Log "Patch agent registered (device $($result.deviceId))."
}

function Get-AgentRelaunchArgumentString {
  param([hashtable]$Bound)
  if (-not $Bound -or $Bound.Count -eq 0) { return '' }
  $parts = @()
  foreach ($key in $Bound.Keys) {
    $val = $Bound[$key]
    if ($val -is [System.Management.Automation.SwitchParameter]) {
      if ($val.IsPresent) { $parts += "-$key" }
      continue
    }
    if ($val -is [array]) {
      foreach ($item in $val) { $parts += "-$key `"$item`"" }
    } else {
      $parts += "-$key `"$val`""
    }
  }
  if ($parts.Count -eq 0) { return '' }
  return ' ' + ($parts -join ' ')
}

function Invoke-AgentSelfUpdate {
  param([string]$RelaunchArgs = '')
  if (-not $script:ApiUrl) { return }
  $scriptPath = $Script:AgentScriptPath
  if (-not $scriptPath -or -not (Test-Path -LiteralPath $scriptPath)) { return }

  try {
    $base = $script:ApiUrl.TrimEnd('/')
    $remote = Invoke-RestMethod -Uri "$base/api/agent/version" -UseBasicParsing -TimeoutSec 15
    $remoteVersion = [string]$remote.version
    if (-not $remoteVersion) { return }
    if ([version]$remoteVersion -le [version]$AGENT_VERSION) { return }

    Write-Log "Agent updated from $AGENT_VERSION to $remoteVersion, restarting"
    $tempScript = Join-Path $env:TEMP "FortDefendAgent-$remoteVersion.ps1"
    Invoke-WebRequest -Uri "$base/api/agent/download/agent.ps1" -OutFile $tempScript -UseBasicParsing -TimeoutSec 120

    $targetPath = Join-Path $BaseDir 'FortDefendAgent.ps1'
    if ($scriptPath -ne $targetPath) { $targetPath = $scriptPath }

    $updaterPath = Join-Path $env:TEMP 'FortDefendAgent-updater.ps1'
    $escapedTarget = $targetPath.Replace("'", "''")
    $escapedTemp = $tempScript.Replace("'", "''")
    @"
`$ErrorActionPreference = 'Stop'
Start-Sleep -Seconds 2
Copy-Item -LiteralPath '$escapedTemp' -Destination '$escapedTarget' -Force
Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$escapedTarget`"$RelaunchArgs" -WindowStyle Hidden
"@ | Set-Content -Path $updaterPath -Encoding UTF8

    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$updaterPath`"" -WindowStyle Hidden
    exit 0
  } catch {
    Write-Log "Self-update check failed: $($_.Exception.Message)"
  }
}

function Normalize-VersionString {
  param([string]$Value)
  if (-not $Value) { return $null }
  $clean = ($Value -replace '[^\d\.]', '.').Trim('.')
  if (-not $clean) { return $Value }
  return $clean
}

function Compare-AppVersion {
  param([string]$Installed, [string]$Target)
  if (-not $Target) { return 'unknown' }
  if (-not $Installed) { return 'not_installed' }
  try {
    $i = [version](Normalize-VersionString $Installed)
    $t = [version](Normalize-VersionString $Target)
    if ($i -eq $t) { return 'equal' }
    if ($i -lt $t) { return 'older' }
    return 'newer'
  } catch {
    if ($Installed -eq $Target) { return 'equal' }
    return 'unknown'
  }
}

function Resolve-VersionFromCheckUrl {
  param($Manifest)
  $url = [string]$Manifest.versionCheckURL
  if (-not $url) { return $Manifest.appNewVersion }

  switch -Regex ($Manifest.label) {
    '^(googlechrome|googlechromeenterprise)$' {
      $r = Invoke-RestMethod -Uri $url -UseBasicParsing -TimeoutSec 20
      return ($r.versions | Select-Object -First 1).version
    }
    '^firefox$' {
      $r = Invoke-RestMethod -Uri $url -UseBasicParsing -TimeoutSec 20
      return $r.LATEST_FIREFOX_VERSION
    }
    '^vscode$' {
      return (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20).Content.Trim()
    }
    '^nodejs$' {
      $r = Invoke-RestMethod -Uri $url -UseBasicParsing -TimeoutSec 20
      $lts = $r | Where-Object { $_.lts } | Select-Object -First 1
      return ($lts.version -replace '^v', '')
    }
    '^(python|python3)$' {
      $r = Invoke-RestMethod -Uri 'https://www.python.org/api/v2/downloads/release/' -UseBasicParsing -TimeoutSec 20
      $stable = $r | Where-Object { $_.is_latest -and $_.name -match 'Python 3' } | Select-Object -First 1
      if ($stable?.name -match 'Python (\d+\.\d+\.\d+)') { return $Matches[1] }
      return $Manifest.appNewVersion
    }
    '^spotify$' {
      $r = Invoke-RestMethod -Uri $url -UseBasicParsing -TimeoutSec 20
      return $r.version
    }
    '^discord$' {
      $r = Invoke-RestMethod -Uri $url -UseBasicParsing -TimeoutSec 20
      return $r.version
    }
    '^githubdesktop$' {
      $r = Invoke-RestMethod -Uri $url -UseBasicParsing -TimeoutSec 20
      return ($r.tag_name -replace '^v', '')
    }
    '^(brave|microsoftedge)$' {
      return $Manifest.appNewVersion
    }
    default {
      try {
        $r = Invoke-RestMethod -Uri $url -UseBasicParsing -TimeoutSec 20
        if ($r.version) { return $r.version }
        if ($r.tag_name) { return ($r.tag_name -replace '^v', '') }
      } catch { }
      return $Manifest.appNewVersion
    }
  }
}

function Get-CatalogLatestVersion {
  param($Manifest)
  $label = [string]$Manifest.label
  if ($script:VersionCheckCache.ContainsKey($label)) {
    return $script:VersionCheckCache[$label]
  }
  $latest = $Manifest.appNewVersion
  if ($Manifest.versionCheckURL) {
    try {
      $fetched = Resolve-VersionFromCheckUrl -Manifest $Manifest
      if ($fetched) { $latest = $fetched }
    } catch {
      Write-Log "Version API failed for ${label}: $($_.Exception.Message)"
    }
  }
  if ($latest) { $script:VersionCheckCache[$label] = $latest }
  return $latest
}

function Get-InstalledVersion {
  param($Manifest)
  if (-not $Manifest.registryPath) { return $null }
  try {
    $path = $Manifest.registryPath
    if ($path -match '^HKLM:') {
      $regPath = $path -replace '^HKLM:\\', ''
      $value = Get-ItemProperty -Path "HKLM:\$regPath" -ErrorAction Stop
    } else {
      $regPath = $path -replace '^HKCU:\\', ''
      $value = Get-ItemProperty -Path "HKCU:\$regPath" -ErrorAction Stop
    }
    $key = if ($Manifest.versionKey) { $Manifest.versionKey } else { 'DisplayVersion' }
    return $value.$key
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
  param([hashtable]$Payload)
  if (-not $script:ApiUrl -or -not $script:DeviceToken) { return }
  try {
    if (-not $Payload.timestamp) { $Payload.timestamp = (Get-Date).ToUniversalTime().ToString('o') }
    if (-not $Payload.agentVersion) { $Payload.agentVersion = $AGENT_VERSION }
    $headers = @{ 'Content-Type' = 'application/json'; 'X-Device-Token' = $script:DeviceToken }
    Invoke-RestMethod -Method Post -Uri "$($script:ApiUrl)/api/patch/agent/report" -Headers $headers -Body ($Payload | ConvertTo-Json)
  } catch {
    Write-Log "Report failed: $($_.Exception.Message)"
  }
}

function Invoke-InstallOrUpdate {
  param($Manifest, [string]$Installed, [string]$Target, [string]$ReportAction)

  $running = Test-BlockingProcesses -Processes $Manifest.blockingProcesses
  if ($running.Count -gt 0) {
    if (-not (Invoke-BlockingProcessAction -Running $running)) {
      Write-Log "FAIL $($Manifest.label) blocked by processes"
      Send-AgentReport @{
        label = $Manifest.label; name = $Manifest.name; action = 'failed'
        fromVersion = $Installed; errorMessage = "Blocking processes: $($running -join ', ')"
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
    if (-not $newVersion) { $newVersion = $Target }
    Write-Log "SUCCESS $($Manifest.label) $ReportAction $(if ($Installed) { "$Installed -> $newVersion" } else { $newVersion })"

    Send-AgentReport @{
      label = $Manifest.label
      name = $Manifest.name
      action = $ReportAction
      fromVersion = $Installed
      toVersion = $newVersion
      installedVersion = $newVersion
      latestVersion = $Target
    }

    if ($Notify -in @('success', 'all')) {
      Write-Host "FortDefend: $($Manifest.name) $ReportAction successfully."
    }
  } catch {
    Write-Log "FAIL $($Manifest.label) $($_.Exception.Message)"
    Send-AgentReport @{
      label = $Manifest.label; name = $Manifest.name; action = 'failed'
      fromVersion = $Installed; errorMessage = $_.Exception.Message
    }
  } finally {
    if (Test-Path $dest) { Remove-Item $dest -Force -ErrorAction SilentlyContinue }
  }
}

function Process-Label {
  param($Manifest)
  $installed = Get-InstalledVersion -Manifest $Manifest
  $target = Get-CatalogLatestVersion -Manifest $Manifest
  $cmp = Compare-AppVersion -Installed $installed -Target $target

  if ($Debug -eq 2) {
    Write-Log "CHECK $($Manifest.label) installed=$installed target=$target cmp=$cmp mode=$InstallMode"
    return
  }

  if ($cmp -eq 'equal' -and $InstallMode -ne 'force') {
    Write-Log "Already current: $installed ($($Manifest.label))"
    Send-AgentReport @{
      label = $Manifest.label; name = $Manifest.name; action = 'skipped_current'
      fromVersion = $installed; toVersion = $installed; installedVersion = $installed; latestVersion = $target
    }
    return
  }

  if ($cmp -eq 'newer' -and $InstallMode -ne 'force') {
    Write-Log "Skipping: device has newer version $installed > $target ($($Manifest.label))"
    Send-AgentReport @{
      label = $Manifest.label; name = $Manifest.name; action = 'skipped_newer'
      fromVersion = $installed; toVersion = $installed; installedVersion = $installed; latestVersion = $target
    }
    return
  }

  if ($cmp -eq 'not_installed') {
    if ($InstallMode -eq 'update_only') {
      Write-Log "SKIP $($Manifest.label) not installed (update_only mode)"
      return
    }
    Write-Log "Fresh install: $($Manifest.name)"
    Invoke-InstallOrUpdate -Manifest $Manifest -Installed $null -Target $target -ReportAction 'fresh_install'
    return
  }

  if ($InstallMode -eq 'install_only' -and $cmp -ne 'force') {
    Write-Log "SKIP $($Manifest.label) already installed (install_only mode)"
    return
  }

  if ($cmp -eq 'older' -or $InstallMode -eq 'force') {
    Write-Log "Updating $($Manifest.name): $installed -> $target"
    Invoke-InstallOrUpdate -Manifest $Manifest -Installed $installed -Target $target -ReportAction 'updated'
    return
  }

  Write-Log "SKIP $($Manifest.label) unhandled state cmp=$cmp"
}

# Bootstrap
New-Item -ItemType Directory -Force -Path $DownloadDir, $LogDir | Out-Null
Add-Type -AssemblyName System.Windows.Forms

$config = Get-Config
$script:ApiUrl = if ($ApiUrl) { $ApiUrl } elseif ($config.apiUrl) { $config.apiUrl } else { $config.serverUrl }
$script:DeviceToken = if ($DeviceToken) { $DeviceToken } else { $config.deviceToken }

Ensure-PatchRegistration

Invoke-AgentSelfUpdate -RelaunchArgs (Get-AgentRelaunchArgumentString -Bound $PSBoundParameters)

if (-not (Test-Path $ManifestPath)) { throw "Missing manifests at $ManifestPath" }
$manifests = Get-Content $ManifestPath -Raw | ConvertFrom-Json

if ($Label) {
  $manifests = $manifests | Where-Object { $Label -contains $_.label }
}

Write-Log "FortDefend agent v$AGENT_VERSION started. Labels: $($manifests.Count) mode=$InstallMode"
foreach ($entry in $manifests) {
  Process-Label -Manifest $entry
}
Write-Log "FortDefend agent finished."

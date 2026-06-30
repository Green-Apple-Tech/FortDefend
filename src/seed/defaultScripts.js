const db = require('../database');

const ps = String.raw;

const BUILTIN_SCRIPTS = [
  {
    id: 'builtin:update-agent',
    name: 'Update FortDefend Agent',
    description: 'Downloads and installs the latest FortDefend Windows agent using a detached self-updater.',
    platforms: ['windows'],
    script_type: 'powershell',
    content: ps`$ErrorActionPreference = 'Stop'
$InstallDir = 'C:\ProgramData\FortDefend'
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$Updater = Join-Path $InstallDir 'self-update.ps1'
$u = @'
$ErrorActionPreference = "SilentlyContinue"
Start-Sleep -Seconds 10
$InstallDir = "C:\ProgramData\FortDefend"
$AgentPath  = Join-Path $InstallDir "FortDefendAgent.exe"
$TempExe    = Join-Path $InstallDir "FortDefendAgent.new.exe"
$TaskName   = "FortDefend Agent"
$Base       = "https://app.fortdefend.com"
try { Invoke-WebRequest -Uri "$Base/api/agent/download" -OutFile $TempExe -UseBasicParsing } catch { exit 1 }
if (-not (Test-Path $TempExe) -or (Get-Item $TempExe).Length -lt 1000000) { Remove-Item $TempExe -Force -ErrorAction SilentlyContinue; exit 1 }
try { Invoke-WebRequest -Uri "$Base/api/agent/download/agent.ps1" -OutFile (Join-Path $InstallDir "FortDefendAgent.ps1") -UseBasicParsing } catch {}
try { Invoke-WebRequest -Uri "$Base/api/agent/download/manifests.json" -OutFile (Join-Path $InstallDir "manifests.json") -UseBasicParsing } catch {}
Stop-ScheduledTask -TaskName $TaskName
Get-Process FortDefendAgent -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
Move-Item -Path $TempExe -Destination $AgentPath -Force
Start-ScheduledTask -TaskName $TaskName
Start-Process -FilePath $AgentPath -WorkingDirectory $InstallDir -WindowStyle Hidden
'@
Set-Content -Path $Updater -Value $u -Encoding UTF8
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$Updater -WindowStyle Hidden
Write-Output 'FortDefend self-update started. The agent will update to the latest version within ~30 seconds.'`,
  },
  { id: 'builtin:system-inventory', name: 'Collect System Inventory', description: 'Shows OS, BIOS, CPU, RAM, disk, IP, uptime, and signed-in user details.', platforms: ['windows'], script_type: 'powershell', content: ps`$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,@{n='SizeGB';e={[math]::Round($_.Size/1GB,2)}},@{n='FreeGB';e={[math]::Round($_.FreeSpace/1GB,2)}}
[pscustomobject]@{ ComputerName = $env:COMPUTERNAME; User = $cs.UserName; OS = $os.Caption; Version = $os.Version; Build = $os.BuildNumber; Serial = $bios.SerialNumber; CPU = $cpu.Name; RAMGB = [math]::Round($cs.TotalPhysicalMemory/1GB,2); UptimeHours = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours,1); IP = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {$_.IPAddress -notlike '169.254*' -and $_.IPAddress -ne '127.0.0.1'} | Select-Object -ExpandProperty IPAddress) -join ', '; Disks = $disks } | ConvertTo-Json -Depth 4` },
  { id: 'builtin:pending-reboot', name: 'Check Pending Reboot', description: 'Checks common Windows pending reboot registry locations.', platforms: ['windows'], script_type: 'powershell', content: ps`$checks = [ordered]@{ ComponentBasedServicing = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending'; WindowsUpdate = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'; PendingFileRename = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue) -ne $null }
[pscustomobject]@{ RebootPending = ($checks.Values -contains $true); Checks = $checks } | ConvertTo-Json -Depth 4` },
  { id: 'builtin:disk-cleanup', name: 'Disk Cleanup - Temp Files', description: 'Removes common Windows and user temp files older than one day.', platforms: ['windows'], script_type: 'powershell', content: ps`$paths = @($env:TEMP, 'C:\Windows\Temp')
$cutoff = (Get-Date).AddDays(-1)
$removed = 0
foreach ($p in $paths) { if (Test-Path $p) { Get-ChildItem -Path $p -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer -and $_.LastWriteTime -lt $cutoff } | ForEach-Object { try { Remove-Item $_.FullName -Force -ErrorAction Stop; $removed++ } catch {} } } }
Write-Output "Removed $removed temp file(s)."` },
  { id: 'builtin:restart-spooler', name: 'Restart Print Spooler', description: 'Restarts the Windows Print Spooler service.', platforms: ['windows'], script_type: 'powershell', content: ps`Restart-Service -Name Spooler -Force
Get-Service -Name Spooler | Select-Object Name,Status,StartType | ConvertTo-Json` },
  { id: 'builtin:flush-dns', name: 'Flush DNS Cache', description: 'Flushes the local DNS resolver cache.', platforms: ['windows'], script_type: 'powershell', content: ps`ipconfig /flushdns` },
  { id: 'builtin:gpupdate', name: 'Run Group Policy Update', description: 'Runs gpupdate /force and returns the result.', platforms: ['windows'], script_type: 'powershell', content: ps`gpupdate /force` },
  { id: 'builtin:windows-update-scan', name: 'Scan Windows Updates', description: 'Uses the Windows Update COM API to list available software updates.', platforms: ['windows'], script_type: 'powershell', content: ps`$session = New-Object -ComObject Microsoft.Update.Session
$searcher = $session.CreateUpdateSearcher()
$result = $searcher.Search("IsInstalled=0 and Type='Software'")
$updates = @()
foreach ($u in $result.Updates) { $updates += [pscustomobject]@{ Title = $u.Title; KB = (@($u.KBArticleIDs) -join ','); Severity = $u.MsrcSeverity; RebootRequired = [bool]$u.RebootRequired } }
[pscustomobject]@{ Count = $updates.Count; Updates = $updates } | ConvertTo-Json -Depth 4` },
  { id: 'builtin:defender-status', name: 'Microsoft Defender Status', description: 'Reports Defender status, signature age, and real-time protection state.', platforms: ['windows'], script_type: 'powershell', content: ps`if (Get-Command Get-MpComputerStatus -ErrorAction SilentlyContinue) { Get-MpComputerStatus | Select-Object AMServiceEnabled,AntivirusEnabled,RealTimeProtectionEnabled,AntispywareSignatureLastUpdated,AntivirusSignatureLastUpdated,NISEnabled | ConvertTo-Json } else { Write-Output 'Microsoft Defender cmdlets are not available on this device.' }` },
  { id: 'builtin:top-processes', name: 'Top CPU and Memory Processes', description: 'Shows the top running processes by CPU and working set memory.', platforms: ['windows'], script_type: 'powershell', content: ps`Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 ProcessName,Id,CPU,@{n='MemoryMB';e={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json -Depth 3` },
  { id: 'builtin:network-summary', name: 'Network Summary', description: 'Shows adapters, IP addresses, DNS servers, and default routes.', platforms: ['windows'], script_type: 'powershell', content: ps`[pscustomobject]@{ Adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Select-Object Name,Status,LinkSpeed,MacAddress; IPs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object InterfaceAlias,IPAddress,PrefixLength; DnsServers = Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object InterfaceAlias,ServerAddresses; DefaultRoutes = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object InterfaceAlias,NextHop,RouteMetric } | ConvertTo-Json -Depth 5` },
  { id: 'builtin:winget-upgrades', name: 'List Winget Upgrades', description: 'Lists available third-party app updates from winget.', platforms: ['windows'], script_type: 'powershell', content: ps`if (Get-Command winget -ErrorAction SilentlyContinue) { winget upgrade --accept-source-agreements } else { Write-Output 'winget is not available on this device.' }` },
];

function asRuntimeScript(script) {
  return { ...script, built_in: true, created_by: null, last_run_at: null, created_at: null, updated_at: null };
}

function getBuiltinScripts() {
  return BUILTIN_SCRIPTS.map(asRuntimeScript);
}

function findBuiltinScript(id) {
  const script = BUILTIN_SCRIPTS.find((s) => s.id === id);
  return script ? asRuntimeScript(script) : null;
}

async function seedDefaultScripts() {
  const hasScripts = await db.schema.hasTable('scripts');
  const hasOrgs = await db.schema.hasTable('orgs');
  if (!hasScripts || !hasOrgs) return { seeded: 0, updated: 0 };

  const orgs = await db('orgs').select('id');
  const now = new Date();
  let seeded = 0;
  let updated = 0;

  for (const org of orgs) {
    for (const script of BUILTIN_SCRIPTS) {
      try {
        const existing = await db('scripts').where({ org_id: org.id, name: script.name }).first();
        if (existing) {
          await db('scripts').where({ id: existing.id }).update({ description: script.description, platforms: script.platforms, script_type: script.script_type, content: script.content, updated_at: now });
          updated += 1;
        } else {
          await db('scripts').insert({ org_id: org.id, name: script.name, description: script.description, platforms: script.platforms, script_type: script.script_type, content: script.content, created_by: null, created_at: now, updated_at: now });
          seeded += 1;
        }
      } catch (err) {
        console.error(`[seed] Failed default script "${script.name}" for org ${org.id}:`, err?.message);
      }
    }
  }

  if (seeded || updated) console.log(`[seed] Default scripts: ${seeded} created, ${updated} updated`);
  return { seeded, updated };
}

module.exports = { BUILTIN_SCRIPTS, getBuiltinScripts, findBuiltinScript, seedDefaultScripts };

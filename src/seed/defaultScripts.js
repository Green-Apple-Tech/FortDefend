const db = require('../database');

const SCRIPT_NAME = 'Update FortDefend Agent';
const SCRIPT_DESCRIPTION =
  'Downloads and installs the latest FortDefend Windows agent (detached self-update). Safe to run on online PCs.';

const SCRIPT_CONTENT = `$ErrorActionPreference = 'Stop'
$InstallDir = 'C:\\ProgramData\\FortDefend'
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$Updater = Join-Path $InstallDir 'self-update.ps1'
$u = @'
$ErrorActionPreference = "SilentlyContinue"
Start-Sleep -Seconds 10
$InstallDir = "C:\\ProgramData\\FortDefend"
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
Write-Output 'FortDefend self-update started. The agent will update to the latest version within ~30 seconds.'`;

async function seedDefaultScripts() {
  const hasScripts = await db.schema.hasTable('scripts');
  const hasOrgs = await db.schema.hasTable('orgs');
  if (!hasScripts || !hasOrgs) return { seeded: 0, updated: 0 };

  const orgs = await db('orgs').select('id');
  const now = new Date();
  const platforms = ['windows'];
  let seeded = 0;
  let updated = 0;

  for (const org of orgs) {
    try {
      const existing = await db('scripts')
        .where({ org_id: org.id, name: SCRIPT_NAME })
        .first();

      if (existing) {
        await db('scripts')
          .where({ id: existing.id })
          .update({
            description: SCRIPT_DESCRIPTION,
            platforms,
            script_type: 'powershell',
            content: SCRIPT_CONTENT,
            updated_at: now,
          });
        updated += 1;
      } else {
        await db('scripts').insert({
          org_id: org.id,
          name: SCRIPT_NAME,
          description: SCRIPT_DESCRIPTION,
          platforms,
          script_type: 'powershell',
          content: SCRIPT_CONTENT,
          created_by: null,
          created_at: now,
          updated_at: now,
        });
        seeded += 1;
      }
    } catch (err) {
      console.error(`[seed] Failed default script for org ${org.id}:`, err?.message);
    }
  }

  if (seeded || updated) {
    console.log(`[seed] Agent update script: ${seeded} created, ${updated} updated`);
  }
  return { seeded, updated };
}

module.exports = {
  SCRIPT_NAME,
  SCRIPT_CONTENT,
  seedDefaultScripts,
};

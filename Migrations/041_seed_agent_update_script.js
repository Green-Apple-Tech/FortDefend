/**
 * Seeds a reusable "Update FortDefend Agent" PowerShell script into every org's
 * script library. The script launches a detached self-updater so the agent can
 * report the command as successful before it stops itself to swap the EXE.
 * It always downloads the latest server build, so it stays valid across versions.
 */
// Run outside a transaction so a single failed per-org seed can't abort the batch.
exports.config = { transaction: false };

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

exports.up = async function up(knex) {
  const hasScripts = await knex.schema.hasTable('scripts');
  const hasOrgs = await knex.schema.hasTable('orgs');
  if (!hasScripts || !hasOrgs) return;

  const orgs = await knex('orgs').select('id');
  const now = new Date();
  // Explicit jsonb cast avoids driver ambiguity when binding a JS array vs JSON text.
  const platforms = knex.raw('?::jsonb', [JSON.stringify(['windows'])]);

  for (const org of orgs) {
    try {
      const existing = await knex('scripts')
        .where({ org_id: org.id, name: SCRIPT_NAME })
        .first();

      if (existing) {
        await knex('scripts')
          .where({ id: existing.id })
          .update({
            description: SCRIPT_DESCRIPTION,
            platforms,
            script_type: 'powershell',
            content: SCRIPT_CONTENT,
            updated_at: now,
          });
      } else {
        await knex('scripts').insert({
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
      }
    } catch (err) {
      // Seeding is best-effort per org; never abort the migration batch.
      console.error(`[041] Failed seeding agent update script for org ${org.id}:`, err?.message);
    }
  }
};

exports.down = async function down(knex) {
  const hasScripts = await knex.schema.hasTable('scripts');
  if (!hasScripts) return;
  await knex('scripts').where({ name: SCRIPT_NAME }).delete();
};

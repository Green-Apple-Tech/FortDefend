#!/usr/bin/env node
/**
 * Builds dist/FortDefendAgent.exe with pkg, then optionally FortDefendSetup.msi with WiX Toolset (Windows).
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const dist = path.join(root, 'dist');
const wixDir = path.join(root, 'wix');
const agentExe = path.join(dist, 'FortDefendAgent.exe');
const msiOut = path.join(dist, 'FortDefendSetup.msi');

function which(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout.trim().split(/\r?\n/)[0];
}

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
}

fs.mkdirSync(dist, { recursive: true });

console.log('Building FortDefendAgent.exe with pkg…');
run('npx pkg agent.js --target node18-win-x64 --output dist/FortDefendAgent.exe --compress GZip');

if (!fs.existsSync(agentExe)) {
  console.error('pkg did not produce dist/FortDefendAgent.exe');
  process.exit(1);
}

let msiBuilt = false;
if (process.platform === 'win32') {
  const candle = which('candle.exe') || which('candle');
  const light = which('light.exe') || which('light');
  const wxs = path.join(wixDir, 'Agent.wxs');
  if (candle && light && fs.existsSync(wxs)) {
    try {
      const buildDir = path.join(wixDir, 'build');
      fs.mkdirSync(buildDir, { recursive: true });
      const agentPathArg = agentExe;
      const objPath = path.join(buildDir, 'Agent.wixobj');
      execSync(
        `"${candle}" -nologo -dAgentPath="${agentPathArg}" -o "${buildDir}\\" "${wxs}"`,
        { stdio: 'inherit', windowsHide: true, cwd: wixDir, shell: true }
      );
      execSync(
        `"${light}" -nologo -o "${msiOut}" "${objPath}"`,
        { stdio: 'inherit', windowsHide: true, cwd: wixDir, shell: true }
      );
      msiBuilt = true;
      console.log('FortDefendSetup.msi written to dist/');
    } catch (e) {
      console.warn('WiX build failed (install WiX Toolset v3.11+ to produce MSI):', e.message);
    }
  } else {
    console.warn(
      'WiX (candle/light) not found in PATH — skipped FortDefendSetup.msi. Install https://wixtoolset.org/ and re-run npm run build:installer on Windows.'
    );
  }
} else {
  console.warn('MSI packaging is only run on Windows with WiX Toolset; EXE only was built.');
}

if (!msiBuilt && !fs.existsSync(msiOut)) {
  const note = path.join(dist, 'README-MSI.txt');
  fs.writeFileSync(
    note,
    'FortDefendSetup.msi is built on Windows when WiX Toolset v3 (candle.exe, light.exe) is on PATH.\n' +
      'Run: npm run build:installer\n' +
      'Install WiX: https://wixtoolset.org/docs/wix3/\n',
    'utf8'
  );
  console.log('Wrote dist/README-MSI.txt (MSI not generated on this platform or WiX missing).');
}

console.log('Done. Outputs under agent/dist/');

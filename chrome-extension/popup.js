/* global chrome */

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '—';
  }
}

function renderCommands(commands) {
  if (!Array.isArray(commands) || commands.length === 0) {
    return '<p class="meta" style="text-align:left;margin:0">No commands in queue</p>';
  }
  return commands
    .map((c) => {
      const t = c.type || c.action || c.name || 'command';
      const id = c.id != null ? ` · ${c.id}` : '';
      return `<div class="cmd">${escapeHtml(String(t))}${escapeHtml(String(id))}</div>`;
    })
    .join('');
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  const content = document.getElementById('content');
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (data) => {
    if (chrome.runtime.lastError) {
      content.innerHTML = `<div class="not-enrolled"><p>Could not load status.</p></div>`;
      return;
    }
    if (!data.connected) {
      content.innerHTML = `
        <div class="not-enrolled">
          <p>Not enrolled — enter your organisation token to connect, or use the enrollment page.</p>
          <input type="text" id="token-input" placeholder="Organisation token" />
          <button class="primary" id="enroll-btn" style="margin-bottom:8px">Connect</button>
          <button type="button" id="open-enroll">Open enrollment page</button>
        </div>
      `;
      document.getElementById('enroll-btn').addEventListener('click', () => {
        const token = document.getElementById('token-input').value.trim();
        if (!token) return;
        chrome.runtime.sendMessage({ type: 'ENROLL', token }, (r) => {
          if (r && r.error) {
            document.getElementById('open-enroll').textContent = r.error;
            return;
          }
          window.close();
        });
      });
      document.getElementById('open-enroll').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_ENROLLMENT' });
        window.close();
      });
      return;
    }

    const score = typeof data.lastScore === 'number' ? data.lastScore : 100;
    const scoreClass = score >= 80 ? 'green' : score >= 60 ? 'amber' : 'red';
    const scoreLabel = score >= 80 ? 'Secure' : score >= 60 ? 'Review needed' : 'Action required';
    const lastBeat = data.lastHeartbeatAt || data.lastCheck;
    const connLabel = 'Connected to FortDefend';
    const org = data.orgName || '';

    content.innerHTML = `
      <div class="connection ok">✓ ${connLabel}</div>
      <div class="score-section">
        <div class="score ${scoreClass}">${Math.round(score)}</div>
        <div class="meta">${escapeHtml(scoreLabel)}${org ? ` · ${escapeHtml(org)}` : ''}</div>
        <div class="meta" style="margin-top:4px">Last heartbeat: ${escapeHtml(fmtTime(lastBeat))}</div>
      </div>
      <div class="commands" id="cmd-box">
        <h2>Commands / queue</h2>
        ${renderCommands(data.pendingCommands)}
      </div>
      <div class="footer">
        <button id="run-check">Run full check now</button>
        <button class="primary" id="open-dashboard">Open dashboard</button>
      </div>
    `;

    document.getElementById('run-check').addEventListener('click', () => {
      document.getElementById('run-check').textContent = 'Checking...';
      chrome.runtime.sendMessage({ type: 'RUN_CHECK' }, () => {
        window.close();
      });
    });

    document.getElementById('open-dashboard').addEventListener('click', () => {
      chrome.storage.local.get(['apiUrl'], (r) => {
        const base = (r && r.apiUrl) || 'https://app.fortdefend.com';
        chrome.tabs.create({ url: `${String(base).replace(/\/$/, '')}/dashboard` });
      });
    });
  });
});

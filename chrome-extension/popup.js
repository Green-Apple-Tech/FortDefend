document.addEventListener('DOMContentLoaded', () => {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (data) => {
    const content = document.getElementById('content');

    if (!data.enrolled) {
      content.innerHTML = `
        <div class="not-enrolled">
          <p>Enter your enrollment token to connect this Chromebook to FortDefend.</p>
          <input type="text" id="token-input" placeholder="Paste enrollment token here" />
          <button class="primary" id="enroll-btn">Connect device</button>
        </div>
      `;
      document.getElementById('enroll-btn').addEventListener('click', () => {
        const token = document.getElementById('token-input').value.trim();
        if (!token) return;
        chrome.runtime.sendMessage({ type: 'ENROLL', token }, () => {
          window.close();
        });
      });
      return;
    }

    const score = data.lastScore || 100;
    const scoreClass = score >= 80 ? 'green' : score >= 60 ? 'amber' : 'red';
    const scoreLabel = score >= 80 ? 'Secure' : score >= 60 ? 'Review needed' : 'Action required';
    const lastCheck = data.lastCheck
      ? `Last checked ${new Date(data.lastCheck).toLocaleTimeString()}`
      : 'Not yet checked';

    content.innerHTML = `
      <div class="score-section">
        <div class="score ${scoreClass}">${score}</div>
        <div class="score-label">${scoreLabel} · ${data.orgName || 'FortDefend'}</div>
      </div>
      <div class="checks" id="checks-list">
        <div style="font-size:13px;color:#6e6e73;text-align:center;padding:8px">Loading checks...</div>
      </div>
      <div class="last-check">${lastCheck}</div>
      <div class="footer">
        <button id="run-check">Run check now</button>
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
      chrome.tabs.create({ url: 'https://app.fortdefend.com/dashboard' });
    });
  });
});

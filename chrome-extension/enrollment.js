/* global chrome */
const DEFAULT_API = 'https://app.fortdefend.com';

function showErr(text) {
  const el = document.getElementById('msg');
  const ok = document.getElementById('ok');
  if (text) {
    el.textContent = text;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
  if (ok) ok.style.display = 'none';
}

function showOk() {
  const el = document.getElementById('msg');
  const ok = document.getElementById('ok');
  if (el) el.style.display = 'none';
  if (ok) ok.style.display = 'block';
}

async function getApiBase() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiUrl'], (r) => {
      resolve((r && r.apiUrl) || DEFAULT_API);
    });
  });
}

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = document.getElementById('token').value.trim();
  if (!token) return;
  const submit = document.getElementById('submit');
  submit.disabled = true;
  showErr('');

  const api = await getApiBase();
  const verifyUrl = `${api.replace(/\/$/, '')}/api/enrollment/verify-token?token=${encodeURIComponent(token)}`;

  let verifyRes;
  try {
    verifyRes = await fetch(verifyUrl);
  } catch (err) {
    showErr('Could not reach FortDefend. Check your network and try again.');
    submit.disabled = false;
    return;
  }

  const vjson = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok || !vjson.valid) {
    showErr(vjson.error || 'Invalid or unknown organisation token.');
    submit.disabled = false;
    return;
  }

  try {
    const done = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'ENROLL', token }, (r) => {
        resolve(r || {});
      });
    });
    if (!done.done || done.error) {
      showErr(done.error || 'Enrollment failed. Try again or contact your admin.');
      submit.disabled = false;
      return;
    }
    showOk();
  } catch (err) {
    showErr(err.message || 'Enrollment failed.');
    submit.disabled = false;
    return;
  }
  submit.textContent = 'Done';
  submit.disabled = true;
});

document.getElementById('cancel').addEventListener('click', () => {
  if (self.window.close) {
    self.window.close();
  }
});

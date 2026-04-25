const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
    console.log('[Firebase] initialized successfully for project:', process.env.FIREBASE_PROJECT_ID);
  } catch (err) {
    console.error('[Firebase] initialization failed:', err.message);
  }
}

function getMessaging() {
  if (!admin.apps.length) {
    return null;
  }
  return admin.messaging();
}

function isReady() {
  return admin.apps.length > 0;
}

/**
 * FCM data message — all `data` values must be strings.
 * @param {string} fcmToken
 * @param {object} command — { type, payload, commandId, issuedAt, expiresAt }
 */
async function sendCommand(fcmToken, command) {
  if (!fcmToken) {
    return { success: false, error: 'Missing FCM token.' };
  }
  const msg = getMessaging();
  if (!msg) {
    return { success: false, error: 'FCM is not configured (FIREBASE_SERVICE_ACCOUNT).' };
  }
  const type = String(command?.type || 'command');
  const commandId = String(command?.commandId || '');
  const issuedAt = command?.issuedAt
    ? String(command.issuedAt)
    : new Date().toISOString();
  const expiresAt = command?.expiresAt
    ? String(command.expiresAt)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const p = command?.payload;
  const payload = typeof p === 'string' ? p : JSON.stringify(p != null ? p : {});

  const data = { type, commandId, issuedAt, expiresAt, payload };

  try {
    await msg.send({
      token: fcmToken,
      data,
      android: { priority: 'high' },
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * @param {string} fcmToken
 * @param {string} title
 * @param {string} message
 */
async function sendAlert(fcmToken, title, message) {
  if (!fcmToken) {
    return { success: false, error: 'Missing FCM token.' };
  }
  const msg = getMessaging();
  if (!msg) {
    return { success: false, error: 'FCM is not configured (FIREBASE_SERVICE_ACCOUNT).' };
  }
  try {
    await msg.send({
      token: fcmToken,
      notification: { title: String(title), body: String(message) },
      android: { priority: 'high' },
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

module.exports = { admin, sendCommand, sendAlert, isReady };

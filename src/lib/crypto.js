const crypto = require('crypto');

/**
 * AES-256-GCM helpers (same format as src/routes/auth.js).
 * Shared so integrations do not need to load the full auth router.
 */
function encrypt(text) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(ciphertext) {
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(':');
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

module.exports = { encrypt, decrypt };

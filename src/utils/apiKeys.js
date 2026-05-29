const crypto = require('crypto');

function buildApiKey() {
  const rawKey = `fd_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 8);
  return { rawKey, keyHash, keyPrefix };
}

module.exports = { buildApiKey };

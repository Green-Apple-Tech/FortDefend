const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fortdefend-dev-secret-change-me';

function requireJwt(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireDeviceToken(db) {
  return async (req, res, next) => {
    const token = req.headers['x-device-token'] || req.body?.deviceToken;
    if (!token) {
      return res.status(401).json({ error: 'Missing device token' });
    }

    const device = await db('devices').where({ token }).first();
    if (!device) {
      return res.status(401).json({ error: 'Invalid device token' });
    }

    req.device = device;
    return next();
  };
}

module.exports = { requireJwt, requireDeviceToken, JWT_SECRET };

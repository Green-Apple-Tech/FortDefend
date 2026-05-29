let warned;
function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  if (!warned) {
    warned = true;
    console.warn('[FortDefend] JWT_SECRET is not set; using a development-only fallback. Set JWT_SECRET in production.');
  }
  return 'fortdefend-dev-fallback-jwt-secret-not-for-production';
}

module.exports = { getJwtSecret };

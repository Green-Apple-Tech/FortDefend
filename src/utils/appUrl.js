function getAppUrl() {
  const appUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  if (!appUrl) {
    throw new Error('APP_URL is not configured');
  }
  return appUrl;
}

module.exports = { getAppUrl };

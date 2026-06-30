const express = require('express');
const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkTrialStatus } = require('../middleware/trial');

const router = express.Router();
router.use(requireAuth, requireAdmin, checkTrialStatus);

router.get('/log', async (req, res, next) => {
  try {
    const logs = await db('agent_logs')
      .where({ org_id: req.user.orgId })
      .whereIn('agent_name', ['fortdefend_windows_agent', 'windows_remediation', 'patch_manager'])
      .orderBy('created_at', 'desc')
      .limit(100);
    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

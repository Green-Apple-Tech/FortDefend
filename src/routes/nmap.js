const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { checkTrialStatus } = require('../middleware/trial');
const { runNmapScan, detectShadowDevices, analyzeEnrollmentGaps } = require('../integrations/nmap');

router.use(requireAuth, requireAdmin, checkTrialStatus);

// POST /api/nmap/scan — trigger network scan
router.post('/scan', async (req, res, next) => {
  try {
    const { subnet } = req.body;
    if (!subnet) {
      return res.status(400).json({ error: 'Subnet required. Example: 192.168.1.0/24' });
    }

    // Run Nmap scan
    const { hosts, nmapAvailable } = await runNmapScan(subnet);

    if (!nmapAvailable) {
      return res.json({
        message: 'Nmap not available on this server. Install via Windows agent for local network scanning.',
        hosts: [],
        nmapAvailable: false,
      });
    }

    // Get enrolled devices for comparison
    const enrolledDevices = await db('devices')
      .where({ org_id: req.user.orgId });

    // Detect shadow devices
    const shadowDevices = await detectShadowDevices(
      req.user.orgId, hosts, enrolledDevices
    );

    // Analyze enrollment gaps
    const gapAnalysis = analyzeEnrollmentGaps(hosts, enrolledDevices);

    // Log scan
    await db('agent_logs').insert({
      org_id: req.user.orgId,
      agent_name: 'nmap_scanner',
      action: `network_scan:${subnet}`,
      result: JSON.stringify({ discovered: hosts.length, shadow: shadowDevices.length }),
      created_at: new Date(),
    });

    // Alert if shadow devices found
    if (shadowDevices.length > 0) {
      await db('alerts').insert({
        org_id: req.user.orgId,
        type: 'shadow_devices_detected',
        severity: 'warning',
        message: `${shadowDevices.length} unmanaged device${shadowDevices.length > 1 ? 's' : ''} found on network not enrolled in MDM`,
        ai_analysis: 'Review discovered devices and enroll in MDM or mark as approved.',
        resolved: false,
        created_at: new Date(),
      }).onConflict(['org_id', 'type']).merge({
        message: `${shadowDevices.length} unmanaged devices found on network`,
        resolved: false,
      });
    }

    res.json({
      subnet,
      totalDiscovered: hosts.length,
      shadowDevices,
      gapAnalysis,
      allHosts: hosts,
      nmapAvailable: true,
    });
  } catch (err) { next(err); }
});

// GET /api/nmap/shadow-devices — list known shadow devices
router.get('/shadow-devices', async (req, res, next) => {
  try {
    const shadows = await db('shadow_devices')
      .where({ org_id: req.user.orgId, resolved: false })
      .orderBy('last_seen', 'desc');
    res.json({ shadowDevices: shadows });
  } catch (err) { next(err); }
});

// POST /api/nmap/shadow-devices/:id/resolve — mark shadow device as approved
router.post('/shadow-devices/:id/resolve', async (req, res, next) => {
  try {
    await db('shadow_devices')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .update({ resolved: true });
    res.json({ message: 'Device marked as approved.' });
  } catch (err) { next(err); }
});

module.exports = router;

// Verification checks — platform-aware, deterministic, auditable
// These replace the old "AI agents" concept entirely

const CHECKS = {
  chromebook: [
    {
      id: 'cb_os_version',
      name: 'OS version current',
      description: 'Confirms ChromeOS is on the latest stable version for this device',
      severity: 'critical',
      autoHeal: false,
      manualAction: 'Trigger update via Google Admin',
    },
    {
      id: 'cb_aue_date',
      name: 'Auto-update expiry',
      description: 'Flags devices within 180 days of their AUE date — they will stop receiving security updates',
      severity: 'warning',
      autoHeal: false,
      manualAction: 'Plan device replacement',
    },
    {
      id: 'cb_policy_sync',
      name: 'Policy sync confirmed',
      description: 'Verifies Google Admin policies actually applied to the device — not just pushed',
      severity: 'critical',
      autoHeal: true,
      healAction: 'Trigger policy re-sync via Chrome Management API',
    },
    {
      id: 'cb_enrollment',
      name: 'Enrollment active',
      description: 'Confirms device is still enrolled in management — detects devices that were unenrolled',
      severity: 'critical',
      autoHeal: false,
      manualAction: 'Re-enroll device',
    },
    {
      id: 'cb_encryption',
      name: 'Encryption verified',
      description: 'Confirms device encryption is active — not just assumed',
      severity: 'critical',
      autoHeal: false,
      manualAction: 'Powerwash and re-enroll if encryption disabled',
    },
    {
      id: 'cb_checkin_staleness',
      name: 'Device check-in recency',
      description: 'Flags devices that have not checked into Google Admin in 7+ days',
      severity: 'warning',
      autoHeal: false,
      manualAction: 'Locate device or mark as lost',
    },
    {
      id: 'cb_screen_lock',
      name: 'Screen lock policy enforced',
      description: 'Verifies idle/screen lock policy is actually active on device',
      severity: 'warning',
      autoHeal: true,
      healAction: 'Re-push screen lock policy via Google Admin',
    },
    {
      id: 'cb_org_unit_drift',
      name: 'Org unit assignment',
      description: 'Detects devices that drifted to wrong org unit — wrong policies may be applied',
      severity: 'warning',
      autoHeal: false,
      manualAction: 'Move device to correct org unit in Google Admin',
    },
  ],

  android: [
    {
      id: 'and_play_protect',
      name: 'Play Protect active',
      description: 'Confirms Google Play Protect is enabled and scanning — not just installed',
      severity: 'critical',
      autoHeal: false,
      manualAction: 'Re-enable via MDM policy',
    },
    {
      id: 'and_os_version',
      name: 'Android OS version',
      description: 'Checks OS version against minimum required — flags devices 2+ major versions behind',
      severity: 'critical',
      autoHeal: false,
      manualAction: 'Push OS update or retire device',
    },
    {
      id: 'and_encryption',
      name: 'Device encryption',
      description: 'Confirms device encryption is active',
      severity: 'critical',
      autoHeal: false,
      manualAction: 'Factory reset required if encryption disabled',
    },
    {
      id: 'and_screen_lock',
      name: 'Screen lock configured',
      description: 'Verifies PIN, password, or biometric lock is set',
      severity: 'critical',
      autoHeal: true,
      healAction: 'Enforce screen lock via MDM policy push',
    },
    {
      id: 'and_unknown_sources',
      name: 'Sideloading blocked',
      description: 'Confirms unknown app sources are disabled — prevents unauthorized app installs',
      severity: 'warning',
      autoHeal: true,
      healAction: 'Re-push restriction policy via MDM',
    },
    {
      id: 'and_work_profile',
      name: 'Work profile intact',
      description: 'Verifies work profile is active and not removed or corrupted',
      severity: 'critical',
      autoHeal: false,
      manualAction: 'Re-enroll work profile',
    },
    {
      id: 'and_usb_debugging',
      name: 'USB debugging disabled',
      description: 'Flags devices with USB debugging or developer options enabled',
      severity: 'warning',
      autoHeal: true,
      healAction: 'Push restriction via MDM policy',
    },
    {
      id: 'and_high_risk_apps',
      name: 'High-risk app detection',
      description: 'Detects sideloaded apps or apps flagged by Play Protect',
      severity: 'critical',
      autoHeal: false,
      manualAction: 'Review and remove flagged apps',
    },
    {
      id: 'and_checkin_staleness',
      name: 'Device check-in recency',
      description: 'Flags devices not checking into MDM in 7+ days',
      severity: 'warning',
      autoHeal: false,
      manualAction: 'Locate device or mark as lost',
    },
  ],

  windows: [
    {
      id: 'win_patch_compliance',
      name: 'Patch compliance',
      description: 'Verifies all critical Windows and software patches are applied — replaces Ninite for MSPs',
      severity: 'critical',
      autoHeal: true,
      healAction: 'Trigger patch install via Intune or winget',
    },
    {
      id: 'win_bitlocker',
      name: 'BitLocker encryption',
      description: 'Confirms BitLocker is active on all drives — not just policy-intended',
      severity: 'critical',
      autoHeal: true,
      healAction: 'Enable BitLocker via PowerShell remediation script',
    },
    {
      id: 'win_defender',
      name: 'Defender active and current',
      description: 'Confirms Windows Defender is running with current definitions',
      severity: 'critical',
      autoHeal: true,
      healAction: 'Restart Defender service and trigger definition update',
    },
    {
      id: 'win_policy_drift',
      name: 'Policy drift detection',
      description: 'Compares intended Intune configuration vs actual device state',
      severity: 'warning',
      autoHeal: false,
      manualAction: 'Trigger Intune sync and review compliance policy',
    },
    {
      id: 'win_firewall',
      name: 'Firewall active',
      description: 'Confirms Windows Firewall is on for all profiles',
      severity: 'critical',
      autoHeal: true,
      healAction: 'Re-enable firewall via PowerShell remediation script',
    },
    {
      id: 'win_checkin_staleness',
      name: 'Device check-in recency',
      description: 'Flags devices not syncing with Intune in 7+ days',
      severity: 'warning',
      autoHeal: false,
      manualAction: 'Investigate device connectivity or retire',
    },
  ],
};

const CHECK_SCHEDULES = {
  chromebook: '0 */4 * * *',   // every 4 hours
  android: '0 */6 * * *',      // every 6 hours
  windows: '0 */4 * * *',      // every 4 hours
};

const SEVERITY_WEIGHT = { critical: 3, warning: 1, info: 0 };

function getAllChecksForPlatform(platform) {
  return CHECKS[platform] || [];
}

function getAutoHealableChecks(platform) {
  return (CHECKS[platform] || []).filter(c => c.autoHeal);
}

function calculateComplianceScore(results) {
  if (!results || results.length === 0) return 100;
  const total = results.length;
  const failed = results.filter(r => r.status === 'fail');
  const warned = results.filter(r => r.status === 'warn');
  const criticalFails = failed.filter(r => r.severity === 'critical').length;
  const warningFails = warned.length + failed.filter(r => r.severity === 'warning').length;
  const score = Math.max(0, 100 - (criticalFails * 20) - (warningFails * 5));
  return Math.round(score);
}

function scoreToGrade(score) {
  if (score >= 90) return { grade: 'A', color: 'green', label: 'Secure' };
  if (score >= 75) return { grade: 'B', color: 'blue', label: 'Good' };
  if (score >= 60) return { grade: 'C', color: 'amber', label: 'Review needed' };
  if (score >= 40) return { grade: 'D', color: 'orange', label: 'At risk' };
  return { grade: 'F', color: 'red', label: 'Critical issues' };
}

module.exports = {
  CHECKS,
  CHECK_SCHEDULES,
  getAllChecksForPlatform,
  getAutoHealableChecks,
  calculateComplianceScore,
  scoreToGrade,
};

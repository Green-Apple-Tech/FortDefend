// Windows verification checks used for deterministic compliance scoring.

const CHECKS = {
  windows: [
    {
      id: 'win_patch_compliance',
      name: 'Patch compliance',
      description: 'Verifies Windows and third-party software patches are applied.',
      severity: 'critical',
      autoHeal: true,
      healAction: 'Trigger FortDefend patch scan or update command',
    },
    {
      id: 'win_reboot_pending',
      name: 'Pending reboot',
      description: 'Flags devices that need a reboot after OS or app updates.',
      severity: 'warning',
      autoHeal: true,
      healAction: 'Apply reboot policy',
    },
    {
      id: 'win_defender',
      name: 'Defender active and current',
      description: 'Confirms Microsoft Defender is running with current protection.',
      severity: 'critical',
      autoHeal: true,
      healAction: 'Restart Defender service and trigger definition update',
    },
    {
      id: 'win_disk_free',
      name: 'Disk free space',
      description: 'Flags PCs with critically low free disk space before patching.',
      severity: 'critical',
      autoHeal: false,
      manualAction: 'Clean up disk or expand storage',
    },
    {
      id: 'win_checkin_staleness',
      name: 'Device check-in recency',
      description: 'Flags Windows PCs that have stopped checking in.',
      severity: 'warning',
      autoHeal: false,
      manualAction: 'Investigate agent service, network, or device power state',
    },
  ],
};

const CHECK_SCHEDULES = {
  windows: '0 */4 * * *',
};

const SEVERITY_WEIGHT = { critical: 3, warning: 1, info: 0 };

function getAllChecksForPlatform(platform) {
  return CHECKS[platform] || [];
}

function getAutoHealableChecks(platform) {
  return (CHECKS[platform] || []).filter((check) => check.autoHeal);
}

function calculateComplianceScore(results) {
  if (!results || results.length === 0) return 100;
  const failed = results.filter((result) => result.status === 'fail');
  const warned = results.filter((result) => result.status === 'warn');
  const criticalFails = failed.filter((result) => result.severity === 'critical').length;
  const warningFails = warned.length + failed.filter((result) => result.severity === 'warning').length;
  return Math.round(Math.max(0, 100 - criticalFails * 20 - warningFails * 5));
}

function scoreToGrade(score) {
  if (score >= 90) return { grade: 'A', color: 'green', label: 'Secure' };
  if (score >= 75) return { grade: 'B', color: 'blue', label: 'Good' };
  if (score >= 60) return { grade: 'C', color: 'amber', label: 'Review needed' };
  if (score >= 40) return { grade: 'D', color: 'orange', label: 'At risk' };
  return { grade: 'F', color: 'red', label: 'Critical' };
}

module.exports = {
  CHECKS,
  CHECK_SCHEDULES,
  SEVERITY_WEIGHT,
  getAllChecksForPlatform,
  getAutoHealableChecks,
  calculateComplianceScore,
  scoreToGrade,
};

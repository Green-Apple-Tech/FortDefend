const { ThreatHunter } = require('./threatHunter');
const { HealthMonitor } = require('./healthMonitor');
const { StartupOptimizer } = require('./startupOptimizer');
const { NetworkSentinel } = require('./networkSentinel');
const { ComplianceAuditor } = require('./complianceAuditor');
const { OsUpdateMonitor } = require('./osUpdateMonitor');
const { RebootScheduler } = require('./rebootScheduler');
const { PasswordAgeMonitor } = require('./passwordAgeMonitor');
const { DriverHealthMonitor } = require('./driverHealthMonitor');
const { BackupVerifier } = require('./backupVerifier');
const { WifiSecurityChecker } = require('./wifiSecurityChecker');
const { WeeklyReportWriter } = require('./weeklyReportWriter');
const { SelfHealer } = require('./selfHealer');
const { PatchGuardian } = require('./patchGuardian');

/**
 * All FortDefend AI agents (instances for one org).
 * @param {string} orgId
 * @param {{ db: import('knex').Knex, anthropicClient?: unknown, integrationManager?: unknown, rebootScheduleCron?: string }} deps
 */
function createAllFortDefendAgents(orgId, deps) {
  const base = { orgId, db: deps.db, anthropicClient: deps.anthropicClient, integrationManager: deps.integrationManager };
  return [
    new ThreatHunter(base),
    new HealthMonitor(base),
    new StartupOptimizer(base),
    new NetworkSentinel(base),
    new ComplianceAuditor(base),
    new OsUpdateMonitor(base),
    new RebootScheduler({ ...base, rebootScheduleCron: deps.rebootScheduleCron }),
    new PasswordAgeMonitor(base),
    new DriverHealthMonitor(base),
    new BackupVerifier(base),
    new WifiSecurityChecker(base),
    new WeeklyReportWriter(base),
    new SelfHealer(base),
    new PatchGuardian(base),
  ];
}

/**
 * Register all agents with `registerAgentFactory` from `./scheduler`.
 * @param {(fn: (orgId: string, deps: object) => import('./base').BaseAgent[]) => void} registerAgentFactory
 */
function registerAllAgentFactories(registerAgentFactory) {
  registerAgentFactory((orgId, deps) => createAllFortDefendAgents(orgId, deps));
}

/** Convenience: `const { registerAllWithScheduler } = require('./agents'); registerAllWithScheduler();` */
function registerAllWithScheduler() {
  const { registerAgentFactory } = require('./scheduler');
  registerAllAgentFactories(registerAgentFactory);
}

module.exports = {
  createAllFortDefendAgents,
  registerAllAgentFactories,
  registerAllWithScheduler,
  ThreatHunter,
  HealthMonitor,
  StartupOptimizer,
  NetworkSentinel,
  ComplianceAuditor,
  OsUpdateMonitor,
  RebootScheduler,
  PasswordAgeMonitor,
  DriverHealthMonitor,
  BackupVerifier,
  WifiSecurityChecker,
  WeeklyReportWriter,
  SelfHealer,
  PatchGuardian,
};

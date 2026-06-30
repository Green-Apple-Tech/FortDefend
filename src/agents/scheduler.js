const AnthropicSdk = require('@anthropic-ai/sdk');
const Anthropic = AnthropicSdk.Anthropic || AnthropicSdk.default;
const db = require('../database');
const { IntegrationManager } = require('../integrations/manager');

/** @type {Map<string, import('./base').BaseAgent[]>} */
const agentsByOrg = new Map();

/** @type {((orgId: string, deps: AgentDeps) => import('./base').BaseAgent[])[]} */
const agentFactories = [];

/**
 * @typedef {object} AgentDeps
 * @property {import('knex').Knex} db
 * @property {import('@anthropic-ai/sdk').default} anthropicClient
 * @property {import('../integrations/manager').IntegrationManager} integrationManager
 */

/**
 * Register a factory that builds agent instances for an org (e.g. concrete PatchAgent).
 * @param {(orgId: string, deps: AgentDeps) => import('./base').BaseAgent[]} factory
 */
function registerAgentFactory(factory) {
  agentFactories.push(factory);
}

/**
 * Build all registered agents for an organization.
 * @param {string} orgId
 * @param {Partial<AgentDeps>} [overrides]
 */
function loadAgentsForOrg(orgId, overrides = {}) {
  const anthropicClient =
    overrides.anthropicClient ||
    (process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null);

  const deps = {
    db: overrides.db || db,
    anthropicClient,
    integrationManager: overrides.integrationManager || new IntegrationManager(orgId),
  };

  const agents = [];
  for (const factory of agentFactories) {
    try {
      const built = factory(orgId, deps) || [];
      agents.push(...built);
    } catch (e) {
      console.error(`[scheduler] factory failed for org ${orgId}:`, e);
    }
  }
  return agents;
}

async function startAll() {
  await stopAll();

  const orgs = await db('orgs').select('id');
  const anthropicClient = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

  for (const { id: orgId } of orgs) {
    const integrationManager = new IntegrationManager(orgId);
    const agents = loadAgentsForOrg(orgId, { anthropicClient, integrationManager, db });
    if (!agents.length) continue;

    agentsByOrg.set(
      orgId,
      agents.map((a) => {
        a.start();
        return a;
      })
    );
  }
}

async function stopAll() {
  for (const agents of agentsByOrg.values()) {
    for (const a of agents) {
      try {
        a.stop();
      } catch (e) {
        console.error('[scheduler] stop agent:', e);
      }
    }
  }
  agentsByOrg.clear();
}

function getStatus() {
  const orgs = {};
  for (const [orgId, agents] of agentsByOrg.entries()) {
    orgs[orgId] = agents.map((a) => ({
      name: a.name,
      schedule: a.schedule,
      running: typeof a.isRunning === 'function' ? a.isRunning() : false,
    }));
  }
  return {
    orgCount: agentsByOrg.size,
    agentCount: [...agentsByOrg.values()].reduce((n, list) => n + list.length, 0),
    registeredFactories: agentFactories.length,
    orgs,
  };
}

module.exports = {
  registerAgentFactory,
  loadAgentsForOrg,
  startAll,
  stopAll,
  getStatus,
};

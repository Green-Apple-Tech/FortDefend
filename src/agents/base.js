const cron = require('node-cron');

const { sendAlert } = require('../utils/notifications');

/**
 * Abstract autonomous agent: observe → think (Claude) → act.
 */
class BaseAgent {
  constructor({ name, schedule, orgId, db, anthropicClient, integrationManager }) {
    if (!name || !orgId || !db) {
      throw new Error('BaseAgent requires name, orgId, and db');
    }
    this.name = name;
    this.schedule = schedule || '0 * * * *';
    this.orgId = orgId;
    this.db = db;
    this.anthropicClient = anthropicClient;
    this.integrationManager = integrationManager;
    this._cronTask = null;
  }

  /** @returns {Promise<unknown>} */
  async observe() {
    throw new Error(`${this.name}: observe() must be implemented by subclass`);
  }

  /**
   * Ask Claude to analyze observation data and return structured decisions (JSON).
   * @param {unknown} data
   * @returns {Promise<{ decisions: unknown[], summary?: string }>}
   */
  async think(data) {
    if (!this.anthropicClient) {
      throw new Error(`${this.name}: anthropicClient is required for think()`);
    }

    const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    const payload =
      typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const truncated = payload.length > 120_000 ? `${payload.slice(0, 120_000)}\n…[truncated]` : payload;

    const msg = await this.anthropicClient.messages.create({
      model,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `You are the FortDefend agent "${this.name}" for one organization. Analyze the data and reply with **only valid JSON** (no markdown fences) in this shape:\n{"decisions":[],"summary":"one sentence"}\n\nEach decision object should describe a concrete follow-up (type, priority, rationale, optional deviceHint).\n\nData:\n${truncated}`,
        },
      ],
    });

    const textBlock = msg.content?.find((b) => b.type === 'text');
    const raw = textBlock?.text?.trim() || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, ''));
    } catch {
      parsed = { decisions: [], summary: raw.slice(0, 500), parseError: true };
    }

    if (!Array.isArray(parsed.decisions)) {
      parsed.decisions = [];
    }
    return parsed;
  }

  /** @param {unknown} decisions */
  async act(decisions) {
    throw new Error(`${this.name}: act(decisions) must be implemented by subclass`);
  }

  async run() {
    try {
      const data = await this.observe();
      const thought = await this.think(data);
      await this.act(thought.decisions);
      await this.log('run_complete', {
        success: true,
        summary: thought.summary || null,
        decisionCount: Array.isArray(thought.decisions) ? thought.decisions.length : 0,
      });
    } catch (err) {
      console.error(`[Agent ${this.name}] run failed:`, err);
      await this.log(
        'run_error',
        {
          success: false,
          error: err.message || String(err),
        },
        null
      );
    }
  }

  async log(action, result, deviceId = null) {
    await this.db('agent_logs').insert({
      org_id: this.orgId,
      agent_name: this.name,
      action,
      result: result == null ? null : result,
      device_id: deviceId || null,
    });
  }

  /**
   * Persist alert and trigger notifications (deduplicated in sendAlert).
   * @param {string|null} deviceId FortDefend devices.id UUID when known
   */
  async alert(deviceId, type, severity, message, aiAnalysis) {
    return sendAlert({
      orgId: this.orgId,
      deviceId,
      type,
      severity,
      message,
      aiAnalysis,
    });
  }

  start() {
    if (this._cronTask) return;
    if (!cron.validate(this.schedule)) {
      throw new Error(`Invalid cron schedule for agent ${this.name}: ${this.schedule}`);
    }
    this._cronTask = cron.schedule(this.schedule, () => {
      this.run().catch((e) => console.error(`[Agent ${this.name}] cron run:`, e));
    });
  }

  stop() {
    if (this._cronTask) {
      this._cronTask.stop();
      this._cronTask = null;
    }
  }

  isRunning() {
    return !!this._cronTask;
  }
}

module.exports = { BaseAgent };

/**
 * Shared helpers for FortDefend agents: hardened run loop + Claude JSON decisions.
 */

/**
 * Never-throwing agent run: observe → think → act → run_complete.
 * @param {import('./base').BaseAgent} agent
 */
async function defaultSafeRun(agent) {
  try {
    const data = await agent.observe().catch(async (e) => {
      console.error(`[${agent.name}] observe:`, e);
      try {
        await agent.log('observe_fatal', { error: e.message || String(e) }, null);
      } catch {
        /* ignore */
      }
      return {};
    });

    const thought = await agent.think(data).catch(async (e) => {
      console.error(`[${agent.name}] think:`, e);
      try {
        await agent.log('think_fatal', { error: e.message || String(e) }, null);
      } catch {
        /* ignore */
      }
      return { decisions: [], summary: '' };
    });

    await agent.act(thought.decisions || []).catch(async (e) => {
      console.error(`[${agent.name}] act:`, e);
      try {
        await agent.log('act_fatal', { error: e.message || String(e) }, null);
      } catch {
        /* ignore */
      }
    });

    try {
      await agent.log('run_complete', {
        success: true,
        summary: thought.summary || null,
        decisionCount: Array.isArray(thought.decisions) ? thought.decisions.length : 0,
      });
    } catch {
      /* ignore */
    }
  } catch (e) {
    console.error(`[${agent.name}] run outer:`, e);
    try {
      await agent.log('run_outer_fatal', { error: e.message || String(e) }, null);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Ask Claude for structured decisions; never throws.
 * @param {import('./base').BaseAgent} agent
 * @param {{ instruction: string, data: unknown, maxChars?: number }} opts
 * @returns {Promise<{ decisions: unknown[], summary?: string }>}
 */
async function askDecisions(agent, { instruction, data, maxChars = 100_000 }) {
  try {
    if (!agent.anthropicClient) {
      return { decisions: [], summary: 'Anthropic client not configured; skipped AI triage.' };
    }

    const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    let payload;
    try {
      payload = JSON.stringify(data ?? {});
    } catch {
      payload = '{}';
    }
    if (payload.length > maxChars) {
      payload = `${payload.slice(0, maxChars)}\n…[truncated]`;
    }

    const msg = await agent.anthropicClient.messages.create({
      model,
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `${instruction}\n\nObserved JSON:\n${payload}\n\nReply with **only valid JSON** (no markdown fences): {"decisions":[],"summary":"one sentence"}`,
        },
      ],
    });

    const textBlock = msg.content?.find((b) => b.type === 'text');
    const raw = textBlock?.text?.trim() || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, ''));
    } catch {
      return { decisions: [], summary: raw.slice(0, 400) };
    }
    if (!Array.isArray(parsed.decisions)) {
      parsed.decisions = [];
    }
    return { decisions: parsed.decisions, summary: parsed.summary || '' };
  } catch (e) {
    console.error(`[${agent.name}] askDecisions:`, e);
    try {
      await agent.log('ask_decisions_error', { error: e.message || String(e) }, null);
    } catch {
      /* ignore */
    }
    return { decisions: [], summary: '' };
  }
}

function devicesBaseQuery(db, orgId) {
  return db('devices').where('org_id', orgId);
}

module.exports = {
  defaultSafeRun,
  askDecisions,
  devicesBaseQuery,
};

const express = require('express');
const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const PLATFORM_SCRIPT_TYPES = {
  windows: ['powershell', 'cmd', 'python'],
  mac: ['bash', 'zsh', 'python'],
  chromebook: ['javascript'],
  android: [],
  linux: ['bash', 'python'],
};

function normalizePlatforms(platforms) {
  if (!Array.isArray(platforms)) return [];
  return [...new Set(platforms.map((p) => String(p || '').trim().toLowerCase()).filter(Boolean))];
}

function validateScriptTypeForPlatforms(scriptType, platforms) {
  const normalizedType = String(scriptType || '').trim().toLowerCase();
  if (!normalizedType) return { ok: false, message: 'scriptType is required.' };
  if (!platforms.length) return { ok: false, message: 'At least one platform is required.' };
  const allowed = new Set();
  for (const platform of platforms) {
    const list = PLATFORM_SCRIPT_TYPES[platform];
    if (!list) return { ok: false, message: `Unsupported platform: ${platform}` };
    for (const t of list) allowed.add(t);
  }
  if (!allowed.has(normalizedType)) {
    return { ok: false, message: `scriptType "${normalizedType}" is not valid for selected platforms.` };
  }
  return { ok: true, scriptType: normalizedType };
}

function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (s === 'success') return 'success';
  if (s === 'failed') return 'failed';
  if (s === 'cancelled') return 'cancelled';
  if (s === 'running') return 'running';
  return 'pending';
}

router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const scripts = await db('scripts')
      .where('org_id', req.user.orgId)
      .select('id', 'name', 'description', 'platforms', 'script_type', 'content', 'created_by', 'last_run_at', 'created_at', 'updated_at')
      .orderBy('created_at', 'desc');
    res.json({ scripts });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const description = req.body?.description == null ? null : String(req.body.description);
    const content = String(req.body?.content || '');
    const platforms = normalizePlatforms(req.body?.platforms);
    const typeCheck = validateScriptTypeForPlatforms(req.body?.scriptType, platforms);

    if (!name) return res.status(400).json({ error: 'name is required.' });
    if (!content.trim()) return res.status(400).json({ error: 'content is required.' });
    if (!typeCheck.ok) return res.status(400).json({ error: typeCheck.message });

    const [script] = await db('scripts')
      .insert({
        org_id: req.user.orgId,
        name,
        description,
        platforms,
        script_type: typeCheck.scriptType,
        content,
        created_by: req.user.id || null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning(['id', 'name', 'description', 'platforms', 'script_type', 'created_by', 'last_run_at', 'created_at', 'updated_at']);

    res.status(201).json({ script });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const existing = await db('scripts').where({ id: req.params.id, org_id: req.user.orgId }).first();
    if (!existing) return res.status(404).json({ error: 'Script not found.' });

    const nextPlatforms = normalizePlatforms(req.body?.platforms ?? existing.platforms ?? []);
    const nextType = req.body?.scriptType ?? existing.script_type;
    const typeCheck = validateScriptTypeForPlatforms(nextType, nextPlatforms);
    if (!typeCheck.ok) return res.status(400).json({ error: typeCheck.message });

    const updates = {
      updated_at: new Date(),
      script_type: typeCheck.scriptType,
      platforms: nextPlatforms,
    };
    if (req.body?.name != null) updates.name = String(req.body.name).trim();
    if (req.body?.description !== undefined) updates.description = req.body.description == null ? null : String(req.body.description);
    if (req.body?.content != null) updates.content = String(req.body.content);
    if (!updates.name && existing.name) updates.name = existing.name;
    if (!String(updates.content ?? existing.content ?? '').trim()) {
      return res.status(400).json({ error: 'content is required.' });
    }

    const [script] = await db('scripts')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .update(updates)
      .returning(['id', 'name', 'description', 'platforms', 'script_type', 'created_by', 'last_run_at', 'created_at', 'updated_at']);

    res.json({ script });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const deleted = await db('scripts').where({ id: req.params.id, org_id: req.user.orgId }).delete();
    if (!deleted) return res.status(404).json({ error: 'Script not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

async function queueScriptRun(req, res, next, scriptIdParam) {
  try {
    const deviceIds = Array.isArray(req.body?.deviceIds)
      ? [...new Set(req.body.deviceIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : [];
    if (!deviceIds.length) return res.status(400).json({ error: 'deviceIds must be a non-empty array.' });

    let script = null;
    if (scriptIdParam !== 'quick') {
      script = await db('scripts').where({ id: scriptIdParam, org_id: req.user.orgId }).first();
      if (!script) return res.status(404).json({ error: 'Script not found.' });
    }

    const quickContent = req.body?.scriptContent == null ? null : String(req.body.scriptContent);
    const quickType = req.body?.scriptType == null ? null : String(req.body.scriptType).toLowerCase();
    const content = quickContent != null ? quickContent : script?.content;
    const scriptType = quickType || script?.script_type;
    const scriptName = (req.body?.scriptName && String(req.body.scriptName).trim()) || script?.name || 'Quick script';
    if (!String(content || '').trim()) return res.status(400).json({ error: 'script content is required.' });
    if (!String(scriptType || '').trim()) return res.status(400).json({ error: 'script type is required.' });

    const orgDevices = await db('devices')
      .where('org_id', req.user.orgId)
      .whereIn('id', deviceIds)
      .select('id', 'name', 'os', 'source');
    if (!orgDevices.length) {
      return res.status(400).json({ error: 'No valid devices found in your organization.' });
    }
    const androidTargets = orgDevices.filter((d) => String(d.os || '').toLowerCase() === 'android');
    if (androidTargets.length > 0) {
      return res.status(400).json({
        error:
          'Android does not support arbitrary scripts. Use predefined safe Android actions only (clear cache, get device info, check Play Protect).',
      });
    }

    const now = new Date();
    const rows = orgDevices.map((device) => ({
      org_id: req.user.orgId,
      device_id: device.id,
      winget_id: script ? `script:${script.id}` : 'script:quick',
      command_type: 'run_script',
      status: 'pending',
      initiated_by: req.user.id || null,
      command_payload: {
        scriptId: script?.id || null,
        scriptName,
        scriptType,
        scriptContent: content,
      },
      created_at: now,
      updated_at: now,
    }));

    let queued;
    try {
      queued = await db('sm_commands')
        .insert(rows)
        .returning(['id', 'device_id', 'status', 'created_at']);
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg.includes('sm_commands_command_type_enum') || msg.includes('run_script')) {
        return res.status(500).json({
          error:
            'Script commands are not enabled in this database yet. Run migrations to add run_script support.',
        });
      }
      throw err;
    }

    if (script) {
      await db('scripts').where({ id: script.id, org_id: req.user.orgId }).update({ last_run_at: now, updated_at: now });
    }

    res.status(201).json({ queued: queued.length, commands: queued });
  } catch (err) {
    next(err);
  }
}

router.post('/quick/run', requireAdmin, async (req, res, next) => queueScriptRun(req, res, next, 'quick'));
router.post('/:id/run', requireAdmin, async (req, res, next) => queueScriptRun(req, res, next, req.params.id));

router.get('/:id/history', requireAdmin, async (req, res, next) => {
  try {
    const commandIds = String(req.query.commandIds || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const isQuick = req.params.id === 'quick';
    if (!isQuick) {
      const exists = await db('scripts').where({ id: req.params.id, org_id: req.user.orgId }).first();
      if (!exists) return res.status(404).json({ error: 'Script not found.' });
    }

    const rowsQuery = db('sm_commands as c')
      .join('devices as d', 'd.id', 'c.device_id')
      .where('c.org_id', req.user.orgId)
      .andWhere('d.org_id', req.user.orgId)
      .select(
        'c.id',
        'c.device_id',
        'd.name as device_name',
        'c.status',
        'c.output',
        'c.error_message',
        'c.command_payload',
        'c.created_at',
        'c.updated_at',
        'c.completed_at'
      )
      .orderBy('c.created_at', 'desc');

    if (isQuick) {
      rowsQuery.andWhereRaw("c.command_payload->>'scriptId' IS NULL");
    } else {
      rowsQuery.andWhereRaw("c.command_payload->>'scriptId' = ?", [req.params.id]);
    }
    if (commandIds.length) rowsQuery.whereIn('c.id', commandIds);
    const rows = await rowsQuery.limit(200);

    const history = rows.map((r) => ({
      ...r,
      status: normalizeStatus(r.status),
    }));
    res.json({ history });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

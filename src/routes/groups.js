const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const db = require('../database');

router.get('/', requireAuth, async (req, res) => {
  try {
    const groups = await db('groups')
      .where('org_id', req.user.orgId)
      .orderBy('sort_order', 'asc')
      .orderBy('name', 'asc');

    const deviceCounts = await db('device_groups')
      .join('devices', 'device_groups.device_id', 'devices.id')
      .where('devices.org_id', req.user.orgId)
      .groupBy('device_groups.group_id')
      .select('device_groups.group_id')
      .count('device_groups.device_id as count');

    const countMap = {};
    deviceCounts.forEach(row => {
      countMap[row.group_id] = parseInt(row.count);
    });

    const tree = buildTree(groups, null, countMap);
    res.json({ groups: tree });
  } catch (err) {
    console.error('Get groups error:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, parent_id, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    if (parent_id) {
      const parent = await db('groups')
        .where({ id: parent_id, org_id: req.user.orgId })
        .first();
      if (!parent) return res.status(404).json({ error: 'Parent group not found' });
    }
    const [group] = await db('groups')
      .insert({
        id: uuidv4(),
        org_id: req.user.orgId,
        parent_id: parent_id || null,
        name: name.trim(),
        description: description || null,
        sort_order: 0,
      })
      .returning('*');
    res.status(201).json({ group });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { name, parent_id, description, sort_order } = req.body;
    const existing = await db('groups')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();
    if (!existing) return res.status(404).json({ error: 'Group not found' });
    if (parent_id) {
      if (parent_id === req.params.id) {
        return res.status(400).json({ error: 'A group cannot be its own parent' });
      }
      const descendants = await getDescendantIds(req.params.id, req.user.orgId);
      if (descendants.includes(parent_id)) {
        return res.status(400).json({ error: 'Cannot move a group into its own descendant' });
      }
    }
    const updates = { updated_at: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (parent_id !== undefined) updates.parent_id = parent_id || null;
    if (description !== undefined) updates.description = description;
    if (sort_order !== undefined) updates.sort_order = sort_order;
    const [updated] = await db('groups')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .update(updates)
      .returning('*');
    res.json({ group: updated });
  } catch (err) {
    console.error('Update group error:', err);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const group = await db('groups')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();
    if (!group) return res.status(404).json({ error: 'Group not found' });
    await db.transaction(async (trx) => {
      await trx('groups')
        .where({ parent_id: req.params.id, org_id: req.user.orgId })
        .update({ parent_id: group.parent_id });
      await trx('device_groups').where('group_id', req.params.id).delete();
      await trx('groups')
        .where({ id: req.params.id, org_id: req.user.orgId })
        .delete();
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

router.get('/:id/devices', requireAuth, async (req, res) => {
  try {
    const group = await db('groups')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const devices = await db('devices')
      .join('device_groups', 'devices.id', 'device_groups.device_id')
      .where('device_groups.group_id', req.params.id)
      .where('devices.org_id', req.user.orgId)
      .select('devices.*');
    res.json({ devices });
  } catch (err) {
    console.error('Get group devices error:', err);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

router.post('/:id/devices', requireAuth, async (req, res) => {
  try {
    const { device_id } = req.body;
    const group = await db('groups')
      .where({ id: req.params.id, org_id: req.user.orgId })
      .first();
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const device = await db('devices')
      .where({ id: device_id, org_id: req.user.orgId })
      .first();
    if (!device) return res.status(404).json({ error: 'Device not found' });
    await db('device_groups')
      .insert({ device_id, group_id: req.params.id })
      .onConflict(['device_id', 'group_id'])
      .ignore();
    res.json({ success: true });
  } catch (err) {
    console.error('Add device to group error:', err);
    res.status(500).json({ error: 'Failed to add device to group' });
  }
});

router.delete('/:id/devices/:deviceId', requireAuth, async (req, res) => {
  try {
    await db('device_groups')
      .where({ group_id: req.params.id, device_id: req.params.deviceId })
      .delete();
    res.json({ success: true });
  } catch (err) {
    console.error('Remove device from group error:', err);
    res.status(500).json({ error: 'Failed to remove device from group' });
  }
});

router.post('/devices/:deviceId/move', requireAuth, async (req, res) => {
  try {
    const { from_group_id, to_group_id } = req.body;
    const { deviceId } = req.params;
    const device = await db('devices')
      .where({ id: deviceId, org_id: req.user.orgId })
      .first();
    if (!device) return res.status(404).json({ error: 'Device not found' });
    await db.transaction(async (trx) => {
      if (from_group_id) {
        await trx('device_groups')
          .where({ device_id: deviceId, group_id: from_group_id })
          .delete();
      }
      if (to_group_id) {
        await trx('device_groups')
          .insert({ device_id: deviceId, group_id: to_group_id })
          .onConflict(['device_id', 'group_id'])
          .ignore();
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Move device error:', err);
    res.status(500).json({ error: 'Failed to move device' });
  }
});

function buildTree(groups, parentId, countMap) {
  return groups
    .filter(g => g.parent_id === parentId)
    .map(g => ({
      ...g,
      device_count: countMap[g.id] || 0,
      children: buildTree(groups, g.id, countMap),
    }));
}

async function getDescendantIds(groupId, orgId) {
  const all = await db('groups').where('org_id', orgId);
  const ids = [];
  function collect(id) {
    all.filter(g => g.parent_id === id).forEach(g => {
      ids.push(g.id);
      collect(g.id);
    });
  }
  collect(groupId);
  return ids;
}

module.exports = router;
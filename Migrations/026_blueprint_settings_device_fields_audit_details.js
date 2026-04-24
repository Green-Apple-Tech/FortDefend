exports.up = async function up(knex) {
  const hasGroups = await knex.schema.hasTable('groups');
  if (hasGroups) {
    const hasCol = await knex.schema.hasColumn('groups', 'blueprint_settings');
    if (!hasCol) {
      await knex.schema.alterTable('groups', (table) => {
        table.jsonb('blueprint_settings').nullable();
      });
    }
  }

  const hasDevices = await knex.schema.hasTable('devices');
  if (hasDevices) {
    for (const [col, fn] of [
      ['asset_tag', (t) => t.string('asset_tag', 120).nullable()],
      ['assigned_user', (t) => t.string('assigned_user', 255).nullable()],
    ]) {
      const exists = await knex.schema.hasColumn('devices', col);
      if (!exists) await knex.schema.alterTable('devices', (table) => fn(table));
    }
  }

  const hasAudit = await knex.schema.hasTable('audit_log');
  if (hasAudit) {
    const hasDetails = await knex.schema.hasColumn('audit_log', 'details');
    if (!hasDetails) {
      await knex.schema.alterTable('audit_log', (table) => {
        table.jsonb('details').nullable();
      });
    }
  }
};

exports.down = async function down(knex) {
  const hasAudit = await knex.schema.hasTable('audit_log');
  if (hasAudit && (await knex.schema.hasColumn('audit_log', 'details'))) {
    await knex.schema.alterTable('audit_log', (table) => table.dropColumn('details'));
  }
  const hasDevices = await knex.schema.hasTable('devices');
  if (hasDevices) {
    if (await knex.schema.hasColumn('devices', 'asset_tag')) {
      await knex.schema.alterTable('devices', (t) => t.dropColumn('asset_tag'));
    }
    if (await knex.schema.hasColumn('devices', 'assigned_user')) {
      await knex.schema.alterTable('devices', (t) => t.dropColumn('assigned_user'));
    }
  }
  const hasGroups = await knex.schema.hasTable('groups');
  if (hasGroups && (await knex.schema.hasColumn('groups', 'blueprint_settings'))) {
    await knex.schema.alterTable('groups', (t) => t.dropColumn('blueprint_settings'));
  }
};

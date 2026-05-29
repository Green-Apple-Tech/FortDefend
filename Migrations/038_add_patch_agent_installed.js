exports.up = async function up(knex) {
  const hasInstalled = await knex.schema.hasColumn('devices', 'patch_agent_installed');
  if (!hasInstalled) {
    await knex.schema.alterTable('devices', (table) => {
      table.boolean('patch_agent_installed').notNullable().defaultTo(false);
    });
  }

  const hasScanAt = await knex.schema.hasColumn('devices', 'patch_scan_requested_at');
  if (!hasScanAt) {
    await knex.schema.alterTable('devices', (table) => {
      table.timestamp('patch_scan_requested_at').nullable();
    });
  }
};

exports.down = async function down(knex) {
  const hasScanAt = await knex.schema.hasColumn('devices', 'patch_scan_requested_at');
  if (hasScanAt) {
    await knex.schema.alterTable('devices', (table) => {
      table.dropColumn('patch_scan_requested_at');
    });
  }
  const hasInstalled = await knex.schema.hasColumn('devices', 'patch_agent_installed');
  if (hasInstalled) {
    await knex.schema.alterTable('devices', (table) => {
      table.dropColumn('patch_agent_installed');
    });
  }
};

exports.up = async function up(knex) {
  const hasPending = await knex.schema.hasColumn('devices', 'pending_update');
  if (!hasPending) {
    await knex.schema.alterTable('devices', (table) => {
      table.boolean('pending_update').notNullable().defaultTo(false);
    });
  }

  const hasAuto = await knex.schema.hasColumn('orgs', 'auto_update_agent');
  const hasNotify = await knex.schema.hasColumn('orgs', 'notify_before_agent_update');
  if (!hasAuto || !hasNotify) {
    await knex.schema.alterTable('orgs', (table) => {
      if (!hasAuto) table.boolean('auto_update_agent').notNullable().defaultTo(false);
      if (!hasNotify) table.boolean('notify_before_agent_update').notNullable().defaultTo(true);
    });
  }
};

exports.down = async function down(knex) {
  const hasPending = await knex.schema.hasColumn('devices', 'pending_update');
  if (hasPending) {
    await knex.schema.alterTable('devices', (table) => {
      table.dropColumn('pending_update');
    });
  }

  const hasAuto = await knex.schema.hasColumn('orgs', 'auto_update_agent');
  const hasNotify = await knex.schema.hasColumn('orgs', 'notify_before_agent_update');
  if (hasAuto || hasNotify) {
    await knex.schema.alterTable('orgs', (table) => {
      if (hasAuto) table.dropColumn('auto_update_agent');
      if (hasNotify) table.dropColumn('notify_before_agent_update');
    });
  }
};


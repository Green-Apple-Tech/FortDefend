exports.up = async function up(knex) {
  const hasPatchToken = await knex.schema.hasColumn('devices', 'patch_agent_token');
  if (!hasPatchToken) {
    await knex.schema.alterTable('devices', (table) => {
      table.string('patch_agent_token').nullable().unique();
    });
  }

  const hasPatchApps = await knex.schema.hasTable('patch_device_apps');
  if (!hasPatchApps) {
    await knex.schema.createTable('patch_device_apps', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
      table.string('label').notNullable();
      table.string('name').notNullable();
      table.string('installed_version');
      table.string('latest_version');
      table.string('status').notNullable().defaultTo('unknown');
      table.timestamp('last_checked').defaultTo(knex.fn.now());
      table.unique(['device_id', 'label']);
      table.index(['device_id', 'status']);
    });
  }

  const hasPatchResults = await knex.schema.hasTable('patch_results');
  if (!hasPatchResults) {
    await knex.schema.createTable('patch_results', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
      table.string('label').notNullable();
      table.string('name').notNullable();
      table.string('action').notNullable();
      table.string('from_version');
      table.string('to_version');
      table.timestamp('timestamp').defaultTo(knex.fn.now());
      table.text('error_message');
      table.index(['device_id', 'timestamp']);
    });
  }

  const hasPatchPolicies = await knex.schema.hasTable('patch_policies');
  if (!hasPatchPolicies) {
    await knex.schema.createTable('patch_policies', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
      table.string('label').notNullable();
      table.string('policy').notNullable().defaultTo('automatic');
      table.boolean('disable_builtin_updater').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['device_id', 'label']);
    });
  }

  const hasCatalog = await knex.schema.hasTable('manifest_catalog');
  if (!hasCatalog) {
    await knex.schema.createTable('manifest_catalog', (table) => {
      table.string('label').primary();
      table.string('name').notNullable();
      table.string('type').notNullable();
      table.text('download_url').notNullable();
      table.text('silent_args');
      table.string('expected_publisher');
      table.string('version_key');
      table.text('registry_path');
      table.jsonb('blocking_processes').defaultTo('[]');
      table.string('app_new_version');
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('patch_policies');
  await knex.schema.dropTableIfExists('patch_results');
  await knex.schema.dropTableIfExists('patch_device_apps');
  await knex.schema.dropTableIfExists('manifest_catalog');
  const hasPatchToken = await knex.schema.hasColumn('devices', 'patch_agent_token');
  if (hasPatchToken) {
    await knex.schema.alterTable('devices', (table) => {
      table.dropColumn('patch_agent_token');
    });
  }
};

exports.up = async (knex) => {
  await knex.schema.createTable('devices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('token').notNullable().unique();
    table.string('os_version');
    table.string('ip_address');
    table.timestamp('last_seen');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('device_apps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.string('label').notNullable();
    table.string('name').notNullable();
    table.string('installed_version');
    table.string('latest_version');
    table.string('status').notNullable().defaultTo('unknown');
    table.timestamp('last_checked').defaultTo(knex.fn.now());
    table.unique(['device_id', 'label']);
  });

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
  });

  await knex.schema.createTable('patch_policies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.string('label').notNullable();
    table.string('policy').notNullable().defaultTo('automatic');
    table.boolean('disable_builtin_updater').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.unique(['device_id', 'label']);
  });

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
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('patch_policies');
  await knex.schema.dropTableIfExists('patch_results');
  await knex.schema.dropTableIfExists('device_apps');
  await knex.schema.dropTableIfExists('manifest_catalog');
  await knex.schema.dropTableIfExists('devices');
};

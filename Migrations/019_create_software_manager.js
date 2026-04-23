exports.up = function(knex) {
  return knex.schema
    .createTable('sm_apps', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
      table.string('name').notNullable();
      table.string('publisher').nullable();
      table.string('category').nullable();
      table.string('winget_id').notNullable();
      table.string('icon_url').nullable();
      table.boolean('is_featured').notNullable().defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['org_id', 'winget_id']);
      table.index(['org_id', 'category']);
      table.index(['org_id', 'is_featured']);
    })
    .createTable('sm_installations', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
      table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
      table.string('winget_id').notNullable();
      table.string('installed_version').nullable();
      table.string('latest_version').nullable();
      table.boolean('update_available').notNullable().defaultTo(false);
      table.timestamp('last_scanned_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['org_id', 'device_id', 'winget_id']);
      table.index(['org_id', 'device_id']);
      table.index(['org_id', 'winget_id']);
      table.index(['org_id', 'update_available']);
    })
    .createTable('sm_commands', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
      table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
      table.string('winget_id').notNullable();
      table.enum('command_type', ['install', 'update', 'uninstall', 'update_all']).notNullable();
      table.enum('status', ['pending', 'running', 'success', 'failed', 'cancelled']).notNullable().defaultTo('pending');
      table.text('output').nullable();
      table.text('error_message').nullable();
      table.uuid('initiated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('completed_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.index(['org_id', 'status']);
      table.index(['org_id', 'device_id']);
      table.index(['org_id', 'winget_id']);
      table.index(['org_id', 'created_at']);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('sm_commands')
    .dropTableIfExists('sm_installations')
    .dropTableIfExists('sm_apps');
};

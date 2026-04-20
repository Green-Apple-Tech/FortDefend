exports.up = async function(knex) {
  await knex.schema.createTable('scripts', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
    table.string('name').notNullable();
    table.text('content').notNullable();
    table.jsonb('target_devices').notNullable().defaultTo('[]');
    table.string('schedule').nullable();
    table.timestamp('last_run').nullable();
    table.string('status').notNullable().defaultTo('draft');
    table.timestamps(true, true);
  });

  await knex.schema.createTable('script_executions', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('script_id').notNullable().references('id').inTable('scripts').onDelete('CASCADE');
    table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.string('status').notNullable().defaultTo('pending');
    table.integer('attempts').notNullable().defaultTo(0);
    table.text('output').nullable();
    table.text('ai_summary').nullable();
    table.text('error_message').nullable();
    table.timestamps(true, true);
  });

  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS script_executions_script_status_idx ON script_executions (script_id, status)'
  );
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS script_executions_org_status_idx ON script_executions (org_id, status)'
  );
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('script_executions');
  await knex.schema.dropTableIfExists('scripts');
};

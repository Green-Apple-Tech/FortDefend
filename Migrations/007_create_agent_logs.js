exports.up = function(knex) {
  return knex.schema.createTable('agent_logs', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
    table.string('agent_name').notNullable();
    table.string('action').notNullable();
    table.jsonb('result').nullable();
    table.uuid('device_id').nullable().references('id').inTable('devices').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('agent_logs');
};

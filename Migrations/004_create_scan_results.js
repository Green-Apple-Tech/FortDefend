exports.up = function(knex) {
  return knex.schema.createTable('scan_results', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.string('agent_name').notNullable();
    table.jsonb('result').nullable();               // raw scan data
    table.enum('status', ['pass', 'warn', 'fail']).notNullable();
    table.text('ai_summary').nullable();            // Claude's plain-English summary
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('scan_results');
};

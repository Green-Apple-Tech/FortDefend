exports.up = function(knex) {
  return knex.schema.createTable('audit_log', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('action').notNullable();           // e.g. login, logout, device_deleted
    table.string('resource').nullable();            // e.g. device:uuid
    table.string('ip_address').nullable();
    table.string('user_agent').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    // NO updated_at — audit log is immutable, records are never modified
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('audit_log');
};

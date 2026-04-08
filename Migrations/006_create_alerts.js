exports.up = function(knex) {
  return knex.schema.createTable('alerts', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
    table.uuid('device_id').nullable().references('id').inTable('devices').onDelete('SET NULL');
    table.string('type').notNullable();             // e.g. threat_detected, disk_low, patch_failed
    table.enum('severity', ['critical', 'warning', 'info']).notNullable();
    table.text('message').notNullable();
    table.text('ai_analysis').nullable();           // Claude's analysis of this alert
    table.boolean('resolved').defaultTo(false);
    table.timestamp('resolved_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('alerts');
};

exports.up = function(knex) {
  return knex.schema.createTable('patch_history', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.string('app_name').notNullable();
    table.string('version_from').nullable();
    table.string('version_to').nullable();
    table.enum('status', ['success', 'failed', 'retrying']).defaultTo('retrying');
    table.integer('attempts').defaultTo(0);
    table.text('error_message').nullable();
    table.text('ai_note').nullable();               // Claude's note on this patch
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('patch_history');
};

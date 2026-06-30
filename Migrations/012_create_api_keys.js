exports.up = function(knex) {
  return knex.schema.createTable('api_keys', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
    table.string('name').notNullable();
    table.string('key_hash').notNullable().unique();
    table.string('key_prefix', 8).notNullable();
    table.timestamp('last_used_at').nullable();
    table.timestamp('expires_at').nullable();
    table.boolean('active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('api_keys');
};

exports.up = function(knex) {
  return knex.schema.createTable('referrals', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('referrer_org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
    table.uuid('referred_org_id').nullable().references('id').inTable('orgs').onDelete('SET NULL');
    table.string('code').notNullable().unique();    // e.g. FORT-AB12
    table.timestamp('credited_at').nullable();      // when free month was applied
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('referrals');
};

exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('dynagroups');
  if (exists) return;

  await knex.schema.createTable('dynagroups', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
    table.string('name').notNullable();
    table.jsonb('rules').notNullable().defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('dynagroups', (table) => {
    table.index(['org_id']);
    table.index(['org_id', 'created_at']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('dynagroups');
};


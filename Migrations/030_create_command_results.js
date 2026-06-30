exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('command_results');
  if (exists) return;

  await knex.schema.createTable('command_results', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
    table.uuid('command_id').nullable().unique();
    table.string('command_type').notNullable();
    table.text('command_input').nullable();
    table.text('output').nullable();
    table.string('status').notNullable().defaultTo('pending');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('completed_at').nullable();
  });

  await knex.schema.alterTable('command_results', (table) => {
    table.index(['org_id', 'device_id', 'created_at']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('command_results');
};


exports.up = async function up(knex) {
  const hasScripts = await knex.schema.hasTable('scripts');
  if (!hasScripts) {
    await knex.schema.createTable('scripts', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
      table.string('name').notNullable();
      table.text('description').nullable();
      table.jsonb('platforms').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
      table.string('script_type').notNullable();
      table.text('content').notNullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('last_run_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index(['org_id', 'name']);
      table.index(['org_id', 'created_at']);
    });
  }

  const hasPayload = await knex.schema.hasColumn('sm_commands', 'command_payload');
  if (!hasPayload) {
    await knex.schema.alterTable('sm_commands', (table) => {
      table.jsonb('command_payload').nullable();
    });
  }

  await knex.raw("ALTER TYPE sm_commands_command_type_enum ADD VALUE IF NOT EXISTS 'run_script'");
};

exports.down = async function down(knex) {
  const hasPayload = await knex.schema.hasColumn('sm_commands', 'command_payload');
  if (hasPayload) {
    await knex.schema.alterTable('sm_commands', (table) => {
      table.dropColumn('command_payload');
    });
  }
  await knex.schema.dropTableIfExists('scripts');
};

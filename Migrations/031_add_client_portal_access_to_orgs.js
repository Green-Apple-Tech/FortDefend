exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('orgs', 'client_portal_access');
  if (!hasColumn) {
    await knex.schema.alterTable('orgs', (table) => {
      table.boolean('client_portal_access').notNullable().defaultTo(false);
    });
  }
};

exports.down = async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('orgs', 'client_portal_access');
  if (hasColumn) {
    await knex.schema.alterTable('orgs', (table) => {
      table.dropColumn('client_portal_access');
    });
  }
};

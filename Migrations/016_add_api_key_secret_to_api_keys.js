exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('api_keys');
  if (!hasTable) return;
  const hasColumn = await knex.schema.hasColumn('api_keys', 'key_secret_enc');
  if (!hasColumn) {
    await knex.schema.alterTable('api_keys', (table) => {
      table.text('key_secret_enc').nullable();
    });
  }
};

exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('api_keys');
  if (!hasTable) return;
  const hasColumn = await knex.schema.hasColumn('api_keys', 'key_secret_enc');
  if (hasColumn) {
    await knex.schema.alterTable('api_keys', (table) => {
      table.dropColumn('key_secret_enc');
    });
  }
};

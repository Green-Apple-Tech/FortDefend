exports.up = async (knex) => {
  await knex.schema.alterTable('devices', (table) => {
    table.unique(['org_id', 'name']);
  });
};
exports.down = async (knex) => {
  await knex.schema.alterTable('devices', (table) => {
    table.dropUnique(['org_id', 'name']);
  });
};

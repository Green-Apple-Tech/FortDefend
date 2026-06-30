const { seedDefaultScripts } = require('../src/seed/defaultScripts');

exports.config = { transaction: false };

exports.up = async function up() {
  await seedDefaultScripts();
};

exports.down = async function down(knex) {
  const hasScripts = await knex.schema.hasTable('scripts');
  if (!hasScripts) return;
  await knex('scripts').where({ name: 'Update FortDefend Agent' }).delete();
};

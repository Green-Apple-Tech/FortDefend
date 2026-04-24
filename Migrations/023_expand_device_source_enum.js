exports.up = async function up(knex) {
  await knex.raw("ALTER TYPE devices_source_enum ADD VALUE IF NOT EXISTS 'google_mobile'");
  await knex.raw("ALTER TYPE devices_source_enum ADD VALUE IF NOT EXISTS 'extension'");
};

exports.down = async function down() {
  // Postgres enums cannot reliably remove values without type recreation.
};

exports.up = async function up(knex) {
  await knex.raw(`
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'devices_source_enum') THEN
    ALTER TYPE devices_source_enum ADD VALUE IF NOT EXISTS 'google_mobile';
    ALTER TYPE devices_source_enum ADD VALUE IF NOT EXISTS 'android';
    ALTER TYPE devices_source_enum ADD VALUE IF NOT EXISTS 'ios';
    ALTER TYPE devices_source_enum ADD VALUE IF NOT EXISTS 'extension';
  END IF;
END $$;
  `);
};

exports.down = async function down() {
  // Postgres enums cannot reliably remove values without type recreation.
};

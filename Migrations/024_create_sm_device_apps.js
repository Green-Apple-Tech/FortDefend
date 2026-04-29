exports.up = async function up(knex) {
  const has = await knex.schema.hasTable('sm_device_apps');
  if (has) return;
  await knex.schema.createTable('sm_device_apps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
    table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
    table.string('app_name').notNullable();
    table.string('winget_id').nullable();
    table.string('installed_version').nullable();
    table.string('latest_version').nullable();
    table.boolean('update_available').notNullable().defaultTo(false);
    table.uuid('catalogue_app_id').nullable().references('id').inTable('sm_apps').onDelete('SET NULL');
    table.timestamp('last_scanned_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.unique(['org_id', 'device_id', 'winget_id']);
    table.index(['org_id', 'device_id']);
    table.index(['org_id', 'winget_id']);
    table.index(['org_id', 'update_available']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('sm_device_apps');
};

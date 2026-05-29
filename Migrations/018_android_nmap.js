exports.up = async (knex) => {
  // Shadow devices table for Nmap results
  const hasShadow = await knex.schema.hasTable('shadow_devices');
  if (!hasShadow) {
    await knex.schema.createTable('shadow_devices', (t) => {
      t.increments('id').primary();
      t.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
      t.string('ip_address').notNullable();
      t.string('mac_address').nullable();
      t.string('vendor').nullable();
      t.string('hostname').nullable();
      t.boolean('is_android_likely').defaultTo(false);
      t.boolean('is_chromebook_likely').defaultTo(false);
      t.timestamp('first_seen').defaultTo(knex.fn.now());
      t.timestamp('last_seen').defaultTo(knex.fn.now());
      t.boolean('resolved').defaultTo(false);
      t.unique(['org_id', 'ip_address']);
    });
  }

  // Add ip_address and mac_address to devices table if not present
  const hasIp = await knex.schema.hasColumn('devices', 'ip_address');
  if (!hasIp) {
    await knex.schema.alterTable('devices', (t) => {
      t.string('ip_address').nullable();
      t.string('mac_address').nullable();
    });
  }
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('shadow_devices');
  await knex.schema.alterTable('devices', (t) => {
    t.dropColumn('ip_address');
    t.dropColumn('mac_address');
  });
};

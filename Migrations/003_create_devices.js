exports.up = function(knex) {
  return knex.schema.createTable('devices', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
    table.string('name').notNullable();
    table.string('serial').nullable();
    table.string('os').nullable();                  // windows, chromeos, android
    table.string('os_version').nullable();
    table.enum('source', ['intune', 'google_admin', 'agent', 'android']).notNullable();
    table.string('external_id').nullable();         // ID from Intune or Google Admin
    table.timestamp('last_seen').nullable();
    table.enum('status', ['online', 'offline', 'warning', 'alert']).defaultTo('offline');
    table.integer('security_score').nullable();     // 0-100
    table.string('compliance_state').nullable();
    table.decimal('disk_free_gb', 8, 2).nullable();
    table.decimal('ram_total_gb', 8, 2).nullable();
    table.decimal('cpu_usage_pct', 5, 2).nullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('devices');
};

exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
    table.string('email').notNullable().unique();
    table.string('password_hash').notNullable();
    table.enum('role', ['admin', 'viewer']).defaultTo('admin');
    table.boolean('email_verified').defaultTo(false);
    table.string('email_verify_token').nullable();
    table.text('totp_secret_enc').nullable();       // AES-256-GCM encrypted
    table.boolean('totp_enabled').defaultTo(false);
    table.jsonb('backup_codes_hash').nullable();    // array of bcrypt hashes
    table.timestamp('last_login_at').nullable();
    table.string('last_login_ip').nullable();
    table.integer('failed_login_attempts').defaultTo(0);
    table.timestamp('locked_until').nullable();
    table.string('password_reset_token').nullable();
    table.timestamp('password_reset_expires').nullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};

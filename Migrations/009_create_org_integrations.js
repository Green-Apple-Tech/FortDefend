exports.up = function(knex) {
  return knex.schema.createTable('org_integrations', function(table) {
    table.uuid('org_id').primary().references('id').inTable('orgs').onDelete('CASCADE');
    // Intune
    table.boolean('intune_enabled').defaultTo(false);
    table.string('intune_tenant_id').nullable();
    table.string('intune_client_id').nullable();
    table.text('intune_client_secret_enc').nullable();   // AES-256-GCM encrypted
    // Google Admin
    table.boolean('google_enabled').defaultTo(false);
    table.string('google_admin_email').nullable();
    table.string('google_customer_id').nullable();
    table.text('google_service_account_enc').nullable(); // AES-256-GCM encrypted JSON
    // Notifications
    table.string('slack_webhook_url').nullable();
    table.string('teams_webhook_url').nullable();
    table.boolean('email_alerts_enabled').defaultTo(true);
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('org_integrations');
};

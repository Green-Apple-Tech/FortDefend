exports.up = function(knex) {
  return knex.schema.createTable('orgs', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();

    // Account type: individual/business = direct customer, msp = managed service provider
    table.enum('type', ['individual', 'business', 'msp']).defaultTo('business');

    // If this org is a CLIENT managed by an MSP, this points to the MSP's org
    // If null, this org manages itself directly
    table.uuid('msp_org_id').nullable().references('id').inTable('orgs').onDelete('SET NULL');

    // Plan — individual/business plans OR msp plans
    table.enum('plan', [
      // Individual / Business plans
      'personal',
      'starter',
      'growth',
      'scale',
      // MSP plans
      'msp_starter',
      'msp_growth',
      'msp_scale',
    ]).nullable();

    // Device and client limits
    table.integer('device_limit').defaultTo(5);
    table.integer('client_limit').defaultTo(0); // 0 = not an MSP, MSPs get 10/50/unlimited

    // Stripe
    table.string('stripe_customer_id').nullable();
    table.string('stripe_subscription_id').nullable();
    table.string('subscription_status').nullable(); // active, past_due, canceled, trialing

    // White-label settings (MSP feature)
    table.string('white_label_name').nullable();     // MSP's brand name for reports
    table.string('white_label_logo_url').nullable(); // logo URL for PDF reports

    table.timestamp('trial_ends_at').nullable();
    table.timestamps(true, true); // created_at, updated_at
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('orgs');
};

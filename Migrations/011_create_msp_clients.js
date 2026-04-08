// This table tracks the relationship between MSP orgs and their client orgs.
// When an MSP creates a new client, a row is added here AND a new org is created
// with msp_org_id pointing back to the MSP.

exports.up = function(knex) {
  return knex.schema.createTable('msp_clients', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // The MSP who owns this client
    table.uuid('msp_org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');

    // The client org itself
    table.uuid('client_org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');

    // Client details set by the MSP
    table.string('client_name').notNullable();
    table.string('client_contact_email').nullable();
    table.string('client_contact_name').nullable();
    table.string('notes').nullable();          // MSP internal notes about this client

    // Status
    table.enum('status', ['active', 'suspended', 'offboarded']).defaultTo('active');

    table.timestamps(true, true);

    // An MSP can't add the same client org twice
    table.unique(['msp_org_id', 'client_org_id']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('msp_clients');
};

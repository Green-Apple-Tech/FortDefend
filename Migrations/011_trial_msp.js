exports.up = async (knex) => {
  await knex.schema.alterTable('orgs', (t) => {
    t.uuid('msp_parent_org_id').nullable()
      .references('id').inTable('orgs').onDelete('SET NULL');
    t.boolean('is_test_client').defaultTo(false);
    t.boolean('is_msp').defaultTo(false);
    t.string('referral_code').nullable();
    t.timestamp('trial_started_at').nullable();
    t.boolean('trial_reminder_7_sent').defaultTo(false);
    t.boolean('trial_reminder_9_sent').defaultTo(false);
    t.timestamp('grace_ends_at').nullable();
    t.boolean('is_read_only').defaultTo(false);
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('orgs', (t) => {
    t.dropColumn('msp_parent_org_id');
    t.dropColumn('is_test_client');
    t.dropColumn('is_msp');
    t.dropColumn('referral_code');
    t.dropColumn('trial_started_at');
    t.dropColumn('trial_reminder_7_sent');
    t.dropColumn('trial_reminder_9_sent');
    t.dropColumn('grace_ends_at');
    t.dropColumn('is_read_only');
  });
};

exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('reboot_policies');
  if (exists) return;
  await knex.schema.createTable('reboot_policies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
    table.string('name').notNullable();
    table.enum('policy_type', ['forced', 'deferred', 'scheduled', 'notify-only']).notNullable().defaultTo('notify-only');
    table.string('schedule').nullable();
    table.integer('defer_max_days').nullable();
    table.integer('defer_max_times').nullable();
    table.integer('notify_before_minutes').nullable();
    table.text('notify_message').nullable();
    table.string('active_hours_start').nullable();
    table.string('active_hours_end').nullable();
    table.boolean('exclude_weekends').notNullable().defaultTo(false);
    table.jsonb('target_devices').nullable();
    table.timestamps(true, true);
  });
};

exports.down = async function down(knex) {
  const exists = await knex.schema.hasTable('reboot_policies');
  if (exists) await knex.schema.dropTable('reboot_policies');
};

exports.up = async (knex) => {
  await knex.schema.alterTable('devices', (table) => {
    table.float('mem_used_gb').nullable();
    table.float('mem_total_gb').nullable();
    table.float('ram_usage_pct').nullable();
    table.float('disk_usage_pct').nullable();
    table.float('disk_free_pct').nullable();
    table.float('cpu_usage_pct').nullable();
    table.string('cpu_model').nullable();
    table.float('battery_level').nullable();
    table.string('battery_status').nullable();
    table.string('battery_health').nullable();
    table.boolean('on_ac_power').nullable();
    table.boolean('active_user_session').nullable();
    table.integer('idle_time_minutes').nullable();
    table.boolean('unsaved_word_docs').nullable();
    table.boolean('unsaved_excel_docs').nullable();
    table.integer('open_browser_count').nullable();
    table.boolean('any_unsaved_changes').nullable();
    table.integer('active_network_connections').nullable();
    table.boolean('reboot_required').nullable();
    table.string('reboot_required_reason').nullable();
    table.boolean('pending_update').nullable();
    table.string('logged_in_user').nullable();
    table.string('ip_address').nullable();
    table.boolean('os_outdated').nullable();
    table.boolean('security_agent_running').nullable();
    table.timestamp('high_cpu_since').nullable();
    table.timestamp('high_ram_since').nullable();
  });
};

exports.down = async (knex) => {};


exports.up = async function up(knex) {
  const hasCpu = await knex.schema.hasColumn('devices', 'cpu_usage_pct');
  const hasMemUsed = await knex.schema.hasColumn('devices', 'mem_used_gb');
  const hasMemTotal = await knex.schema.hasColumn('devices', 'mem_total_gb');

  if (!hasCpu || !hasMemUsed || !hasMemTotal) {
    await knex.schema.alterTable('devices', (table) => {
      if (!hasCpu) table.decimal('cpu_usage_pct', 6, 2).nullable();
      if (!hasMemUsed) table.decimal('mem_used_gb', 10, 2).nullable();
      if (!hasMemTotal) table.decimal('mem_total_gb', 10, 2).nullable();
    });
  }
};

exports.down = async function down(knex) {
  const hasCpu = await knex.schema.hasColumn('devices', 'cpu_usage_pct');
  const hasMemUsed = await knex.schema.hasColumn('devices', 'mem_used_gb');
  const hasMemTotal = await knex.schema.hasColumn('devices', 'mem_total_gb');

  if (hasCpu || hasMemUsed || hasMemTotal) {
    await knex.schema.alterTable('devices', (table) => {
      if (hasCpu) table.dropColumn('cpu_usage_pct');
      if (hasMemUsed) table.dropColumn('mem_used_gb');
      if (hasMemTotal) table.dropColumn('mem_total_gb');
    });
  }
};


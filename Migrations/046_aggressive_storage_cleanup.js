exports.config = { transaction: false };

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('scan_results')) {
    await knex('scan_results')
      .whereRaw("result IS NULL OR result->>'mode' IS NULL")
      .delete();
    await knex('scan_results')
      .whereRaw("result->>'mode' = ?", ['delta'])
      .where('created_at', '<', knex.raw("NOW() - INTERVAL '1 day'"))
      .delete();
    await knex.raw(`
      DELETE FROM scan_results sr
      USING (
        SELECT id
        FROM (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) AS rn
          FROM scan_results
        ) ranked
        WHERE rn > 7
      ) old
      WHERE sr.id = old.id
    `);
  }

  if (await knex.schema.hasTable('sm_device_apps')) {
    const hasColumn = await knex.schema.hasColumn('sm_device_apps', 'malware_report_json');
    if (hasColumn) {
      await knex('sm_device_apps').whereNotNull('malware_report_json').update({ malware_report_json: null });
    }
  }

  if (await knex.schema.hasTable('agent_logs')) {
    await knex('agent_logs').where('created_at', '<', knex.raw("NOW() - INTERVAL '7 days'")).delete();
  }
  if (await knex.schema.hasTable('command_results')) {
    await knex('command_results').where('created_at', '<', knex.raw("NOW() - INTERVAL '7 days'")).delete();
  }
  if (await knex.schema.hasTable('sm_commands')) {
    await knex('sm_commands')
      .whereIn('status', ['success', 'failed', 'cancelled'])
      .where('created_at', '<', knex.raw("NOW() - INTERVAL '7 days'"))
      .delete();
    await knex('sm_commands')
      .whereIn('status', ['success', 'failed', 'cancelled'])
      .whereNotNull('output')
      .update({ output: null });
  }
  if (await knex.schema.hasTable('alerts')) {
    const hasResolved = await knex.schema.hasColumn('alerts', 'resolved');
    if (hasResolved) {
      await knex('alerts')
        .where({ resolved: true })
        .where('created_at', '<', knex.raw("NOW() - INTERVAL '30 days'"))
        .delete();
    }
  }

  try {
    await knex.raw('VACUUM FULL ANALYZE scan_results');
    await knex.raw('VACUUM ANALYZE sm_device_apps');
    await knex.raw('VACUUM ANALYZE sm_commands');
  } catch {
    try {
      await knex.raw('VACUUM ANALYZE scan_results');
    } catch {
      // Managed Postgres roles may not allow VACUUM FULL.
    }
  }
};

exports.down = async function down() {
  // Irreversible storage cleanup.
};

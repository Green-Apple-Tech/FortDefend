exports.config = { transaction: false };

exports.up = async function up(knex) {
  const cutoff = knex.raw("NOW() - INTERVAL '3 days'");

  if (await knex.schema.hasTable('scan_results')) {
    await knex('scan_results').where('created_at', '<', cutoff).delete();
  }
  if (await knex.schema.hasTable('agent_logs')) {
    await knex('agent_logs').where('created_at', '<', knex.raw("NOW() - INTERVAL '14 days'")).delete();
  }
  if (await knex.schema.hasTable('sm_commands')) {
    await knex('sm_commands')
      .whereIn('status', ['success', 'failed', 'cancelled'])
      .where('created_at', '<', knex.raw("NOW() - INTERVAL '14 days'"))
      .delete();
  }
  if (await knex.schema.hasTable('command_results')) {
    await knex('command_results').where('created_at', '<', knex.raw("NOW() - INTERVAL '14 days'")).delete();
  }
  if (await knex.schema.hasTable('patch_results')) {
    await knex('patch_results').where('timestamp', '<', knex.raw("NOW() - INTERVAL '30 days'")).delete();
  }

  if (await knex.schema.hasTable('scan_results')) {
    await knex.raw(`
      DELETE FROM scan_results sr
      USING (
        SELECT id
        FROM (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) AS rn
          FROM scan_results
        ) ranked
        WHERE rn > 3
      ) old
      WHERE sr.id = old.id
    `);
  }

  try {
    await knex.raw('VACUUM ANALYZE scan_results');
    await knex.raw('VACUUM ANALYZE agent_logs');
    await knex.raw('VACUUM ANALYZE sm_commands');
    await knex.raw('VACUUM ANALYZE command_results');
  } catch {
    // VACUUM may be unavailable in some managed DB roles.
  }
};

exports.down = async function down() {
  // Data retention cleanup is intentionally irreversible.
};

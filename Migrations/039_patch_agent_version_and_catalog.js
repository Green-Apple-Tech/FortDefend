exports.up = async function up(knex) {
  const hasPatchVersion = await knex.schema.hasColumn('devices', 'patch_agent_version');
  if (!hasPatchVersion) {
    await knex.schema.alterTable('devices', (table) => {
      table.string('patch_agent_version').nullable();
    });
  }

  const hasCatalog = await knex.schema.hasTable('manifest_catalog');
  if (hasCatalog) {
    const hasLatest = await knex.schema.hasColumn('manifest_catalog', 'latest_version');
    if (!hasLatest) {
      await knex.schema.alterTable('manifest_catalog', (table) => {
        table.string('latest_version').nullable();
        table.timestamp('last_checked').nullable();
      });
    }
  }
};

exports.down = async function down(knex) {
  const hasPatchVersion = await knex.schema.hasColumn('devices', 'patch_agent_version');
  if (hasPatchVersion) {
    await knex.schema.alterTable('devices', (table) => {
      table.dropColumn('patch_agent_version');
    });
  }
  if (await knex.schema.hasTable('manifest_catalog')) {
    const hasLatest = await knex.schema.hasColumn('manifest_catalog', 'latest_version');
    if (hasLatest) {
      await knex.schema.alterTable('manifest_catalog', (table) => {
        table.dropColumn('latest_version');
        table.dropColumn('last_checked');
      });
    }
  }
};

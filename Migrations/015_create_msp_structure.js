exports.up = async function up(knex) {
  const hasMspClients = await knex.schema.hasTable('msp_clients');
  if (!hasMspClients) {
    await knex.schema.createTable('msp_clients', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('msp_org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
      table.uuid('client_org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['msp_org_id', 'client_org_id']);
    });
  }

  const hasOrgType = await knex.schema.hasColumn('orgs', 'org_type');
  if (!hasOrgType) {
    await knex.schema.alterTable('orgs', (table) => {
      table.enum('org_type', ['msp', 'client', 'direct']).notNullable().defaultTo('direct');
    });

    await knex('orgs')
      .where('type', 'msp')
      .update({ org_type: 'msp' });
    await knex('orgs')
      .whereNotNull('msp_org_id')
      .andWhereNot('type', 'msp')
      .update({ org_type: 'client' });
  }

  const enumType = await knex('pg_type').where('typname', 'users_role').first();
  if (enumType) {
    await knex.raw(`
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'users_role') THEN
    ALTER TYPE users_role ADD VALUE IF NOT EXISTS 'msp';
  END IF;
END $$;
    `);
  } else {
    const hasRole = await knex.schema.hasColumn('users', 'role');
    if (hasRole) {
      await knex.raw("ALTER TABLE users ALTER COLUMN role TYPE text");
      await knex.raw("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
      await knex.raw("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','viewer','msp'))");
    }
  }
};

exports.down = async function down(knex) {
  const hasOrgType = await knex.schema.hasColumn('orgs', 'org_type');
  if (hasOrgType) {
    await knex.schema.alterTable('orgs', (table) => {
      table.dropColumn('org_type');
    });
  }
};

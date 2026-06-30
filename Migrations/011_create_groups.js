exports.up = function (knex) {
    return knex.schema
      .createTable('groups', function (table) {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('org_id').notNullable().references('id').inTable('orgs').onDelete('CASCADE');
        table.uuid('parent_id').nullable().references('id').inTable('groups').onDelete('CASCADE');
        table.string('name', 255).notNullable();
        table.text('description').nullable();
        table.integer('sort_order').defaultTo(0);
        table.timestamps(true, true);
      })
      .createTable('device_groups', function (table) {
        table.uuid('device_id').notNullable().references('id').inTable('devices').onDelete('CASCADE');
        table.uuid('group_id').notNullable().references('id').inTable('groups').onDelete('CASCADE');
        table.primary(['device_id', 'group_id']);
      });
  };
  
  exports.down = function (knex) {
    return knex.schema
      .dropTableIfExists('device_groups')
      .dropTableIfExists('groups');
  };
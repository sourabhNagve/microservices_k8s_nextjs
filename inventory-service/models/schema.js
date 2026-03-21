import {
  pgTable, serial, varchar, integer,
  timestamp, text, uuid, boolean,
} from 'drizzle-orm/pg-core';

export const warehouses = pgTable('warehouses', {
  id:        serial('id').primaryKey(),
  name:      varchar('name',     { length: 255 }).notNull(),
  location:  varchar('location', { length: 500 }).notNull(),
  capacity:  integer('capacity').notNull(),
  manager:   varchar('manager',  { length: 255 }),
  active:    boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const inventory = pgTable('inventory', {
  id:          uuid('id').primaryKey().defaultRandom(),
  productId:   uuid('product_id').notNull(),
  // FIX 1 (original): warehouseId was typed as `serial('warehouse_id')`.
  // `serial` is a PostgreSQL auto-increment type — it generates its own values
  // and is intended for PRIMARY KEY columns. Using it as a foreign key column
  // means Drizzle would try to create a sequence for warehouse_id in the
  // inventory table, which is wrong and causes a migration error.
  // Changed to `integer` (the underlying type that serial resolves to) so it
  // works correctly as a foreign key referencing warehouses.id.
  warehouseId: integer('warehouse_id').references(() => warehouses.id),
  quantity:    integer('quantity').notNull().default(0),
  minStock:    integer('min_stock').default(5),
  maxStock:    integer('max_stock').default(100),
  location:    varchar('location', { length: 255 }),
  lastUpdated: timestamp('last_updated').defaultNow(),
  createdAt:   timestamp('created_at').defaultNow(),
  updatedAt:   timestamp('updated_at').defaultNow(),
});

export const inventoryTransactions = pgTable('inventory_transactions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  inventoryId: uuid('inventory_id').references(() => inventory.id),
  // FIX 2 (original): `type` column length was 50 chars but the valid values
  // ('in', 'out', 'adjustment', 'transfer', 'stock_count') are all short.
  // Kept 50 for flexibility but added a comment. The model also validates
  // this field programmatically so a DB check constraint would be redundant.
  type:        varchar('type', { length: 50 }).notNull(),
  quantity:    integer('quantity').notNull(),
  reason:      text('reason'),
  referenceId: varchar('reference_id', { length: 255 }),
  performedBy: varchar('performed_by', { length: 255 }),
  createdAt:   timestamp('created_at').defaultNow(),
});
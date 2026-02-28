import { pgTable, varchar, timestamp, text, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const sourceTypeEnum = pgEnum('source_type', ['api', 'database', 'file', 'stream']);
export const sourceStatusEnum = pgEnum('source_status', ['active', 'inactive', 'error']);

export const sources = pgTable('sources', {
  id: varchar('id', { length: 128 })
    .primaryKey()
    .$defaultFn(() => createId()),
  name: varchar('name', { length: 255 }).notNull(),
  type: sourceTypeEnum('type').notNull(),
  config: jsonb('config').notNull(),
  status: sourceStatusEnum('status').default('inactive').notNull(),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;

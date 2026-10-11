import { index, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appUsers, platformAccounts, customTimestamptz } from '@server/database/schema';

export const personalTasks = pgTable('personal_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => platformAccounts.id, { onDelete: 'set null' }),
  platform: varchar('platform', { length: 20 }).notNull(),
  requestId: uuid('request_id').notNull(),
  requestHash: varchar('request_hash', { length: 64 }).notNull(),
  kind: varchar('kind', { length: 20 }).notNull(),
  title: varchar('title', { length: 140 }).notNull(),
  content: text('content').notNull().default(''),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  dueAt: customTimestamptz('due_at'),
  note: text('note').notNull().default(''),
  completedAt: customTimestamptz('completed_at'),
  createdAt: customTimestamptz('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [
  index('idx_personal_tasks_user_due').on(table.userId, table.status, table.dueAt),
  uniqueIndex('idx_personal_tasks_request_account').on(table.userId, table.requestId, table.accountId),
]);

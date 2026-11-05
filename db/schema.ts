import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().notNull(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  plan: text('plan').notNull(),
  summary: text('summary').notNull(),
  revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
}, table => [index('projects_owner_updated').on(table.ownerId, table.updatedAt)]);

export const snapshots = sqliteTable('project_snapshots', {
  id: text('id').primaryKey().notNull(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  plan: text('plan').notNull(),
  createdAt: text('created_at').notNull(),
}, table => [index('snapshots_project_created').on(table.projectId, table.createdAt)]);

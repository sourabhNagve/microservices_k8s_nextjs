import { pgTable, serial, varchar, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }),
  googleId: varchar('google_id', { length: 255 }).unique(),
  avatar: varchar('avatar', { length: 500 }),
  preferences: jsonb('preferences').default('{}'),
  verified: boolean('verified').default(false),
  isActive: boolean('is_active').default(true),
  isAdmin: boolean('is_admin').default(false),
  lastLogin: timestamp('last_login'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

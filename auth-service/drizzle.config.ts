import type { Config } from 'drizzle-kit';

export default {
  schema: './models/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.AUTH_DATABASE_URL!,
  },
} satisfies Config;

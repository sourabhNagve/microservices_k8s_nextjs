import type { Config } from 'drizzle-kit';

export default {
  schema: './models/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.PRODUCT_DATABASE_URL!,
  },
} satisfies Config;

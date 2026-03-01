import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { config, logger } from '@kael/shared';
import * as schema from './schema/index.js';

const client = postgres(config.databaseUrl, { max: 20 });

export const db = drizzle(client, { schema, logger: config.isDev });

export async function closeDb(): Promise<void> {
  await client.end();
  logger.info('Database connection closed');
}

export async function testConnection(): Promise<boolean> {
  try {
    await client`SELECT 1`;
    logger.info('Database connected successfully');
    return true;
  } catch (error) {
    logger.error('Database connection failed', { error });
    return false;
  }
}

export * from './schema/index.js';
export * from 'drizzle-orm';

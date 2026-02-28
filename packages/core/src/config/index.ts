import { z } from 'zod';

const configSchema = z.object({
  // Database
  databaseUrl: z.string().url(),
  
  // Redis
  redisUrl: z.string().url(),
  
  // API
  apiPort: z.coerce.number().default(3001),
  apiUrl: z.string().url().default('http://localhost:3001'),
  
  // Web
  webPort: z.coerce.number().default(3000),
  nextPublicApiUrl: z.string().url().default('http://localhost:3001'),
  
  // Worker
  workerConcurrency: z.coerce.number().default(5),
  
  // Environment
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  isDev: z.boolean().default(true),
  isProd: z.boolean().default(false),
  isTest: z.boolean().default(false),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const env = process.env;
  
  const config = configSchema.parse({
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    apiPort: env.API_PORT,
    apiUrl: env.API_URL,
    webPort: env.WEB_PORT,
    nextPublicApiUrl: env.NEXT_PUBLIC_API_URL,
    workerConcurrency: env.WORKER_CONCURRENCY,
    nodeEnv: env.NODE_ENV,
    isDev: env.NODE_ENV === 'development',
    isProd: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
  });
  
  return config;
}

export const config = loadConfig();

export function validateEnv(): void {
  try {
    loadConfig();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      throw new Error(`Environment validation failed:\n${issues.join('\n')}`);
    }
    throw error;
  }
}

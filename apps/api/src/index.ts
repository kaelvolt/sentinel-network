import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { configDotenv } from 'dotenv';

import { validateEnv, logger, config } from '@kael/core';
import { testConnection as testDb, closeDb, redis } from '@kael/storage';
import { routes } from './routes/index.js';
import { errorHandler } from './plugins/error-handler.js';

configDotenv();
validateEnv();

const app = fastify({
  logger: false,
  trustProxy: true,
});

// Register plugins
await app.register(helmet);
await app.register(cors, { origin: config.isDev });
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

// Swagger documentation
await app.register(swagger, {
  swagger: {
    info: {
      title: 'Kael Platform API',
      description: 'API documentation for Kael Platform',
      version: '0.0.0',
    },
    schemes: ['http', 'https'],
    consumes: ['application/json'],
    produces: ['application/json'],
  },
});

await app.register(swaggerUi, {
  routePrefix: '/docs',
});

// Error handler
await app.register(errorHandler);

// Routes
await app.register(routes, { prefix: '/api/v1' });

// Health check
app.get('/health', async () => {
  const dbHealthy = await testDb();
  const redisHealthy = await redis.ping() === 'PONG';
  
  return {
    status: dbHealthy && redisHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy ? 'healthy' : 'unhealthy',
      redis: redisHealthy ? 'healthy' : 'unhealthy',
    },
  };
});

// Graceful shutdown
async function shutdown(): Promise<void> {
  logger.info('Shutting down gracefully...');
  await app.close();
  await closeDb();
  await redis.quit();
  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
try {
  await testDb();
  await app.listen({ port: config.apiPort, host: '0.0.0.0' });
  logger.info(`API server listening on port ${config.apiPort}`);
} catch (error) {
  logger.error('Failed to start server', { error });
  process.exit(1);
}

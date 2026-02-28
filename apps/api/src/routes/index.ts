import type { FastifyInstance } from 'fastify';
import { jobsRoutes } from './jobs.js';
import { sourcesRoutes } from './sources.js';
import { usersRoutes } from './users.js';

export async function routes(app: FastifyInstance): Promise<void> {
  await app.register(jobsRoutes, { prefix: '/jobs' });
  await app.register(sourcesRoutes, { prefix: '/sources' });
  await app.register(usersRoutes, { prefix: '/users' });
}

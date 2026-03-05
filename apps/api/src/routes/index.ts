import type { FastifyInstance } from 'fastify';
import { sourcesRoutes } from './sources.js';
import digestRoutes from './digests.js';
import ingestRoutes from './ingest.js';

export async function routes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  app.get('/dashboard/stats', async () => ({
    ok: true,
    data: {
      totalSignals: 0,
      activeSignals: 0,
      criticalSignals: 0,
      totalSources: 0,
      totalDigests: 0,
      lastIngestAt: null,
    },
  }));

  app.get('/signals', async (request) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));

    // TODO: Wire to Prisma once storage layer is connected
    return { ok: true, data: [], total: 0, page, limit };
  });

  app.get('/signals/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!id) return reply.status(400).send({ ok: false, error: 'Missing ID' });
    // TODO: Wire to Prisma
    return reply.status(404).send({ ok: false, error: 'Signal not found' });
  });

  await app.register(sourcesRoutes, { prefix: '/sources' });
  await app.register(digestRoutes);
  await app.register(ingestRoutes);
}

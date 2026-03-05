import type { FastifyInstance } from 'fastify';
import { db } from '@your-org/storage'; // Adjust the import based on your actual storage package path
import { z } from 'zod';
import { Signal, SignalSummary } from '@your-org/shared'; // Adjust the import based on your actual shared types

export async function routes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  app.get('/dashboard/stats', async () => {
    const totalSignals = await db.signal.count();
    const activeSignals = await db.signal.count({ where: { status: 'active' } });
    const criticalSignals = await db.signal.count({ where: { severity: 5 } });
    const totalSources = await db.source.count();
    const totalDigests = await db.digest.count();
    const lastIngestAt = await db.digest.findFirst({ orderBy: { published: 'desc' } });

    return {
      ok: true,
      data: {
        totalSignals,
        activeSignals,
        criticalSignals,
        totalSources,
        totalDigests,
        lastIngestAt: lastIngestAt ? lastIngestAt.published : null,
      },
    };
  });

  app.get('/signals', async (request) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));

    const signals = await db.signal.findMany({
      skip: (page - 1) * limit,
      take: limit,
    });
    const total = await db.signal.count();

    return { ok: true, data: signals, total, page, limit };
  });

  app.get('/signals/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!id) return reply.status(400).send({ ok: false, error: 'Missing ID' });

    const signal = await db.signal.findUnique({ where: { id } });
    if (!signal) return reply.status(404).send({ ok: false, error: 'Signal not found' });

    return { ok: true, data: signal };
  });

  await app.register(sourcesRoutes, { prefix: '/sources' });
  await app.register(digestRoutes);
  await app.register(ingestRoutes);
}
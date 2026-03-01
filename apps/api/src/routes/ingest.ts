import type { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '@kael/storage';
import { NotFoundError } from '@kael/core';
import { logger } from '@kael/core';

// Validation schemas
const runIngestBodySchema = z.object({
  sourceId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export async function ingestRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // POST /ingest/run
  app.post('/run', async (request: FastifyRequest<{ Body: { sourceId?: string; limit: number } }>) => {
    const body = runIngestBodySchema.parse(request.body);
    const { sourceId, limit } = body;

    // If sourceId provided, verify it exists and is enabled
    if (sourceId) {
      const source = await db.source.findUnique({
        where: { id: sourceId },
      });

      if (!source) {
        throw new NotFoundError('Source', sourceId);
      }

      if (!source.enabled) {
        return {
          ok: false,
          error: {
            code: 'SOURCE_DISABLED',
            message: `Source ${sourceId} is disabled`,
          },
          meta: {},
        };
      }
    }

    // Get enabled sources to ingest from
    const sources = sourceId
      ? await db.source.findMany({ where: { id: sourceId, enabled: true } })
      : await db.source.findMany({ where: { enabled: true } });

    if (sources.length === 0) {
      return {
        ok: true,
        data: {
          message: 'No enabled sources to ingest from',
          processed: 0,
          sources: 0,
        },
        meta: {},
      };
    }

    // TODO: Implement actual ingestion logic
    // For now, return a placeholder response
    logger.info(`Ingest run started`, { sourceCount: sources.length, limit });

    return {
      ok: true,
      data: {
        message: 'Ingest job queued',
        sources: sources.length,
        sourceIds: sources.map(s => s.id),
        limit,
        queuedAt: new Date().toISOString(),
      },
      meta: {},
    };
  });

  // GET /ingest/status
  app.get('/status', async () => {
    // Get ingestion statistics
    const totalSources = await db.source.count();
    const enabledSources = await db.source.count({ where: { enabled: true } });
    const totalRawItems = await db.rawItem.count();
    const recentRawItems = await db.rawItem.count({
      where: {
        fetchedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });

    return {
      ok: true,
      data: {
        sources: {
          total: totalSources,
          enabled: enabledSources,
          disabled: totalSources - enabledSources,
        },
        rawItems: {
          total: totalRawItems,
          last24h: recentRawItems,
        },
        timestamp: new Date().toISOString(),
      },
      meta: {},
    };
  });
}
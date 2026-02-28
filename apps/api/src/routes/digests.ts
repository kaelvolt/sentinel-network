import type { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getLatestDigest, getDigestHistory, generateAndStoreDigest } from '@kael/core';
import { NotFoundError } from '@kael/core';

// Validation schemas
const getHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const generateBodySchema = z.object({
  hoursBack: z.coerce.number().int().min(1).max(168).default(24),
});

export async function digestsRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // GET /digests/latest
  app.get('/latest', async () => {
    const digest = await getLatestDigest();
    
    if (!digest) {
      throw new NotFoundError('Digest', 'latest');
    }
    
    return {
      ok: true,
      data: {
        ...digest,
        createdAt: digest.createdAt.toISOString(),
      },
      meta: {},
    };
  });

  // GET /digests/history?limit=
  app.get('/history', async (request: FastifyRequest<{ Querystring: unknown }>) => {
    const query = getHistoryQuerySchema.parse(request.query);
    
    const history = await getDigestHistory(query.limit);
    
    return {
      ok: true,
      data: history.map(d => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      })),
      meta: {
        limit: query.limit,
        count: history.length,
      },
    };
  });

  // GET /digests/:id
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>) => {
    const { prisma } = await import('@kael/storage');
    const { id } = request.params;
    
    const digest = await prisma.digest.findUnique({
      where: { id },
    });
    
    if (!digest) {
      throw new NotFoundError('Digest', id);
    }
    
    return {
      ok: true,
      data: {
        ...digest,
        periodStart: digest.periodStart.toISOString(),
        periodEnd: digest.periodEnd.toISOString(),
        createdAt: digest.createdAt.toISOString(),
        updatedAt: digest.updatedAt.toISOString(),
        publishedAt: digest.publishedAt?.toISOString() || null,
      },
      meta: {},
    };
  });

  // POST /digests/generate (manual trigger)
  app.post('/generate', async (request: FastifyRequest<{ Body: unknown }>) => {
    const body = generateBodySchema.parse(request.body);
    
    const result = await generateAndStoreDigest(body.hoursBack);
    
    return {
      ok: true,
      data: {
        digestId: result.digestId,
        signalCount: result.signalCount,
        generatedAt: new Date().toISOString(),
      },
      meta: {},
    };
  });
}

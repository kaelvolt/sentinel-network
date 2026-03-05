import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@sentinel/storage';

const DigestQuerySchema = z.object({
  page: z.number().optional().default(1),
  limit: z.number().optional().default(10),
});

export default async function digestRoutes(fastify: FastifyInstance) {
  fastify.get('/digests', async (request, reply) => {
    const { page, limit } = DigestQuerySchema.parse(request.query);
    
    try {
      const digests = await db.digest.findMany({
        skip: (page - 1) * limit,
        take: limit,
      });
      const total = await db.digest.count();

      return {
        ok: true,
        data: digests,
        total,
        page,
        limit,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        ok: false,
        error: 'Internal Server Error',
      });
    }
  });

  fastify.get('/digests/latest', async (_request, reply) => {
    try {
      const latestDigest = await db.digest.findFirst({
        orderBy: { published: 'desc' },
      });

      if (!latestDigest) {
        return reply.status(404).send({
          ok: false,
          error: 'No digests published yet',
        });
      }

      return {
        ok: true,
        data: latestDigest,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        ok: false,
        error: 'Internal Server Error',
      });
    }
  });
}
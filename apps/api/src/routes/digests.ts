import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@sentinel/storage';

const DigestQuerySchema = z.object({
  page: z.number().optional().default(1),
  limit: z.number().optional().default(10),
});

const DigestIdSchema = z.object({
  id: z.string().uuid(),
});

export default async function digestRoutes(fastify: FastifyInstance) {
  fastify.get('/digests', async (request, reply) => {
    const { page, limit } = DigestQuerySchema.parse(request.query);
    
    try {
      const [digests, total] = await Promise.all([
        prisma.digest.findMany({
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.digest.count(),
      ]);

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
      const latestDigest = await prisma.digest.findFirst({
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

  fastify.get('/digests/:id', async (request, reply) => {
    const { id } = DigestIdSchema.parse(request.params);

    try {
      const digest = await prisma.digest.findUnique({
        where: { id },
      });

      if (!digest) {
        return reply.status(404).send({
          ok: false,
          error: 'Digest not found',
        });
      }

      return {
        ok: true,
        data: digest,
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
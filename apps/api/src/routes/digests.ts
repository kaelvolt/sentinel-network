import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@sentinel/storage';
import type { Digest } from '@sentinel/shared';

const DigestQuerySchema = z.object({
  page: z.number().optional().default(1),
  limit: z.number().optional().default(10),
});

const DigestIdSchema = z.object({
  id: z.string().uuid(),
});

const DigestSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  content: z.string(),
  signalIds: z.array(z.string()),
  signalCount: z.number(),
  kaelNotes: z.string(),
  published: z.date(),
  periodStart: z.date(),
  periodEnd: z.date(),
});

const CreateDigestSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  content: z.string(),
  signalIds: z.array(z.string()).nonempty(),
  kaelNotes: z.string().optional(),
  published: z.date().optional(),
  periodStart: z.date(),
  periodEnd: z.date(),
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
        data: DigestSchema.parse(digest),
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        ok: false,
        error: 'Internal Server Error',
      });
    }
  });

  fastify.post('/digests', async (request, reply) => {
    const result = CreateDigestSchema.safeParse(request.body);
    
    if (!result.success) {
      return reply.status(400).send({
        ok: false,
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }

    try {
      const newDigest = await prisma.digest.create({
        data: {
          title: result.data.title,
          summary: result.data.summary,
          content: result.data.content,
          signalIds: result.data.signalIds,
          kaelNotes: result.data.kaelNotes || '',
          published: result.data.published || new Date(),
          periodStart: result.data.periodStart,
          periodEnd: result.data.periodEnd,
        },
      });

      return reply.status(201).send({
        ok: true,
        data: DigestSchema.parse(newDigest),
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        ok: false,
        error: 'Internal Server Error',
      });
    }
  });
}
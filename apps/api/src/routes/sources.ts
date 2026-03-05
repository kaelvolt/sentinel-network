import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '@sentinel/storage';

const CreateSourceSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(['rss', 'web', 'github', 'manual']),
  baseUrl: z.string().url(),
  reliabilityHint: z.number().min(0).max(1).default(0.5),
  meta: z.record(z.unknown()).optional(),
});

type CreateSourceBody = z.infer<typeof CreateSourceSchema>;

export async function sourcesRoutes(app: FastifyInstance) {
  app.get('/', async (request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>, reply) => {
    const page = Math.max(1, parseInt(request.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '50', 10)));

    try {
      const sources = await db.source.findMany({
        skip: (page - 1) * limit,
        take: limit,
      });
      const total = await db.source.count();

      return {
        ok: true,
        data: sources,
        total,
        page,
        limit,
      };
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({ ok: false, error: 'Internal server error' });
    }
  });

  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = request.params;

    if (!id) {
      return reply.status(400).send({ ok: false, error: 'Missing source ID' });
    }

    try {
      const source = await db.source.findUnique({ where: { id } });
      if (!source) {
        return reply.status(404).send({ ok: false, error: 'Source not found' });
      }
      return reply.send({ ok: true, data: source });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({ ok: false, error: 'Internal server error' });
    }
  });

  app.post('/', async (request: FastifyRequest<{ Body: CreateSourceBody }>, reply) => {
    const parsed = CreateSourceSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        ok: false,
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const source = await db.source.create({ data: parsed.data });
      return reply.status(201).send({ ok: true, data: source });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({ ok: false, error: 'Internal server error' });
    }
  });

  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = request.params;

    if (!id) {
      return reply.status(400).send({ ok: false, error: 'Missing source ID' });
    }

    try {
      const source = await db.source.delete({ where: { id } });
      return reply.send({ ok: true, data: source });
    } catch (error) {
      if (error.code === 'P2025') {
        return reply.status(404).send({ ok: false, error: 'Source not found' });
      }
      app.log.error(error);
      return reply.status(500).send({ ok: false, error: 'Internal server error' });
    }
  });
}
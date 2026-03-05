import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

const CreateSourceSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(['rss', 'web', 'github', 'manual']),
  baseUrl: z.string().url(),
  reliabilityHint: z.number().min(0).max(1).default(0.5),
  meta: z.record(z.unknown()).optional(),
});

type CreateSourceBody = z.infer<typeof CreateSourceSchema>;

export async function sourcesRoutes(app: FastifyInstance) {
  app.get('/', async (request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>) => {
    const page = Math.max(1, parseInt(request.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '50', 10)));

    // TODO: Replace with actual Prisma query once storage is wired
    return {
      ok: true,
      data: [],
      total: 0,
      page,
      limit,
    };
  });

  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = request.params;

    if (!id) {
      return reply.status(400).send({ ok: false, error: 'Missing source ID' });
    }

    // TODO: Replace with actual Prisma query
    return reply.status(404).send({ ok: false, error: 'Source not found' });
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

    // TODO: Replace with actual Prisma create
    const source = {
      id: crypto.randomUUID(),
      ...parsed.data,
      createdAt: new Date().toISOString(),
    };

    return reply.status(201).send({ ok: true, data: source });
  });

  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = request.params;

    if (!id) {
      return reply.status(400).send({ ok: false, error: 'Missing source ID' });
    }

    // TODO: Replace with actual Prisma delete
    return reply.status(404).send({ ok: false, error: 'Source not found' });
  });
}

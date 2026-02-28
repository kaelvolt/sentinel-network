import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db, sources, desc, eq } from '@kael/storage';
import { NotFoundError } from '@kael/core';

const createSourceSchema = z.object({
  name: z.string(),
  type: z.enum(['api', 'database', 'file', 'stream']),
  config: z.record(z.unknown()),
});

const updateSourceSchema = createSourceSchema.partial();

const sourceIdSchema = z.object({
  id: z.string(),
});

export async function sourcesRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // List sources
  app.get('/', async (request) => {
    const { page = 1, limit = 20, status } = request.query as {
      page?: number;
      limit?: number;
      status?: string;
    };

    const where = status ? eq(sources.status, status as typeof sources.$inferSelect.status) : undefined;

    const data = await db.query.sources.findMany({
      where,
      orderBy: desc(sources.createdAt),
      limit,
      offset: (page - 1) * limit,
    });

    return {
      success: true,
      data,
      meta: { page, limit },
    };
  });

  // Get source by ID
  app.get('/:id', async (request) => {
    const { id } = sourceIdSchema.parse(request.params);

    const source = await db.query.sources.findFirst({
      where: eq(sources.id, id),
    });

    if (!source) {
      throw new NotFoundError('Source', id);
    }

    return {
      success: true,
      data: source,
    };
  });

  // Create source
  app.post('/', async (request, reply) => {
    const input = createSourceSchema.parse(request.body);

    const [source] = await db
      .insert(sources)
      .values({
        name: input.name,
        type: input.type,
        config: input.config,
      })
      .returning();

    reply.status(201);
    return {
      success: true,
      data: source,
    };
  });

  // Update source
  app.patch('/:id', async (request) => {
    const { id } = sourceIdSchema.parse(request.params);
    const input = updateSourceSchema.parse(request.body);

    const [source] = await db
      .update(sources)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, id))
      .returning();

    if (!source) {
      throw new NotFoundError('Source', id);
    }

    return {
      success: true,
      data: source,
    };
  });

  // Delete source
  app.delete('/:id', async (request) => {
    const { id } = sourceIdSchema.parse(request.params);

    const [source] = await db.delete(sources).where(eq(sources.id, id)).returning();

    if (!source) {
      throw new NotFoundError('Source', id);
    }

    return {
      success: true,
      data: source,
    };
  });
}

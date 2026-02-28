import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db, jobs, desc, eq } from '@kael/storage';
import { NotFoundError, ValidationError } from '@kael/core';

const createJobSchema = z.object({
  type: z.string(),
  payload: z.record(z.unknown()).optional(),
  priority: z.number().default(0),
  scheduledAt: z.string().datetime().optional(),
});

const jobIdSchema = z.object({
  id: z.string(),
});

export async function jobsRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // List jobs
  app.get('/', async (request) => {
    const { page = 1, limit = 20, status } = request.query as {
      page?: number;
      limit?: number;
      status?: string;
    };

    const where = status ? eq(jobs.status, status as typeof jobs.$inferSelect.status) : undefined;
    
    const data = await db.query.jobs.findMany({
      where,
      orderBy: desc(jobs.createdAt),
      limit,
      offset: (page - 1) * limit,
    });

    return {
      success: true,
      data,
      meta: { page, limit },
    };
  });

  // Get job by ID
  app.get('/:id', async (request) => {
    const { id } = jobIdSchema.parse(request.params);
    
    const job = await db.query.jobs.findFirst({
      where: eq(jobs.id, id),
    });

    if (!job) {
      throw new NotFoundError('Job', id);
    }

    return {
      success: true,
      data: job,
    };
  });

  // Create job
  app.post('/', async (request, reply) => {
    const input = createJobSchema.parse(request.body);
    
    const [job] = await db
      .insert(jobs)
      .values({
        type: input.type,
        payload: input.payload ?? {},
        priority: input.priority,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      })
      .returning();

    reply.status(201);
    return {
      success: true,
      data: job,
    };
  });

  // Delete job
  app.delete('/:id', async (request) => {
    const { id } = jobIdSchema.parse(request.params);
    
    const [job] = await db.delete(jobs).where(eq(jobs.id, id)).returning();

    if (!job) {
      throw new NotFoundError('Job', id);
    }

    return {
      success: true,
      data: job,
    };
  });
}

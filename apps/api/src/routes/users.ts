import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db, users, desc, eq } from '@kael/storage';
import { NotFoundError } from '@kael/core';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['admin', 'user', 'viewer']).optional(),
});

const updateUserSchema = createUserSchema.partial();

const userIdSchema = z.object({
  id: z.string(),
});

export async function usersRoutes(
  app: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // List users
  app.get('/', async (request) => {
    const { page = 1, limit = 20 } = request.query as {
      page?: number;
      limit?: number;
    };

    const data = await db.query.users.findMany({
      orderBy: desc(users.createdAt),
      limit,
      offset: (page - 1) * limit,
    });

    return {
      success: true,
      data,
      meta: { page, limit },
    };
  });

  // Get user by ID
  app.get('/:id', async (request) => {
    const { id } = userIdSchema.parse(request.params);

    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!user) {
      throw new NotFoundError('User', id);
    }

    return {
      success: true,
      data: user,
    };
  });

  // Create user
  app.post('/', async (request, reply) => {
    const input = createUserSchema.parse(request.body);

    const [user] = await db
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        role: input.role ?? 'user',
      })
      .returning();

    reply.status(201);
    return {
      success: true,
      data: user,
    };
  });

  // Update user
  app.patch('/:id', async (request) => {
    const { id } = userIdSchema.parse(request.params);
    const input = updateUserSchema.parse(request.body);

    const [user] = await db
      .update(users)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    if (!user) {
      throw new NotFoundError('User', id);
    }

    return {
      success: true,
      data: user,
    };
  });

  // Delete user
  app.delete('/:id', async (request) => {
    const { id } = userIdSchema.parse(request.params);

    const [user] = await db.delete(users).where(eq(users.id, id)).returning();

    if (!user) {
      throw new NotFoundError('User', id);
    }

    return {
      success: true,
      data: user,
    };
  });
}

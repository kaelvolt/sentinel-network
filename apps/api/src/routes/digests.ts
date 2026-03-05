import type { FastifyInstance } from 'fastify';

export default async function digestRoutes(fastify: FastifyInstance) {
  fastify.get('/digests', async (request) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '10', 10)));

    // TODO: Wire to Prisma once storage layer is connected
    return {
      ok: true,
      data: [],
      total: 0,
      page,
      limit,
    };
  });

  fastify.get('/digests/latest', async (_request, reply) => {
    // TODO: Wire to Prisma
    return reply.status(404).send({
      ok: false,
      error: 'No digests published yet',
    });
  });
}

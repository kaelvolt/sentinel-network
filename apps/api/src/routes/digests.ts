import type { FastifyInstance } from "fastify";

const digestRoutes = async (fastify: FastifyInstance) => {
  fastify.get("/digests/latest", async (_request, _reply) => {
    return {
      ok: true,
      data: {
        title: "Daily Digest",
        generatedAt: new Date().toISOString(),
      },
      meta: { source: "sentinel-network" },
    };
  });
};

export default digestRoutes;

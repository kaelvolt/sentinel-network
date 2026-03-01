import type { FastifyInstance } from "fastify";

const ingestRoutes = async (fastify: FastifyInstance) => {
  fastify.post("/ingest/run", async (_request, _reply) => {
    return {
      ok: true,
      data: { triggered: true, mode: "manual" },
      meta: { at: new Date().toISOString() },
    };
  });
};

export default ingestRoutes;

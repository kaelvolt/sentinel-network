import type { FastifyInstance } from "fastify";
import { getLatestDigest } from "../services/digestService";

const digestRoutes = async (fastify: FastifyInstance) => {
  fastify.get("/digests/latest", async (_request, _reply) => {
    try {
      const latestDigest = await getLatestDigest();
      return {
        ok: true,
        data: latestDigest,
        meta: { source: "sentinel-network" },
      };
    } catch (error) {
      _reply.status(500).send({
        ok: false,
        error: "Failed to fetch latest digest",
      });
    }
  });
};

export default digestRoutes;
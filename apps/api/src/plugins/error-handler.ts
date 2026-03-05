import type { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

interface ErrorResponse {
  ok: false;
  error: string;
  statusCode: number;
  details?: unknown;
}

function buildErrorResponse(statusCode: number, message: string, details?: unknown): ErrorResponse {
  return {
    ok: false,
    error: message,
    statusCode,
    ...(details !== undefined && { details }),
  };
}

async function errorHandlerPlugin(fastify: FastifyInstance) {
  fastify.setErrorHandler(
    (error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
      const statusCode = error.statusCode ?? 500;

      if (statusCode >= 500) {
        fastify.log.error({ err: error }, 'Internal server error');
      } else {
        fastify.log.warn({ err: error }, 'Client error');
      }

      if (error.validation) {
        return reply.status(400).send(
          buildErrorResponse(400, 'Validation failed', error.validation),
        );
      }

      return reply.status(statusCode).send(
        buildErrorResponse(
          statusCode,
          statusCode >= 500 ? 'Internal server error' : error.message,
        ),
      );
    },
  );

  fastify.setNotFoundHandler((_request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send(buildErrorResponse(404, 'Route not found'));
  });
}

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
  fastify: '4.x',
});

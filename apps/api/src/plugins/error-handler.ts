import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError, logger } from '@kael/core';

export async function errorHandler(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, request, reply) => {
    // Log error
    logger.error('Request error', {
      path: request.url,
      method: request.method,
      error: error.message,
      stack: error.stack,
    });

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      const issues = error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));

      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: { issues },
        },
      });
    }

    // Handle App errors
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    // Handle generic errors
    const statusCode =
      error.statusCode && typeof error.statusCode === 'number' ? error.statusCode : 500;

    return reply.status(statusCode).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        ...(process.env.NODE_ENV === 'development' && { details: error.message }),
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });
}

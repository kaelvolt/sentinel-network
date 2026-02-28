/**
 * Tool: generateDigest
 * Generates a digest from recent signals
 */

import { z } from 'zod';
import { generateAndStoreDigest as coreGenerateDigest } from '../digest.js';
import { logger } from '../logger/index.js';
import type { BaseInput, BaseOutput, ToolExecutionStep } from './types.js';

export const generateDigestInputSchema = z.object({
  requestId: z.string().optional(),
  hoursBack: z.number().int().min(1).max(168).default(24), // 1 hour to 7 days
  publish: z.boolean().default(false),
});

export type GenerateDigestInput = z.infer<typeof generateDigestInputSchema>;

export interface GenerateDigestOutput extends BaseOutput {
  data?: {
    digestId: string;
    title: string;
    signalCount: number;
    periodStart: string;
    periodEnd: string;
    published: boolean;
  };
}

export async function generateDigest(input: GenerateDigestInput): Promise<GenerateDigestOutput> {
  const startTime = Date.now();
  const toolName = 'generateDigest';

  try {
    logger.debug(`Executing ${toolName}`, { hoursBack: input.hoursBack, publish: input.publish });

    // Generate digest using core function
    const result = await coreGenerateDigest(input.hoursBack);

    // If requested, publish the digest
    if (input.publish && result.signalCount > 0) {
      const { prisma } = await import('@kael/storage');
      await prisma.digest.update({
        where: { id: result.digestId },
        data: { published: true, publishedAt: new Date() },
      });
    }

    const output: GenerateDigestOutput = {
      success: true,
      data: {
        digestId: result.digestId,
        title: `Daily Digest — ${new Date().toISOString().split('T')[0]}`,
        signalCount: result.signalCount,
        periodStart: new Date(Date.now() - input.hoursBack * 60 * 60 * 1000).toISOString(),
        periodEnd: new Date().toISOString(),
        published: input.publish,
      },
      metadata: {
        toolName,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        requestId: input.requestId,
      },
    };

    logger.info(`${toolName} completed`, {
      digestId: result.digestId,
      signals: result.signalCount,
      published: input.publish,
      durationMs: output.metadata.durationMs,
    });

    return output;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`${toolName} failed`, { error: errorMsg, input });

    return {
      success: false,
      error: errorMsg,
      metadata: {
        toolName,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        requestId: input.requestId,
      },
    };
  }
}

export function createGenerateDigestStep(
  input: GenerateDigestInput,
  output: GenerateDigestOutput,
  durationMs: number
): ToolExecutionStep {
  return {
    type: 'tool_call',
    toolName: 'generateDigest',
    input: { hoursBack: input.hoursBack, publish: input.publish },
    output: output.success
      ? {
          digestId: output.data?.digestId,
          signalCount: output.data?.signalCount,
          published: output.data?.published,
        }
      : { error: output.error },
    durationMs,
    success: output.success,
    timestamp: new Date(),
  };
}
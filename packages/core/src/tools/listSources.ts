/**
 * Tool: listSources
 * List all configured sources with their status
 */

import { z } from 'zod';
import { db } from '@kael/storage';
import { logger } from '../logger/index.js';
import type { ToolExecutionStep } from './types.js';

export const listSourcesInputSchema = z.object({
  enabledOnly: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(100).optional().default(10),
});

export type ListSourcesInput = z.infer<typeof listSourcesInputSchema>;

export interface ListSourcesOutput {
  success: boolean;
  sources: Array<{
    id: string;
    name: string;
    kind: string;
    enabled: boolean;
    reliabilityHint: number;
  }>;
  count: number;
}

export async function listSources(input: ListSourcesInput): Promise<ListSourcesOutput> {
  const startTime = Date.now();

  try {
    logger.debug('Executing listSources', { enabledOnly: input.enabledOnly, limit: input.limit });

    // Query sources from database
    const sources = await db.query.sources.findMany({
      where: input.enabledOnly ? (sources: any) => sources.enabled.eq(true) : undefined,
      limit: input.limit,
    });

    const result: ListSourcesOutput = {
      success: true,
      sources: sources.map((s: any) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        enabled: s.enabled,
        reliabilityHint: s.reliabilityHint,
      })),
      count: sources.length,
    };

    logger.info('listSources completed', { count: result.count });
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('listSources failed', { error: errorMsg });

    return {
      success: false,
      sources: [],
      count: 0,
    };
  }
}

export function createListSourcesStep(
  input: ListSourcesInput,
  output: ListSourcesOutput,
  durationMs: number
): ToolExecutionStep {
  return {
    type: 'TOOL_CALL',
    toolName: 'listSources',
    input: { enabledOnly: input.enabledOnly, limit: input.limit },
    output: { success: output.success, count: output.count },
    durationMs,
    success: output.success,
    timestamp: new Date(),
  };
}

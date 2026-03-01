/**
 * Tool: addSource
 * Add a new information source to monitor
 */

import { z } from 'zod';
import { db } from '@kael/storage';
import { logger } from '../logger/index.js';
import type { ToolExecutionStep } from './types.js';

export const addSourceInputSchema = z.object({
  name: z.string().min(1).max(100),
  kind: z.enum(['rss', 'web', 'github', 'manual']),
  url: z.string().url(),
  reliabilityHint: z.number().min(0).max(1).optional().default(0.5),
});

export type AddSourceInput = z.infer<typeof addSourceInputSchema>;

export interface AddSourceOutput {
  success: boolean;
  sourceId?: string;
  error?: string;
}

export async function addSource(input: AddSourceInput): Promise<AddSourceOutput> {
  const startTime = Date.now();

  try {
    logger.debug('Executing addSource', { name: input.name, kind: input.kind, url: input.url });

    // Check for duplicate URL
    const existing = await db.query.sources.findFirst({
      where: (sources: any) => sources.baseUrl.eq(input.url),
    });

    if (existing) {
      return {
        success: false,
        error: `Source with URL already exists: ${existing.name}`,
      };
    }

    // Create new source
    const newSource = await db.insert(sources).values({
      name: input.name,
      kind: input.kind,
      baseUrl: input.url,
      reliabilityHint: input.reliabilityHint,
      enabled: true,
    }).returning({ id: sources.id });

    logger.info('addSource completed', { sourceId: newSource[0].id });

    return {
      success: true,
      sourceId: newSource[0].id,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('addSource failed', { error: errorMsg });

    return {
      success: false,
      error: errorMsg,
    };
  }
}

export function createAddSourceStep(
  input: AddSourceInput,
  output: AddSourceOutput,
  durationMs: number
): ToolExecutionStep {
  return {
    type: 'TOOL_CALL',
    toolName: 'addSource',
    input: { name: input.name, kind: input.kind, url: input.url },
    output: output.success
      ? { success: true, sourceId: output.sourceId }
      : { success: false, error: output.error },
    durationMs,
    success: output.success,
    timestamp: new Date(),
  };
}

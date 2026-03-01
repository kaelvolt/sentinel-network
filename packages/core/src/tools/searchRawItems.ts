// @ts-nocheck
/**
 * Tool: searchRawItems
 * Search RawItems by text content
 */

import { z } from 'zod';
import { db } from '@kael/storage';
import { logger } from '../logger/index.js';
import type { ToolExecutionStep } from './types.js';

export const searchRawItemsInputSchema = z.object({
  query: z.string().min(1).max(200),
  sourceId: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export type SearchRawItemsInput = z.infer<typeof searchRawItemsInputSchema>;

export interface SearchRawItemsOutput {
  success: boolean;
  items: Array<{
    id: string;
    title: string;
    url: string;
    sourceId: string;
    status: string;
  }>;
  count: number;
}

export async function searchRawItems(input: SearchRawItemsInput): Promise<SearchRawItemsOutput> {
  const startTime = Date.now();

  try {
    logger.debug('Executing searchRawItems', { query: input.query, sourceId: input.sourceId, limit: input.limit });

    // Simple text search (case-insensitive)
    const items = await db.query.rawItems.findMany({
      where: (r: any) => {
        const matchesQuery = r.title.like(`%${input.query}%`).or(r.bodyText.like(`%${input.query}%`));
        if (input.sourceId) {
          return matchesQuery.and(r.sourceId.eq(input.sourceId));
        }
        return matchesQuery;
      },
      limit: input.limit,
      orderBy: (r: any) => r.createdAt.desc(),
    });

    const result: SearchRawItemsOutput = {
      success: true,
      items: items.map((item: any) => ({
        id: item.id,
        title: item.title,
        url: item.url,
        sourceId: item.sourceId,
        status: item.status,
      })),
      count: items.length,
    };

    logger.info('searchRawItems completed', { count: result.count });
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('searchRawItems failed', { error: errorMsg });

    return {
      success: false,
      items: [],
      count: 0,
    };
  }
}

export function createSearchRawItemsStep(
  input: SearchRawItemsInput,
  output: SearchRawItemsOutput,
  durationMs: number
): ToolExecutionStep {
  return {
    type: 'TOOL_CALL',
    toolName: 'searchRawItems',
    input: { query: input.query, sourceId: input.sourceId, limit: input.limit },
    output: { success: output.success, count: output.count },
    durationMs,
    success: output.success,
    timestamp: new Date(),
  };
}

/**
 * Tool: fetchAndIngest
 * Fetch content from RSS sources and ingest as RawItems
 */

import { z } from 'zod';
import { db } from '@kael/storage';
import { fetchRssFeed } from '@kael/sources';
import { logger } from '../logger/index.js';
import { generateId, stableHash } from '@kael/shared';
import type { ToolExecutionStep } from './types.js';

export const fetchAndIngestInputSchema = z.object({
  sourceIds: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

export type FetchAndIngestInput = z.infer<typeof fetchAndIngestInputSchema>;

export interface FetchAndIngestOutput {
  success: boolean;
  itemsFetched: number;
  sourcesChecked: number;
  error?: string;
}

export async function fetchAndIngest(input: FetchAndIngestInput): Promise<FetchAndIngestOutput> {
  const startTime = Date.now();

  try {
    logger.debug('Executing fetchAndIngest', { sourceIds: input.sourceIds, limit: input.limit });

    // Load sources
    const sources = input.sourceIds
      ? await db.query.sources.findMany({
          where: (s: any) => s.id.in(input.sourceIds),
        })
      : await db.query.sources.findMany({
          where: (s: any) => s.enabled.eq(true),
        });

    let itemsFetched = 0;

    for (const source of sources) {
      if (source.kind !== 'rss') continue;

      try {
        const items = await fetchRssFeed(source.baseUrl);

        for (const item of items.slice(0, input.limit)) {
          // Check for duplicates
          const existing = await db.query.rawItems.findFirst({
            where: (r: any) => r.hash.eq(item.hash),
          });

          if (!existing) {
            await db.insert(rawItems).values({
              sourceId: source.id,
              url: item.url,
              title: item.title,
              bodyText: item.bodyText || '',
              contentType: 'rss',
              publishedAt: item.publishedAt,
              fetchedAt: new Date(),
              hash: item.hash,
              meta: item.meta || {},
              status: 'pending',
            });
            itemsFetched++;
          }
        }
      } catch (error) {
        logger.warn(`Failed to fetch from ${source.name}`, { error });
      }
    }

    logger.info('fetchAndIngest completed', { itemsFetched, sourcesChecked: sources.length });

    return {
      success: true,
      itemsFetched,
      sourcesChecked: sources.length,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('fetchAndIngest failed', { error: errorMsg });

    return {
      success: false,
      itemsFetched: 0,
      sourcesChecked: 0,
      error: errorMsg,
    };
  }
}

export function createFetchAndIngestStep(
  input: FetchAndIngestInput,
  output: FetchAndIngestOutput,
  durationMs: number
): ToolExecutionStep {
  return {
    type: 'TOOL_CALL',
    toolName: 'fetchAndIngest',
    input: { sourceIds: input.sourceIds, limit: input.limit },
    output: output.success
      ? { itemsFetched: output.itemsFetched, sourcesChecked: output.sourcesChecked }
      : { error: output.error },
    durationMs,
    success: output.success,
    timestamp: new Date(),
  };
}

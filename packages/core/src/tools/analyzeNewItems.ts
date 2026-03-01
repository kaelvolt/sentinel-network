/**
 * Tool: analyzeNewItems
 * Runs analysis pipeline on pending RawItems
 */

import { z } from 'zod';
import { analyzeRawItems } from '@kael/analysis';
import { prisma } from '@kael/storage';
import { logger } from '../logger/index.js';
import type { BaseInput, BaseOutput, ToolExecutionStep } from './types.js';

export const analyzeNewItemsInputSchema = z.object({
  requestId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  sourceIds: z.array(z.string()).optional(), // Filter by specific sources
});

export type AnalyzeNewItemsInput = z.infer<typeof analyzeNewItemsInputSchema>;

export interface AnalyzeNewItemsOutput extends BaseOutput {
  data: {
    itemsProcessed: number;
    itemsAnalyzed: number;
    clustersFormed: number;
    signalsCreated: number;
    durationMs: number;
  };
}

export async function analyzeNewItems(input: AnalyzeNewItemsInput): Promise<AnalyzeNewItemsOutput> {
  const startTime = Date.now();
  const toolName = 'analyzeNewItems';

  try {
    logger.debug(`Executing ${toolName}`, { limit: input.limit, sourceIds: input.sourceIds });

    // Fetch pending items
    const where: Record<string, unknown> = { status: 'pending' };
    if (input.sourceIds && input.sourceIds.length > 0) {
      where.sourceId = { in: input.sourceIds };
    }

    const pendingItems = await prisma.rawItem.findMany({
      where,
      take: input.limit,
      orderBy: { fetchedAt: 'desc' },
    });

    if (pendingItems.length === 0) {
      logger.info(`${toolName}: No pending items to analyze`);
      return {
        success: true,
        data: {
          itemsProcessed: 0,
          itemsAnalyzed: 0,
          clustersFormed: 0,
          signalsCreated: 0,
          durationMs: Date.now() - startTime,
        },
        metadata: {
          toolName,
          executedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
          requestId: input.requestId,
        },
      };
    }

    // Run analysis
    const analysisStart = Date.now();
    const analysisResult = await analyzeRawItems(
      pendingItems.map(item => ({
        id: item.id,
        hash: item.hash,
        title: item.title,
        bodyText: item.bodyText,
        sourceId: item.sourceId,
        publishedAt: item.publishedAt,
      }))
    );

    const result: AnalyzeNewItemsOutput = {
      success: true,
      data: {
        itemsProcessed: pendingItems.length,
        itemsAnalyzed: analysisResult.stats.itemsProcessed,
        clustersFormed: analysisResult.stats.clustersFormed,
        signalsCreated: analysisResult.stats.signalsGenerated,
        durationMs: Date.now() - analysisStart,
      },
      metadata: {
        toolName,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        requestId: input.requestId,
      },
    };

    logger.info(`${toolName} completed`, {
      itemsProcessed: result.data.itemsProcessed,
      clustersFormed: result.data.clustersFormed,
      signalsCreated: result.data.signalsCreated,
      durationMs: result.metadata.durationMs,
    });

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`${toolName} failed`, { error: errorMsg, input });

    return {
      success: false,
      error: errorMsg,
      data: {
        itemsProcessed: 0,
        itemsAnalyzed: 0,
        clustersFormed: 0,
        signalsCreated: 0,
        durationMs: 0,
      },
      metadata: {
        toolName,
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        requestId: input.requestId,
      },
    };
  }
}

export function createAnalyzeNewItemsStep(
  input: AnalyzeNewItemsInput,
  output: AnalyzeNewItemsOutput,
  durationMs: number
): ToolExecutionStep {
  return {
    type: 'TOOL_CALL',
    toolName: 'analyzeNewItems',
    input: { limit: input.limit, sourceIds: input.sourceIds },
    output: output.success
      ? {
          itemsProcessed: output.data.itemsProcessed,
          clustersFormed: output.data.clustersFormed,
          signalsCreated: output.data.signalsCreated,
        }
      : { error: output.error },
    durationMs,
    success: output.success,
    timestamp: new Date(),
  };
}
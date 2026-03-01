/**
 * Kael Orchestrator
 * Coordinates the ingestion, analysis, and publishing pipeline
 */

import { logger } from './logger/index.js';
import { prisma } from '@kael/storage';
import { policy } from './policy.js';
import { analyzeRawItems } from '@kael/analysis';
import { generateAndStoreDigest } from './digest.js';
import type { RawItem, Cluster, Signal } from '@kael/shared';

export interface PipelineMetrics {
  sourcesChecked: number;
  newRawItems: number;
  claimsExtracted: number;
  clustersUpdated: number;
  signalsCreated: number;
  signalsUrgent: number;
  durationMs: number;
  errors: string[];
}

export interface PipelineResult {
  success: boolean;
  metrics: PipelineMetrics;
  error?: Error;
}

export async function runPipeline(): Promise<PipelineResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const metrics: PipelineMetrics = {
    sourcesChecked: 0,
    newRawItems: 0,
    claimsExtracted: 0,
    clustersUpdated: 0,
    signalsCreated: 0,
    signalsUrgent: 0,
    durationMs: 0,
    errors: [],
  };

  logger.info('Starting Kael pipeline');

  try {
    const sources = await prisma.source.findMany({ where: { enabled: true } });
    metrics.sourcesChecked = sources.length;
    logger.info(`Loaded ${sources.length} enabled sources`);

    if (sources.length === 0) {
      logger.warn('No enabled sources found, skipping pipeline');
      return { success: true, metrics };
    }

    const { fetchRssFeed } = await import('@kael/sources');
    const newItems: RawItem[] = [];

    for (const source of sources) {
      try {
        if (source.kind === 'rss') {
          const items = await fetchRssFeed(source.baseUrl);
          logger.debug(`Fetched ${items.length} items from ${source.name}`);
          for (const item of items) {
            const existing = await prisma.rawItem.findUnique({ where: { hash: item.hash } });
            if (!existing) {
              const rawItem = await prisma.rawItem.create({
                data: {
                  sourceId: source.id,
                  url: item.url,
                  title: item.title,
                  bodyText: item.bodyText || '',
                  contentType: item.contentType || 'rss',
                  language: item.language,
                  author: item.author,
                  publishedAt: item.publishedAt,
                  fetchedAt: new Date(),
                  hash: item.hash,
                  meta: item.meta || {},
                  status: 'pending',
                },
              });
              newItems.push(rawItem as RawItem);
              metrics.newRawItems++;
            }
          }
        }
      } catch (error) {
        const msg = `Failed to fetch from ${source.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error(msg);
        errors.push(msg);
      }
    }

    logger.info(`Ingested ${metrics.newRawItems} new raw items`);

    const policyViolations: RawItem[] = [];
    for (const item of newItems) {
      const checks = await policy.checkAll(item);
      if (!checks.passed) {
        policyViolations.push(item);
        logger.warn(`Policy violation in item ${item.id}: ${checks.reason}`);
        await prisma.rawItem.update({ where: { id: item.id }, data: { status: 'rejected' } });
      }
    }

    const cleanItems = newItems.filter((item) => !policyViolations.find((pv) => pv.id === item.id));

    if (cleanItems.length > 0) {
      logger.info(`Analyzing ${cleanItems.length} clean items`);
      const analysisResult = await analyzeRawItems(cleanItems);
      metrics.claimsExtracted = analysisResult.claims.length;
      metrics.clustersUpdated = analysisResult.clusters.length;
      metrics.signalsCreated = analysisResult.signals.length;
      metrics.signalsUrgent = analysisResult.signals.filter((s: Signal) => s.severity >= 4).length;

      for (const item of cleanItems) {
        await prisma.rawItem.update({ where: { id: item.id }, data: { status: 'analyzed' } });
      }

      logger.info(`Analysis complete: ${metrics.claimsExtracted} claims, ${metrics.clustersUpdated} clusters, ${metrics.signalsCreated} signals (${metrics.signalsUrgent} urgent)`);
    }

    const lastDigest = await prisma.digest.findFirst({ orderBy: { createdAt: 'desc' } });
    const hoursSinceLastDigest = lastDigest ? (Date.now() - lastDigest.createdAt.getTime()) / (1000 * 60 * 60) : 25;

    if (hoursSinceLastDigest >= 24) {
      logger.info('Generating daily digest');
      try {
        const digest = await generateAndStoreDigest(24);
        logger.info(`Digest generated with ${digest.signalCount} signals`);
      } catch (error) {
        const msg = `Digest generation failed: ${error instanceof Error ? error.message : 'Unknown'}`;
        logger.error(msg);
        errors.push(msg);
      }
    }

    metrics.durationMs = Date.now() - startTime;
    metrics.errors = errors;
    logger.info('Pipeline complete', { metrics });

    return { success: errors.length === 0, metrics };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Pipeline failed', { error: errorMsg });
    metrics.durationMs = Date.now() - startTime;
    metrics.errors.push(errorMsg);
    return { success: false, metrics, error: error as Error };
  }
}

export async function getPipelineStatus(): Promise<{
  sourcesEnabled: number;
  pendingItems: number;
  recentSignals: number;
  lastRunAt: Date | null;
  isHealthy: boolean;
}> {
  const [sourcesEnabled, pendingItems, lastRun] = await Promise.all([
    prisma.source.count({ where: { enabled: true } }),
    prisma.rawItem.count({ where: { status: 'pending' } }),
    prisma.signal.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentSignals = await prisma.signal.count({ where: { createdAt: { gte: last24h } } });

  return { sourcesEnabled, pendingItems, recentSignals, lastRunAt: lastRun?.createdAt || null, isHealthy: sourcesEnabled > 0 };
}

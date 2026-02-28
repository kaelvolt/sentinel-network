/**
 * Analysis Package
 * Heuristic analysis pipeline for civic intelligence
 * Deterministic, auditable, LLM-ready for future enhancement
 */

import { prisma, Prisma } from '@kael/storage';
import { logger } from '@kael/core';
import { SeverityLevel, ConfidenceLabel, ReasoningStep } from '@kael/shared';

// Analysis modules
import { deduplicateItems, calculateSimilarity, DeduplicableItem } from './dedupe.js';
import { incrementalCluster, mergeSimilarClusters, ClusterInput, ClusterCandidate } from './cluster.js';
import { scoreCluster, ScoreResult } from './score.js';
import { summarizeCluster, createSignalSummary, SummarizableItem } from './summarize.js';
import { generateExplanation, ExplanationInput } from './explain.js';

// Re-export individual modules for advanced use
export * from './dedupe.js';
export * from './cluster.js';
export * from './score.js';
export * from './summarize.js';
export * from './explain.js';

// Analysis result types
export interface AnalysisResult {
  clustersCreatedOrUpdated: Array<{
    clusterId: string;
    signalId: string | null;
    topic: string;
    itemCount: number;
    severity: SeverityLevel;
    confidence: number;
  }>;
  signalsCreated: Array<{
    signalId: string;
    clusterId: string;
    title: string;
    severity: SeverityLevel;
    confidence: number;
    confidenceLabel: ConfidenceLabel;
  }>;
  stats: {
    itemsProcessed: number;
    itemsDeduplicated: number;
    clustersFormed: number;
    signalsGenerated: number;
    durationMs: number;
  };
}

/**
 * Main analysis function
 * Processes new RawItems through the complete pipeline:
 * 1. Deduplication (hash + similarity)
 * 2. Clustering (incremental similarity-based)
 * 3. Scoring (severity + confidence heuristics)
 * 4. Summarization (extractive)
 * 5. Explanation generation (reasoning trail)
 * 6. Storage (clusters + signals + reasoning trails)
 *
 * @param newItems - RawItems to analyze
 * @returns Analysis results with created/updated clusters and signals
 */
export async function analyzeRawItems(
  newItems: Array<{
    id: string;
    hash: string;
    title: string;
    bodyText: string;
    sourceId: string;
    publishedAt: Date | null;
  }>
): Promise<AnalysisResult> {
  const startTime = Date.now();
  
  logger.info('Starting analysis pipeline', { itemCount: newItems.length });
  
  // Step 1: Load existing hashes for deduplication
  const existingHashes = await loadExistingHashes(newItems.map(i => i.hash));
  
  // Step 2: Deduplicate
  const dedupeResult = deduplicateItems(
    newItems,
    existingHashes,
    0.85 // Similarity threshold
  );
  
  logger.info('Deduplication complete', {
    unique: dedupeResult.stats.uniqueCount,
    duplicates: dedupeResult.stats.duplicateCount,
  });
  
  if (dedupeResult.unique.length === 0) {
    return {
      clustersCreatedOrUpdated: [],
      signalsCreated: [],
      stats: {
        itemsProcessed: newItems.length,
        itemsDeduplicated: dedupeResult.stats.duplicateCount,
        clustersFormed: 0,
        signalsGenerated: 0,
        durationMs: Date.now() - startTime,
      },
    };
  }
  
  // Step 3: Load existing clusters for incremental clustering
  const existingClusters = await loadExistingClusters();
  
  // Step 4: Cluster items
  const clusterInputs: ClusterInput[] = dedupeResult.unique.map(item => ({
    id: item.id,
    title: item.title,
    bodyText: item.bodyText,
    publishedAt: item.publishedAt,
    sourceId: item.sourceId,
  }));
  
  const clusterResult = incrementalCluster(clusterInputs, existingClusters, {
    similarityThreshold: 0.70,
    minClusterSize: 1,
    maxClusterSize: 50,
  });
  
  // Merge similar clusters for quality
  const mergedNewClusters = mergeSimilarClusters(clusterResult.newClusters, 0.85);
  
  logger.info('Clustering complete', {
    newClusters: mergedNewClusters.length,
    updatedClusters: clusterResult.updatedClusters.length,
    unclustered: clusterResult.unclustered.length,
  });
  
  // Step 5: Score and summarize clusters, create signals
  const clustersCreatedOrUpdated: AnalysisResult['clustersCreatedOrUpdated'] = [];
  const signalsCreated: AnalysisResult['signalsCreated'] = [];
  
  // Process new clusters
  for (const clusterCandidate of mergedNewClusters) {
    const result = await processCluster(
      clusterCandidate,
      dedupeResult.unique,
      'new'
    );
    
    if (result) {
      clustersCreatedOrUpdated.push(result.cluster);
      if (result.signal) {
        signalsCreated.push(result.signal);
      }
    }
  }
  
  // Process updated clusters
  for (const update of clusterResult.updatedClusters) {
    // Load the existing cluster
    const existingCluster = existingClusters.find(c => c.id === update.clusterId);
    if (!existingCluster) continue;
    
    // Get items that were added
    const addedItems = dedupeResult.unique.filter(item =>
      update.addedItemIds.includes(item.id)
    );
    
    // Merge items with existing cluster
    const updatedCandidate: ClusterCandidate = {
      ...existingCluster,
      itemIds: [...existingCluster.itemIds, ...update.addedItemIds],
      avgSimilarity: update.newAvgSimilarity,
    };
    
    const result = await processCluster(
      updatedCandidate,
      dedupeResult.unique,
      'updated'
    );
    
    if (result) {
      clustersCreatedOrUpdated.push(result.cluster);
      if (result.signal) {
        signalsCreated.push(result.signal);
      }
    }
  }
  
  const durationMs = Date.now() - startTime;
  
  logger.info('Analysis pipeline complete', {
    itemsProcessed: newItems.length,
    clustersFormed: clustersCreatedOrUpdated.length,
    signalsGenerated: signalsCreated.length,
    durationMs,
  });
  
  return {
    clustersCreatedOrUpdated,
    signalsCreated,
    stats: {
      itemsProcessed: newItems.length,
      itemsDeduplicated: dedupeResult.stats.duplicateCount,
      clustersFormed: clustersCreatedOrUpdated.length,
      signalsGenerated: signalsCreated.length,
      durationMs,
    },
  };
}

/**
 * Load existing hashes from database for deduplication
 */
async function loadExistingHashes(newHashes: string[]): Promise<Set<string>> {
  const existing = await prisma.rawItem.findMany({
    where: {
      hash: { in: newHashes },
    },
    select: { hash: true },
  });
  
  return new Set(existing.map(r => r.hash));
}

/**
 * Load existing clusters for incremental clustering
 */
async function loadExistingClusters(): Promise<ClusterCandidate[]> {
  const clusters = await prisma.cluster.findMany({
    where: { status: 'active' },
    include: {
      rawItems: {
        include: {
          rawItem: {
            select: {
              id: true,
              title: true,
              bodyText: true,
              publishedAt: true,
              sourceId: true,
            },
          },
        },
      },
    },
  });
  
  return clusters.map(c => ({
    id: c.id,
    topic: c.topic,
    canonicalItemId: c.canonicalClaim || c.rawItems[0]?.rawItem.id || '',
    itemIds: c.rawItems.map(ri => ri.rawItem.id),
    representativeText: c.canonicalClaim || c.rawItems[0]?.rawItem.bodyText.substring(0, 500) || '',
    avgSimilarity: 0.8, // Default for existing clusters
    createdAt: c.createdAt,
  }));
}

/**
 * Process a single cluster: score, summarize, create signal, generate explanation
 */
async function processCluster(
  clusterCandidate: ClusterCandidate,
  allItems: Array<{ id: string; title: string; bodyText: string; sourceId: string; publishedAt: Date | null }>,
  operation: 'new' | 'updated'
): Promise<{ cluster: AnalysisResult['clustersCreatedOrUpdated'][0]; signal?: AnalysisResult['signalsCreated'][0] } | null> {
  try {
    // Get cluster items
    const clusterItems = allItems.filter(item =>
      clusterCandidate.itemIds.includes(item.id)
    );
    
    if (clusterItems.length === 0) {
      logger.warn('No items found for cluster', { clusterId: clusterCandidate.id });
      return null;
    }
    
    // Get source information for scoring
    const sourceIds = [...new Set(clusterItems.map(i => i.sourceId))];
    const sources = await prisma.source.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, reliabilityHint: true, kind: true },
    });
    
    // Calculate cluster info
    const publishedDates = clusterItems
      .map(i => i.publishedAt)
      .filter((d): d is Date => d !== null);
    
    const clusterInfo = {
      id: clusterCandidate.id,
      itemIds: clusterCandidate.itemIds,
      sourceIds: sourceIds,
      earliestItemAt: publishedDates.length > 0 ? new Date(Math.min(...publishedDates.map(d => d.getTime()))) : new Date(),
      latestItemAt: publishedDates.length > 0 ? new Date(Math.max(...publishedDates.map(d => d.getTime()))) : new Date(),
    };
    
    // Score the cluster
    const score = scoreCluster(clusterInfo, sources, clusterCandidate.representativeText);
    
    // Summarize
    const summary = summarizeCluster(clusterItems.map(item => ({
      id: item.id,
      title: item.title,
      bodyText: item.bodyText,
    })));
    
    // Create or update cluster in database
    let dbCluster;
    if (operation === 'new') {
      dbCluster = await prisma.cluster.create({
        data: {
          topic: clusterCandidate.topic,
          canonicalClaim: clusterCandidate.representativeText.substring(0, 500),
          updatedAt: new Date(),
          status: 'active',
        },
      });
      
      // Link raw items to cluster
      for (const itemId of clusterCandidate.itemIds) {
        const item = clusterItems.find(i => i.id === itemId);
        if (item) {
          await prisma.clusterRawItem.create({
            data: {
              clusterId: dbCluster.id,
              rawItemId: itemId,
              addedAt: new Date(),
            },
          });
        }
      }
    } else {
      // Update existing cluster
      dbCluster = await prisma.cluster.update({
        where: { id: clusterCandidate.id },
        data: {
          updatedAt: new Date(),
        },
      });
    }
    
    // Only create signal if confidence is sufficient (LOW or higher)
    let signal = null;
    if (score.confidence >= 0.3) { // Minimum threshold
      const signalTitle = summary.summary.substring(0, 100) || clusterCandidate.topic;
      const signalSummary = createSignalSummary(
        clusterCandidate.topic,
        clusterCandidate.representativeText.substring(0, 200),
        clusterItems.length,
        score.confidence
      );
      
      signal = await prisma.signal.create({
        data: {
          clusterId: dbCluster.id,
          title: signalTitle,
          summary: signalSummary,
          severity: score.severity,
          confidence: score.confidence,
          confidenceLabel: score.confidenceLabel,
          tags: [],
          status: score.confidence >= 0.6 ? 'active' : 'draft',
          provenance: 'heuristic',
          attention: score.severity >= 4 ? 'urgent' : score.severity >= 2 ? 'watch' : 'normal',
          updatedAt: new Date(),
        },
      });
      
      // Generate explanation
      const explanationInput: ExplanationInput = {
        rawItemIds: clusterCandidate.itemIds,
        dedupeResult: {
          unique: clusterItems,
          duplicates: [],
          stats: { inputCount: clusterItems.length, uniqueCount: clusterItems.length, duplicateCount: 0 },
        },
        clusterResult: {
          newClusters: operation === 'new' ? [clusterCandidate] : [],
          updatedClusters: operation === 'updated' ? [{ clusterId: dbCluster.id, addedItemIds: clusterCandidate.itemIds, newAvgSimilarity: clusterCandidate.avgSimilarity }] : [],
          unclustered: [],
          stats: {
            inputCount: clusterItems.length,
            newClustersCount: operation === 'new' ? 1 : 0,
            updatedClustersCount: operation === 'updated' ? 1 : 0,
            unclusteredCount: 0,
          },
        },
        scores: new Map([[clusterCandidate.id, score]]),
        summaries: new Map([[clusterCandidate.id, summary]]),
      };
      
      const explanation = generateExplanation(explanationInput);
      
      // Create reasoning trail
      await prisma.reasoningTrail.create({
        data: {
          signalId: signal.id,
          steps: explanation.steps as unknown as Prisma.InputJsonValue,
          modelInfo: explanation.modelInfo as unknown as Prisma.InputJsonValue,
          createdAt: new Date(),
        },
      });
    }
    
    return {
      cluster: {
        clusterId: dbCluster.id,
        signalId: signal?.id || null,
        topic: clusterCandidate.topic,
        itemCount: clusterItems.length,
        severity: score.severity,
        confidence: score.confidence,
      },
      signal: signal ? {
        signalId: signal.id,
        clusterId: dbCluster.id,
        title: signal.title,
        severity: score.severity,
        confidence: score.confidence,
        confidenceLabel: score.confidenceLabel,
      } : undefined,
    };
  } catch (error) {
    logger.error('Failed to process cluster', { error, clusterId: clusterCandidate.id });
    return null;
  }
}

/**
 * Helper to check if two items should be clustered together
 * Useful for external validation
 */
export function shouldCluster(
  itemA: { title: string; bodyText: string },
  itemB: { title: string; bodyText: string },
  threshold: number = 0.70
): boolean {
  const sim = calculateSimilarity(
    { id: 'a', hash: '', title: itemA.title, bodyText: itemA.bodyText },
    { id: 'b', hash: '', title: itemB.title, bodyText: itemB.bodyText }
  );
  return sim >= threshold;
}

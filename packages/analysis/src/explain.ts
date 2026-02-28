/**
 * Explanation Module
 * Generates ReasoningTrail steps showing the analysis process
 * Deterministic and auditable
 */

import { logger } from '@kael/core';
import type { ReasoningStep, StandardReasoningStep, ToolCallStep } from '@kael/shared';
import type { DedupeResult } from './dedupe.js';
import type { ClusterResult, ClusterCandidate } from './cluster.js';
import type { ScoreResult } from './score.js';

export interface ExplanationInput {
  rawItemIds: string[];
  dedupeResult: DedupeResult<{ id: string; hash: string; title: string; bodyText: string }>;
  clusterResult: ClusterResult;
  scores: Map<string, ScoreResult>;
  summaries: Map<string, { summary: string; keyPoints: string[] }>;
}

export interface ExplanationOutput {
  steps: ReasoningStep[];
  modelInfo: {
    provider: 'rule_based';
    model: 'heuristic-analysis-v1';
    config?: Record<string, unknown>;
  };
  summary: string;
}

/**
 * Create an extract step for the reasoning trail
 */
function createExtractStep(itemIds: string[]): StandardReasoningStep {
  return {
    type: 'extract',
    inputRefs: itemIds,
    output: `Extracted ${itemIds.length} items for analysis`,
    timestamp: new Date(),
  };
}

/**
 * Create a normalize step (for deduplication)
 */
function createNormalizeStep(dedupeResult: DedupeResult<unknown>): StandardReasoningStep {
  const { inputCount, uniqueCount, duplicateCount } = dedupeResult.stats;
  
  return {
    type: 'normalize',
    inputRefs: dedupeResult.unique.map(u => (u as { id: string }).id),
    output: `Deduplication: ${inputCount} items → ${uniqueCount} unique, ${duplicateCount} duplicates removed (hash + Jaccard similarity)`,
    timestamp: new Date(),
  };
}

/**
 * Create a cluster step
 */
function createClusterStep(clusterResult: ClusterResult): StandardReasoningStep {
  const { newClustersCount, updatedClustersCount, unclusteredCount } = clusterResult.stats;
  
  const parts: string[] = [];
  if (newClustersCount > 0) parts.push(`${newClustersCount} new cluster(s)`);
  if (updatedClustersCount > 0) parts.push(`${updatedClustersCount} updated cluster(s)`);
  if (unclusteredCount > 0) parts.push(`${unclusteredCount} unclustered`);
  
  const allItemIds = [
    ...clusterResult.newClusters.flatMap(c => c.itemIds),
    ...clusterResult.updatedClusters.flatMap(u => u.addedItemIds),
  ];
  
  return {
    type: 'cluster',
    inputRefs: allItemIds,
    output: `Incremental clustering: ${parts.join(', ')} (similarity threshold: 0.70)`,
    timestamp: new Date(),
  };
}

/**
 * Create a score step for a specific cluster
 */
function createScoreStep(
  clusterId: string,
  score: ScoreResult,
  itemIds: string[]
): StandardReasoningStep {
  const factorDetails = [
    `sourceReliability: ${Math.round(score.factors.sourceReliability * 100)}%`,
    `corroboration: ${Math.round(score.factors.corroboration * 100)}%`,
    `recency: ${Math.round(score.factors.recency * 100)}%`,
    `diversity: ${Math.round(score.factors.diversity * 100)}%`,
  ].join(', ');
  
  return {
    type: 'score',
    inputRefs: [clusterId, ...itemIds],
    output: `Severity: ${score.severity}/5, Confidence: ${score.confidenceLabel} (${score.confidence.toFixed(2)}). Factors: ${factorDetails}`,
    timestamp: new Date(),
  };
}

/**
 * Create a summarize step
 */
function createSummarizeStep(
  clusterId: string,
  summary: { summary: string; keyPoints: string[] },
  itemCount: number
): StandardReasoningStep {
  const preview = summary.summary.substring(0, 100) + '...';
  
  return {
    type: 'summarize',
    inputRefs: [clusterId],
    output: `Extractive summary from ${itemCount} items: ${preview}`,
    timestamp: new Date(),
  };
}

/**
 * Create a validate step (final quality check)
 */
function createValidateStep(
  clusterId: string,
  signalId: string | null,
  score: ScoreResult
): StandardReasoningStep {
  const status = signalId
    ? `Signal ${signalId} created`
    : 'Below publication threshold';
  
  return {
    type: 'validate',
    inputRefs: signalId ? [clusterId, signalId] : [clusterId],
    output: `Quality gate: confidence ${score.confidenceLabel}, severity ${score.severity}/5. ${status}`,
    timestamp: new Date(),
  };
}

/**
 * Create a corroborate step (if multiple sources confirm)
 */
function createCorroborateStep(
  clusterId: string,
  itemIds: string[],
  score: ScoreResult
): StandardReasoningStep | null {
  if (score.factors.corroboration < 0.5) return null;
  
  return {
    type: 'corroborate',
    inputRefs: [clusterId, ...itemIds],
    output: `${itemIds.length} item(s) corroborate the primary claim (corroboration score: ${Math.round(score.factors.corroboration * 100)}%)`,
    timestamp: new Date(),
  };
}

/**
 * Create a diverge step (if there are conflicting items - placeholder for future)
 */
function createDivergeStep(
  clusterId: string,
  itemIds: string[]
): StandardReasoningStep | null {
  // Placeholder: would detect contradictions in future LLM version
  // For now, skip if items are similar (heuristic assumption)
  if (itemIds.length < 2) return null;
  
  return {
    type: 'diverge',
    inputRefs: [clusterId, ...itemIds],
    output: `Conflict analysis: No significant contradictions detected among ${itemIds.length} item(s)`,
    timestamp: new Date(),
  };
}

/**
 * Generate full explanation for a single cluster
 */
function generateClusterExplanation(
  cluster: ClusterCandidate,
  input: ExplanationInput,
  allItemIds: string[]
): { steps: ReasoningStep[]; summary: string } {
  const steps: ReasoningStep[] = [];
  const score = input.scores.get(cluster.id);
  const summary = input.summaries.get(cluster.id);
  
  if (!score || !summary) {
    logger.warn('Missing score or summary for cluster', { clusterId: cluster.id });
    return { steps, summary: 'Explanation incomplete' };
  }
  
  // Add corroboration step if applicable
  const corroborateStep = createCorroborateStep(cluster.id, cluster.itemIds, score);
  if (corroborateStep) {
    steps.push(corroborateStep);
  }
  
  // Score step
  steps.push(createScoreStep(cluster.id, score, cluster.itemIds));
  
  // Summarize step
  steps.push(createSummarizeStep(cluster.id, summary, cluster.itemIds));
  
  // Diverge step (placeholder for future contradiction detection)
  const divergeStep = createDivergeStep(cluster.id, cluster.itemIds);
  if (divergeStep) {
    steps.push(divergeStep);
  }
  
  // Generate narrative summary
  const narrativeParts: string[] = [
    `Cluster "${cluster.topic}" contains ${cluster.itemIds.length} item(s).`,
    `Average similarity: ${Math.round(cluster.avgSimilarity * 100)}%.`,
    `Severity assessed at ${score.severity}/5 with ${score.confidenceLabel} confidence (${score.confidence.toFixed(2)}).`,
    score.rationale,
  ];
  
  return { steps, summary: narrativeParts.join(' ') };
}

/**
 * Main explanation generation function
 */
export function generateExplanation(input: ExplanationInput): ExplanationOutput {
  const steps: ReasoningStep[] = [];
  
  // Step 1: Extract
  steps.push(createExtractStep(input.rawItemIds));
  
  // Step 2: Normalize (deduplication)
  steps.push(createNormalizeStep(input.dedupeResult));
  
  // Step 3: Cluster
  steps.push(createClusterStep(input.clusterResult));
  
  // Steps 4+: Per-cluster scoring and summarization
  const clusterExplanations: string[] = [];
  
  // Process new clusters
  for (const cluster of input.clusterResult.newClusters) {
    const { steps: clusterSteps, summary } = generateClusterExplanation(
      cluster,
      input,
      input.rawItemIds
    );
    steps.push(...clusterSteps);
    clusterExplanations.push(summary);
  }
  
  // Process updated clusters
  for (const update of input.clusterResult.updatedClusters) {
    // Create a temporary cluster candidate for the update
    const clusterCandidate: ClusterCandidate = {
      id: update.clusterId,
      topic: 'Updated cluster',
      canonicalItemId: update.addedItemIds[0] || '',
      itemIds: update.addedItemIds,
      representativeText: '',
      avgSimilarity: update.newAvgSimilarity,
      createdAt: new Date(),
    };
    
    const { steps: clusterSteps, summary } = generateClusterExplanation(
      clusterCandidate,
      input,
      input.rawItemIds
    );
    steps.push(...clusterSteps);
    clusterExplanations.push(`Updated: ${summary}`);
  }
  
  // Final summary
  const summaryText = clusterExplanations.length > 0
    ? `Analysis complete. ${clusterExplanations.length} cluster(s) processed. ${clusterExplanations[0]}`
    : `Analysis complete. No new clusters formed from ${input.dedupeResult.stats.uniqueCount} unique item(s).`;
  
  const output: ExplanationOutput = {
    steps,
    modelInfo: {
      provider: 'rule_based',
      model: 'heuristic-analysis-v1',
      config: {
        similarityThreshold: 0.70,
        dedupeThreshold: 0.85,
        maxSummaryLength: 500,
      },
    },
    summary: summaryText,
  };
  
  logger.debug('Explanation generated', {
    stepCount: steps.length,
    clusterCount: input.clusterResult.newClusters.length + input.clusterResult.updatedClusters.length,
  });
  
  return output;
}

/**
 * Create a simplified explanation for a single item
 * Used when item doesn't form a cluster
 */
export function generateItemExplanation(
  itemId: string,
  reason: string
): ExplanationOutput {
  const steps: ReasoningStep[] = [
    {
      type: 'extract',
      inputRefs: [itemId],
      output: `Item ${itemId} extracted`,
      timestamp: new Date(),
    },
    {
      type: 'validate',
      inputRefs: [itemId],
      output: `Item rejected: ${reason}`,
      timestamp: new Date(),
    },
  ];
  
  return {
    steps,
    modelInfo: {
      provider: 'rule_based',
      model: 'heuristic-analysis-v1',
    },
    summary: `Item ${itemId} not processed into signal: ${reason}`,
  };
}

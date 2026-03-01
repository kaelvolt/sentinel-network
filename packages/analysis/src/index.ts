/**
 * Analysis Package
 * Heuristic analysis pipeline for civic intelligence
 * Deterministic, auditable, LLM-ready for future enhancement
 */

import { db } from "@kael/storage";
import { logger } from "@kael/shared";
import { SeverityLevel, ConfidenceLabel } from "@kael/shared";
import { eq, inArray, sql } from "drizzle-orm";
import { rawItems, clusters, signals, reasoningTrails, sources, clusterRawItems } from "@kael/storage";

// Analysis modules
import { deduplicateItems, calculateSimilarity } from "./dedupe.js";
import { incrementalCluster, mergeSimilarClusters, ClusterInput, ClusterCandidate } from "./cluster.js";
import { scoreCluster } from "./score.js";
import { summarizeCluster, createSignalSummary } from "./summarize.js";
import { generateExplanation, ExplanationInput } from "./explain.js";

// Re-export individual modules for advanced use
export * from "./dedupe.js";
export * from "./cluster.js";
export * from "./score.js";
export * from "./summarize.js";
export * from "./explain.js";

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
 * Processes new RawItems through the complete pipeline
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

  logger.info("Starting analysis pipeline", { itemCount: newItems.length });

  // Step 1: Load existing hashes for deduplication
  const existingHashes = await loadExistingHashes(newItems.map((i) => i.hash));

  // Step 2: Deduplicate
  const dedupeResult = deduplicateItems(
    newItems,
    existingHashes,
    0.85 // Similarity threshold
  );

  logger.info("Deduplication complete", {
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
  const clusterInputs: ClusterInput[] = dedupeResult.unique.map((item) => ({
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

  logger.info("Clustering complete", {
    newClusters: mergedNewClusters.length,
    updatedClusters: clusterResult.updatedClusters.length,
    unclustered: clusterResult.unclustered.length,
  });

  // Step 5: Score and summarize clusters, create signals
  const clustersCreatedOrUpdated: AnalysisResult["clustersCreatedOrUpdated"] = [];
  const signalsCreated: AnalysisResult["signalsCreated"] = [];

  // Process new clusters
  for (const clusterCandidate of mergedNewClusters) {
    const result = await processCluster(clusterCandidate, dedupeResult.unique, "new");

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
    const existingCluster = existingClusters.find((c) => c.id === update.clusterId);
    if (!existingCluster) continue;

    // Merge items with existing cluster
    const updatedCandidate: ClusterCandidate = {
      ...existingCluster,
      itemIds: [...existingCluster.itemIds, ...update.addedItemIds],
      avgSimilarity: update.newAvgSimilarity,
    };

    const result = await processCluster(updatedCandidate, dedupeResult.unique, "updated");

    if (result) {
      clustersCreatedOrUpdated.push(result.cluster);
      if (result.signal) {
        signalsCreated.push(result.signal);
      }
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info("Analysis pipeline complete", {
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
  const existing = await db
    .select({ hash: rawItems.hash })
    .from(rawItems)
    .where(inArray(rawItems.hash, newHashes));

  return new Set(existing.map((r) => r.hash));
}

/**
 * Load existing clusters for incremental clustering
 */
async function loadExistingClusters(): Promise<ClusterCandidate[]> {
  const activeClusters = await db
    .select({
      id: clusters.id,
      topic: clusters.topic,
      canonicalClaim: clusters.canonicalClaim,
      createdAt: clusters.createdAt,
    })
    .from(clusters)
    .where(eq(clusters.status, "active"));

  // For each cluster, get its raw items
  const result: ClusterCandidate[] = [];
  for (const c of activeClusters) {
    const clusterItems = await db
      .select({
        rawItemId: clusterRawItems.rawItemId,
      })
      .from(clusterRawItems)
      .where(eq(clusterRawItems.clusterId, c.id));

    const rawItemIds = clusterItems.map((ci) => ci.rawItemId);

    // Get raw item details
    const items = rawItemIds.length > 0
      ? await db
          .select({
            id: rawItems.id,
            title: rawItems.title,
            bodyText: rawItems.bodyText,
            publishedAt: rawItems.publishedAt,
            sourceId: rawItems.sourceId,
          })
          .from(rawItems)
          .where(inArray(rawItems.id, rawItemIds))
      : [];

    result.push({
      id: c.id,
      topic: c.topic,
      canonicalItemId: c.canonicalClaim || items[0]?.id || "",
      itemIds: rawItemIds,
      representativeText: c.canonicalClaim || items[0]?.bodyText?.substring(0, 500) || "",
      avgSimilarity: 0.8,
      createdAt: c.createdAt,
    });
  }

  return result;
}

/**
 * Process a single cluster: score, summarize, create signal, generate explanation
 */
async function processCluster(
  clusterCandidate: ClusterCandidate,
  allItems: Array<{ id: string; title: string; bodyText: string; sourceId: string; publishedAt: Date | null }>,
  operation: "new" | "updated"
): Promise<{ cluster: AnalysisResult["clustersCreatedOrUpdated"][0]; signal?: AnalysisResult["signalsCreated"][0] } | null> {
  try {
    // Get cluster items
    const clusterItems = allItems.filter((item) => clusterCandidate.itemIds.includes(item.id));

    if (clusterItems.length === 0) {
      logger.warn("No items found for cluster", { clusterId: clusterCandidate.id });
      return null;
    }

    // Get source information for scoring
    const sourceIds = [...new Set(clusterItems.map((i) => i.sourceId))];
    const sourceData = sourceIds.length > 0
      ? await db
          .select({
            id: sources.id,
            reliabilityHint: sources.reliabilityHint,
            kind: sources.kind,
          })
          .from(sources)
          .where(inArray(sources.id, sourceIds))
      : [];

    // Calculate cluster info
    const publishedDates = clusterItems
      .map((i) => i.publishedAt)
      .filter((d): d is Date => d !== null);

    const clusterInfo = {
      id: clusterCandidate.id,
      itemIds: clusterCandidate.itemIds,
      sourceIds: sourceIds,
      earliestItemAt: publishedDates.length > 0 ? new Date(Math.min(...publishedDates.map((d) => d.getTime()))) : new Date(),
      latestItemAt: publishedDates.length > 0 ? new Date(Math.max(...publishedDates.map((d) => d.getTime()))) : new Date(),
    };

    // Score the cluster
    const score = scoreCluster(clusterInfo, sourceData, clusterCandidate.representativeText);

    // Summarize
    const summary = summarizeCluster(
      clusterItems.map((item) => ({
        id: item.id,
        title: item.title,
        bodyText: item.bodyText,
      }))
    );

    // Create or update cluster in database
    let dbCluster;
    if (operation === "new") {
      const [newCluster] = await db
        .insert(clusters)
        .values({
          topic: clusterCandidate.topic,
          canonicalClaim: clusterCandidate.representativeText.substring(0, 500),
          status: "active",
          updatedAt: new Date(),
        })
        .returning({ id: clusters.id });

      dbCluster = newCluster;

      // Link raw items to cluster
      for (const itemId of clusterCandidate.itemIds) {
        const item = clusterItems.find((i) => i.id === itemId);
        if (item) {
          await db.insert(clusterRawItems).values({
            clusterId: dbCluster.id,
            rawItemId: itemId,
            addedAt: new Date(),
          });
        }
      }
    } else {
      // Update existing cluster
      const [updatedCluster] = await db
        .update(clusters)
        .set({ updatedAt: new Date() })
        .where(eq(clusters.id, clusterCandidate.id))
        .returning({ id: clusters.id });

      dbCluster = updatedCluster;
    }

    // Only create signal if confidence is sufficient (LOW or higher)
    let signal = null;
    if (score.confidence >= 0.3) {
      // Minimum threshold
      const signalTitle = summary.summary.substring(0, 100) || clusterCandidate.topic;
      const signalSummary = createSignalSummary(
        clusterCandidate.topic,
        clusterCandidate.representativeText.substring(0, 200),
        clusterItems.length,
        score.confidence
      );

      const [newSignal] = await db
        .insert(signals)
        .values({
          clusterId: dbCluster.id,
          title: signalTitle,
          summary: signalSummary,
          severity: score.severity,
          confidence: score.confidence,
          confidenceLabel: score.confidenceLabel,
          tags: [],
          status: score.confidence >= 0.6 ? "active" : "draft",
          provenance: "heuristic",
          attention: score.severity >= 4 ? "urgent" : score.severity >= 2 ? "watch" : "normal",
          updatedAt: new Date(),
        })
        .returning({
          id: signals.id,
          clusterId: signals.clusterId,
          title: signals.title,
        });

      signal = newSignal;

      // Generate explanation
      const explanationInput: ExplanationInput = {
        rawItemIds: clusterCandidate.itemIds,
        dedupeResult: {
          unique: clusterItems.map((i) => ({ ...i, hash: "", bodyText: i.bodyText })),
          duplicates: [],
          stats: { inputCount: clusterItems.length, uniqueCount: clusterItems.length, duplicateCount: 0 },
        },
        clusterResult: {
          newClusters: operation === "new" ? [clusterCandidate] : [],
          updatedClusters: operation === "updated" ? [{ clusterId: dbCluster.id, addedItemIds: clusterCandidate.itemIds, newAvgSimilarity: clusterCandidate.avgSimilarity }] : [],
          unclustered: [],
          stats: {
            inputCount: clusterItems.length,
            newClustersCount: operation === "new" ? 1 : 0,
            updatedClustersCount: operation === "updated" ? 1 : 0,
            unclusteredCount: 0,
          },
        },
        scores: new Map([[clusterCandidate.id, score]]),
        summaries: new Map([[clusterCandidate.id, summary]]),
      };

      const explanation = generateExplanation(explanationInput);

      // Create reasoning trail
      await db.insert(reasoningTrails).values({
        signalId: signal.id,
        steps: explanation.steps as unknown as object,
        modelInfo: explanation.modelInfo as unknown as object,
        createdAt: new Date(),
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
      signal: signal
        ? {
            signalId: signal.id,
            clusterId: dbCluster.id,
            title: signal.title,
            severity: score.severity,
            confidence: score.confidence,
            confidenceLabel: score.confidenceLabel,
          }
        : undefined,
    };
  } catch (error) {
    logger.error("Failed to process cluster", { error, clusterId: clusterCandidate.id });
    return null;
  }
}

/**
 * Helper to check if two items should be clustered together
 */
export function shouldCluster(
  itemA: { title: string; bodyText: string },
  itemB: { title: string; bodyText: string },
  threshold: number = 0.70
): boolean {
  const sim = calculateSimilarity(
    { id: "a", hash: "", title: itemA.title, bodyText: itemA.bodyText },
    { id: "b", hash: "", title: itemB.title, bodyText: itemB.bodyText }
  );
  return sim >= threshold;
}

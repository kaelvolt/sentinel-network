export interface ClusterInput {
  id: string;
  title: string;
  bodyText: string;
  publishedAt: Date | null;
  sourceId: string;
}

export interface ClusterCandidate {
  id: string;
  topic: string;
  canonicalItemId: string;
  itemIds: string[];
  representativeText: string;
  avgSimilarity: number;
  createdAt: Date;
}

export interface ClusterResult {
  newClusters: ClusterCandidate[];
  updatedClusters: Array<{
    clusterId: string;
    addedItemIds: string[];
    newAvgSimilarity: number;
  }>;
  unclustered: ClusterInput[];
  stats: {
    inputCount: number;
    newClustersCount: number;
    updatedClustersCount: number;
    unclusteredCount: number;
  };
}

export function incrementalCluster(
  inputs: ClusterInput[],
  existingClusters: ClusterCandidate[],
  options: {
    similarityThreshold: number;
    minClusterSize: number;
    maxClusterSize: number;
  }
): ClusterResult {
  const newClusters: ClusterCandidate[] = [];
  const updatedClusters: ClusterResult["updatedClusters"] = [];
  const unclustered: ClusterInput[] = [];

  for (const input of inputs) {
    let addedToExisting = false;

    // Try to add to existing cluster
    for (const cluster of existingClusters) {
      if (cluster.itemIds.length >= options.maxClusterSize) continue;

      const similarity = calculateTextSimilarity(input.bodyText, cluster.representativeText);
      if (similarity >= options.similarityThreshold) {
        updatedClusters.push({
          clusterId: cluster.id,
          addedItemIds: [input.id],
          newAvgSimilarity: (cluster.avgSimilarity + similarity) / 2,
        });
        addedToExisting = true;
        break;
      }
    }

    if (!addedToExisting) {
      // Try to add to a new cluster
      let addedToNew = false;
      for (const nc of newClusters) {
        const similarity = calculateTextSimilarity(input.bodyText, nc.representativeText);
        if (similarity >= options.similarityThreshold) {
          nc.itemIds.push(input.id);
          nc.avgSimilarity = (nc.avgSimilarity + similarity) / 2;
          addedToNew = true;
          break;
        }
      }

      if (!addedToNew) {
        // Create new cluster
        newClusters.push({
          id: `cluster-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          topic: input.title.substring(0, 100),
          canonicalItemId: input.id,
          itemIds: [input.id],
          representativeText: input.bodyText.substring(0, 500),
          avgSimilarity: 1.0,
          createdAt: new Date(),
        });
      }
    }
  }

  return {
    newClusters,
    updatedClusters,
    unclustered,
    stats: {
      inputCount: inputs.length,
      newClustersCount: newClusters.length,
      updatedClustersCount: updatedClusters.length,
      unclusteredCount: unclustered.length,
    },
  };
}

export function mergeSimilarClusters(clusters: ClusterCandidate[], threshold: number): ClusterCandidate[] {
  if (clusters.length <= 1) return clusters;

  const merged: ClusterCandidate[] = [];
  const used = new Set<number>();

  for (let i = 0; i < clusters.length; i++) {
    if (used.has(i)) continue;

    const cluster = clusters[i];

    for (let j = i + 1; j < clusters.length; j++) {
      if (used.has(j)) continue;

      const other = clusters[j];
      const similarity = calculateTextSimilarity(cluster.representativeText, other.representativeText);

      if (similarity >= threshold) {
        // Merge clusters
        cluster.itemIds = [...cluster.itemIds, ...other.itemIds];
        cluster.representativeText = cluster.representativeText.length > other.representativeText.length
          ? cluster.representativeText
          : other.representativeText;
        cluster.avgSimilarity = (cluster.avgSimilarity + other.avgSimilarity) / 2;
        used.add(j);
      }
    }

    merged.push(cluster);
  }

  return merged;
}

function calculateTextSimilarity(textA: string, textB: string): number {
  const wordsA = new Set(textA.toLowerCase().split(/\s+/));
  const wordsB = new Set(textB.toLowerCase().split(/\s+/));
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

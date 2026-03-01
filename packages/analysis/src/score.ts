import { SeverityLevel, ConfidenceLabel } from "@kael/shared";

export interface ScoreFactors {
  sourceReliability: number;
  corroboration: number;
  recency: number;
  diversity: number;
}

export interface ScoreResult {
  severity: SeverityLevel;
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  factors: ScoreFactors;
  rationale: string;
}

export interface ClusterInfo {
  id: string;
  itemIds: string[];
  sourceIds: string[];
  earliestItemAt: Date;
  latestItemAt: Date;
}

export function scoreCluster(
  clusterInfo: ClusterInfo,
  sources: Array<{ id: string; reliabilityHint: number | null; kind: string }>,
  representativeText: string
): ScoreResult {
  // Calculate source quality score (0-1)
  const sourceScores = clusterInfo.sourceIds.map(sid => {
    const source = sources.find(s => s.id === sid);
    return source?.reliabilityHint || 0.5;
  });
  const avgSourceQuality = sourceScores.reduce((a, b) => a + b, 0) / sourceScores.length;

  // Calculate coverage score based on item count (more items = higher confidence)
  const coverageScore = Math.min(clusterInfo.itemIds.length / 10, 1.0);

  // Calculate temporal spread score
  const timeSpread = clusterInfo.latestItemAt.getTime() - clusterInfo.earliestItemAt.getTime();
  const hoursSpread = timeSpread / (1000 * 60 * 60);
  const temporalScore = Math.min(hoursSpread / 24, 1.0); // Max score at 24h spread

  // Calculate corroboration (multiple sources)
  const uniqueSources = new Set(clusterInfo.sourceIds).size;
  const corroborationScore = Math.min(uniqueSources / 3, 1.0);

  // Combined confidence
  const confidence = (avgSourceQuality * 0.3 + coverageScore * 0.3 + temporalScore * 0.2 + corroborationScore * 0.2);

  // Determine severity based on keywords and coverage
  const text = representativeText.toLowerCase();
  let severity: SeverityLevel = SeverityLevel.LOW;

  const urgentKeywords = ["urgent", "critical", "emergency", "breaking", "alert"];
  const highKeywords = ["important", "significant", "major", "substantial"];

  if (urgentKeywords.some(kw => text.includes(kw)) || coverageScore > 0.8) {
    severity = SeverityLevel.CRITICAL;
  } else if (highKeywords.some(kw => text.includes(kw)) || coverageScore > 0.5) {
    severity = SeverityLevel.HIGH;
  } else if (coverageScore > 0.2) {
    severity = SeverityLevel.MODERATE;
  }

  // Determine confidence label
  let confidenceLabel: ConfidenceLabel;
  if (confidence >= 0.9) {
    confidenceLabel = ConfidenceLabel.HIGH;
  } else if (confidence >= 0.6) {
    confidenceLabel = ConfidenceLabel.MED;
  } else {
    confidenceLabel = ConfidenceLabel.LOW;
  }

  const factors: ScoreFactors = {
    sourceReliability: avgSourceQuality,
    corroboration: corroborationScore,
    recency: temporalScore,
    diversity: uniqueSources / clusterInfo.itemIds.length,
  };

  const rationale = `Scored based on ${clusterInfo.itemIds.length} item(s) from ${uniqueSources} source(s). ` +
    `Source reliability: ${Math.round(avgSourceQuality * 100)}%, ` +
    `Corroboration: ${Math.round(corroborationScore * 100)}%.`;

  return {
    severity,
    confidence,
    confidenceLabel,
    factors,
    rationale,
  };
}


// Sentinel milestone: signal-quality-labels-v2
export function qualityLabelFromConfidence(confidence: number): "LOW" | "MEDIUM" | "HIGH" {
  if (confidence >= 0.75) return "HIGH";
  if (confidence >= 0.45) return "MEDIUM";
  return "LOW";
}

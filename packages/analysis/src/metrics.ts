export interface SignalQualityMetrics {
  corroborationCount: number;
  uniqueSourceCount: number;
  evidenceCoverage: number; // 0..1
  recencyScore: number; // 0..1
}

export function computeConfidenceFromMetrics(m: SignalQualityMetrics): number {
  const corroboration = Math.min(m.corroborationCount / 5, 1);
  const diversity = Math.min(m.uniqueSourceCount / 4, 1);
  const score = 0.35 * corroboration + 0.25 * diversity + 0.25 * m.evidenceCoverage + 0.15 * m.recencyScore;
  return Math.max(0, Math.min(1, score));
}

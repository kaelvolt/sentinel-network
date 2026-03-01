export interface SourceHealthSnapshot {
  sourceId: string;
  checkedAt: string;
  successRate24h: number;
  avgLatencyMs24h: number;
  consecutiveFailures: number;
  freshnessScore: number;
}

export function computeFreshnessScore(lastSuccessAt: Date | null, now: Date = new Date()): number {
  if (!lastSuccessAt) return 0;
  const ageHours = (now.getTime() - lastSuccessAt.getTime()) / 36e5;
  if (ageHours <= 1) return 1;
  if (ageHours >= 24) return 0;
  return 1 - ageHours / 24;
}

export function shouldDeprioritizeSource(snapshot: SourceHealthSnapshot): boolean {
  return snapshot.successRate24h < 0.5 || snapshot.consecutiveFailures >= 5 || snapshot.freshnessScore < 0.2;
}

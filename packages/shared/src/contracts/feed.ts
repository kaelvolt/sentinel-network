export interface PublicSignalFeedItem {
  id: string;
  publishedAt: string;
  title: string;
  summary: string;
  severity: number; // 0..5
  confidence: number; // 0..1
  confidenceLabel: "LOW" | "MEDIUM" | "HIGH";
  evidenceUrls: string[];
  reasoningTrailId: string;
}

export interface PublicSignalFeed {
  version: "v1";
  generatedAt: string;
  items: PublicSignalFeedItem[];
}

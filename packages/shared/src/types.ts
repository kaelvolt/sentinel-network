/**
 * TypeScript type definitions for the civic intelligence domain model
 */

import type {
  SourceKind,
  ConfidenceLabel,
  SeverityLevel,
  RawItemStatus,
  ClaimStatus,
  ReasoningStepType,
  ModelProvider,
} from "./enums.js";

/**
 * Base entity interface with common fields
 */
export interface BaseEntity {
  id: string;
  createdAt: Date;
}

/**
 * A source of information that can be ingested
 */
export interface Source extends BaseEntity {
  /** Type of source */
  kind: SourceKind;
  /** Human-readable name */
  name: string;
  /** Base URL for the source */
  baseUrl: string;
  /** Reliability score 0-1 based on historical accuracy */
  reliabilityHint: number;
  /** Optional metadata about the source */
  meta?: Record<string, unknown>;
}

/**
 * Raw content item ingested from a source
 */
export interface RawItem extends BaseEntity {
  /** Reference to the source */
  sourceId: string;
  /** Canonical URL of the item */
  url: string;
  /** Title or headline */
  title: string;
  /** Extracted body text */
  bodyText: string;
  /** Original publication date */
  publishedAt: Date;
  /** When we fetched it */
  fetchedAt: Date;
  /** Content hash for deduplication */
  hash: string;
  /** Arbitrary metadata (author, word count, etc.) */
  meta: Record<string, unknown>;
  /** Current processing status */
  status: RawItemStatus;
}

/**
 * A factual claim extracted from a raw item
 */
export interface Claim extends BaseEntity {
  /** Reference to parent raw item */
  rawItemId: string;
  /** The claim text (normalized) */
  text: string;
  /** Subject of the claim (who/what) */
  subject: string;
  /** Predicate/action */
  predicate: string;
  /** Object of the claim */
  object: string;
  /** When the claim was extracted */
  extractedAt: Date;
  /** Current verification status */
  status: ClaimStatus;
}

/**
 * Evidence linking a claim back to source material
 */
export interface Evidence extends BaseEntity {
  /** Reference to the claim being supported */
  claimId: string;
  /** Reference to the raw item containing the evidence */
  rawItemId: string;
  /** The quoted text from the source */
  quote: string;
  /** Character offset start in raw item */
  offsetStart: number;
  /** Character offset end in raw item */
  offsetEnd: number;
  /** URL where evidence can be viewed */
  url: string;
  /** When this evidence was captured */
  capturedAt: Date;
}

/**
 * A signal - a verified/assessed piece of civic intelligence ready for publication
 */
export interface Signal extends BaseEntity {
  /** Reference to the cluster this signal represents */
  clusterId: string;
  /** Human-readable title */
  title: string;
  /** Summary of the signal */
  summary: string;
  /** Severity 0-5 */
  severity: SeverityLevel;
  /** Confidence score 0-1 */
  confidence: number;
  /** Confidence label derived from score */
  confidenceLabel: ConfidenceLabel;
  /** Tags for categorization */
  tags: string[];
  /** When the signal was last updated */
  updatedAt: Date;
}

/**
 * A cluster of related claims about a topic
 */
export interface Cluster extends BaseEntity {
  /** Topic or event name */
  topic: string;
  /** The most representative claim */
  canonicalClaim: string;
  /** References to all claims in this cluster */
  claimIds: string[];
  /** References to all raw items in this cluster */
  rawItemIds: string[];
  /** When the cluster was last updated */
  updatedAt: Date;
  /** Current cluster status */
  status: "active" | "stale" | "resolved";
}

/**
 * A single step in a reasoning trail
 */
export interface ReasoningStep {
  /** Step type */
  type: ReasoningStepType;
  /** IDs of inputs (claims, raw items, other signals) */
  inputRefs: string[];
  /** Output of this step (intermediate result) */
  output: string;
  /** When this step was performed */
  timestamp: Date;
}

/**
 * Standard reasoning step (non-tool)
 */
export interface StandardReasoningStep extends ReasoningStep {
  type: ReasoningStepType.EXTRACT | ReasoningStepType.NORMALIZE | ReasoningStepType.CLUSTER | ReasoningStepType.SCORE | ReasoningStepType.SUMMARIZE | ReasoningStepType.VALIDATE | ReasoningStepType.CORROBORATE | ReasoningStepType.DIVERGE;
}

/**
 * Tool call step (for future LLM integration)
 */
export interface ToolCallStep extends ReasoningStep {
  type: ReasoningStepType.TOOL_CALL;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput: unknown;
}

/**
 * Model information for audit trail
 */
export interface ModelInfo {
  /** Provider of the model */
  provider: ModelProvider;
  /** Model name/version */
  model: string;
  /** Temperature or randomness setting */
  temperature?: number;
  /** Any additional configuration */
  config?: Record<string, unknown>;
}

/**
 * Audit trail showing how a signal was derived
 */
export interface ReasoningTrail extends BaseEntity {
  /** Reference to the signal this trail explains */
  signalId: string;
  /** Sequential reasoning steps */
  steps: ReasoningStep[];
  /** Information about models used */
  modelInfo: ModelInfo;
}

/**
 * Pagination parameters for list queries
 */
export interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Type for creating a new Source (omits system fields)
 */
export type CreateSource = Omit<Source, "id" | "createdAt">;

/**
 * Type for creating a new RawItem
 */
export type CreateRawItem = Omit<RawItem, "id" | "createdAt" | "hash" | "status">;

/**
 * Type for creating a new Claim
 */
export type CreateClaim = Omit<Claim, "id" | "createdAt" | "status">;

/**
 * Type for creating new Evidence
 */
export type CreateEvidence = Omit<Evidence, "id" | "createdAt">;

/**
 * Type for creating a new Signal
 */
export type CreateSignal = Omit<Signal, "id" | "createdAt" | "updatedAt" | "confidenceLabel">;

/**
 * Type for creating a new Cluster
 */
export type CreateCluster = Omit<Cluster, "id" | "createdAt" | "updatedAt" | "status">;

/**
 * Type for creating a new ReasoningTrail
 */
export type CreateReasoningTrail = Omit<ReasoningTrail, "id" | "createdAt">;

/**
 * A digest - a periodic summary of signals for publication
 */
export interface Digest extends BaseEntity {
  /** Start of digest period */
  periodStart: Date;
  /** End of digest period */
  periodEnd: Date;
  /** Title of the digest */
  title: string;
  /** Markdown content */
  content: string;
  /** Plain text summary */
  summary: string;
  /** References to included signals */
  signalIds: string[];
  /** Number of signals included */
  signalCount: number;
  /** Kael's notes on uncertainty and what to watch */
  kaelNotes: string;
  /** Additional metadata */
  meta?: Record<string, unknown>;
  /** Whether the digest has been published */
  published: boolean;
  /** When the digest was published */
  publishedAt?: Date;
  /** When the digest was last updated */
  updatedAt: Date;
}

/**
 * Type for creating a new Digest
 */
export type CreateDigest = Omit<Digest, "id" | "createdAt" | "updatedAt">;


// Sentinel milestone: public-feed-contract-v2
export interface PublicSignalFeedItemV2 extends PublicSignalFeedItem {
  freshnessHours: number;
  provenance: "heuristic" | "llm" | "hybrid";
}

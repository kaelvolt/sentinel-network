/**
 * Enumeration types for the civic intelligence domain model
 */

/** Types of sources that can be ingested */
export enum SourceKind {
  RSS = 'rss',
  WEB = 'web',
  GITHUB = 'github',
  MANUAL = 'manual',
}

/** Content types for RawItem */
export enum ContentType {
  RSS = 'rss',
  HTML = 'html',
  PDF = 'pdf',
  TEXT = 'text',
}

/** Confidence labels for Signals */
export enum ConfidenceLabel {
  LOW = 'LOW',
  MED = 'MED',
  HIGH = 'HIGH',
}

/** Severity levels for Signals (0-5) */
export enum SeverityLevel {
  NONE = 0,
  MINIMAL = 1,
  LOW = 2,
  MODERATE = 3,
  HIGH = 4,
  CRITICAL = 5,
}

/** Status of a RawItem in the processing pipeline */
export enum RawItemStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
  DISCARDED = 'discarded',
}

/** Status of a Claim */
export enum ClaimStatus {
  EXTRACTED = 'extracted',
  VERIFIED = 'verified',
  REFUTED = 'refuted',
  UNVERIFIED = 'unverified',
}

/** Publication status of a Signal */
export enum SignalStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  RETRACTED = 'retracted',
}

/** How a Signal was generated */
export enum Provenance {
  HEURISTIC = 'heuristic',
  LLM = 'llm',
  HYBRID = 'hybrid',
}

/** Attention level for monitoring (separate from severity) */
export enum AttentionLevel {
  WATCH = 'watch',
  NORMAL = 'normal',
  URGENT = 'urgent',
}

/** Types of reasoning steps in a trail */
export enum ReasoningStepType {
  EXTRACT = 'extract',
  NORMALIZE = 'normalize',
  CLUSTER = 'cluster',
  SCORE = 'score',
  MERGE = 'merge',
  DIVERGE = 'diverge',
  CORROBORATE = 'corroborate',
  CONTRADICT = 'contradict',
  SUMMARIZE = 'summarize',
  VALIDATE = 'validate',
  TOOL_CALL = 'tool_call',
}

/** Model providers for audit trail */
export enum ModelProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  LOCAL = 'local',
  RULE_BASED = 'rule_based',
}

/**
 * Map confidence numeric value to label
 * LOW: 0.0 - 0.6
 * MED: 0.6 - 0.8
 * HIGH: 0.8 - 1.0
 */
export function confidenceToLabel(confidence: number): ConfidenceLabel {
  if (confidence < 0 || confidence > 1) {
    throw new Error(`Confidence must be between 0 and 1, got ${confidence}`);
  }
  if (confidence >= 0.8) return ConfidenceLabel.HIGH;
  if (confidence >= 0.6) return ConfidenceLabel.MED;
  return ConfidenceLabel.LOW;
}

/**
 * Get the numeric range for a confidence label
 */
export function confidenceLabelRange(label: ConfidenceLabel): { min: number; max: number } {
  switch (label) {
    case ConfidenceLabel.LOW:
      return { min: 0, max: 0.6 };
    case ConfidenceLabel.MED:
      return { min: 0.6, max: 0.8 };
    case ConfidenceLabel.HIGH:
      return { min: 0.8, max: 1 };
    default:
      throw new Error(`Unknown confidence label: ${label}`);
  }
}

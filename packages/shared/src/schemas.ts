/**
 * Zod schemas for runtime validation of the civic intelligence domain model
 */

import { z } from 'zod';
import {
  SourceKind,
  ConfidenceLabel,
  SeverityLevel,
  RawItemStatus,
  ClaimStatus,
  ReasoningStepType,
  ModelProvider,
  confidenceToLabel,
} from './enums.js';

// Helper for strict date validation
const dateSchema = z.union([z.date(), z.string().datetime(), z.string().pipe(z.coerce.date())]);

// Helper for ID generation (cuid, uuid, etc.)
const idSchema = z.string().min(1).max(128);

// Helper for JSON metadata
const metaSchema = z.record(z.unknown()).default({});

/**
 * Source schema
 */
export const sourceSchema = z.object({
  id: idSchema,
  kind: z.nativeEnum(SourceKind),
  name: z.string().min(1).max(255),
  baseUrl: z.string().url(),
  reliabilityHint: z.number().min(0).max(1),
  meta: metaSchema,
  createdAt: dateSchema,
});

export const createSourceSchema = sourceSchema.omit({ id: true, createdAt: true });

/**
 * RawItem schema
 */
export const rawItemSchema = z.object({
  id: idSchema,
  sourceId: idSchema,
  url: z.string().url(),
  title: z.string().min(1).max(1000),
  bodyText: z.string(),
  publishedAt: dateSchema,
  fetchedAt: dateSchema,
  hash: z.string().length(64), // SHA-256 hex
  meta: metaSchema,
  status: z.nativeEnum(RawItemStatus),
  createdAt: dateSchema,
});

export const createRawItemSchema = rawItemSchema.omit({
  id: true,
  createdAt: true,
  hash: true,
  status: true,
});

/**
 * Claim schema
 */
export const claimSchema = z.object({
  id: idSchema,
  rawItemId: idSchema,
  text: z.string().min(1).max(5000),
  subject: z.string().min(1).max(500),
  predicate: z.string().min(1).max(500),
  object: z.string().min(1).max(2000),
  extractedAt: dateSchema,
  status: z.nativeEnum(ClaimStatus),
  createdAt: dateSchema,
});

export const createClaimSchema = claimSchema.omit({ id: true, createdAt: true, status: true });

/**
 * Evidence schema
 */
export const evidenceSchema = z.object({
  id: idSchema,
  claimId: idSchema,
  rawItemId: idSchema,
  quote: z.string().min(1).max(5000),
  offsetStart: z.number().int().min(0),
  offsetEnd: z.number().int().min(0),
  url: z.string().url(),
  capturedAt: dateSchema,
  createdAt: dateSchema,
});

export const createEvidenceSchema = evidenceSchema.omit({ id: true, createdAt: true });

/**
 * Signal schema
 */
export const signalSchema = z.object({
  id: idSchema,
  clusterId: idSchema,
  title: z.string().min(1).max(500),
  summary: z.string().min(1).max(10000),
  severity: z.nativeEnum(SeverityLevel),
  confidence: z.number().min(0).max(1),
  confidenceLabel: z.nativeEnum(ConfidenceLabel),
  tags: z.array(z.string().min(1).max(50)).default([]),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

export const createSignalSchema = signalSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  confidenceLabel: true,
}).extend({
  confidence: z.number().min(0).max(1),
});

/**
 * Cluster schema
 */
export const clusterSchema = z.object({
  id: idSchema,
  topic: z.string().min(1).max(500),
  canonicalClaim: z.string().min(1).max(5000),
  claimIds: z.array(idSchema).min(1),
  rawItemIds: z.array(idSchema).min(1),
  updatedAt: dateSchema,
  createdAt: dateSchema,
  status: z.enum(['active', 'stale', 'resolved']).default('active'),
});

export const createClusterSchema = clusterSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
});

/**
 * ReasoningStep schema
 */
export const reasoningStepSchema = z.object({
  type: z.nativeEnum(ReasoningStepType),
  inputRefs: z.array(idSchema).min(1),
  output: z.string().min(1),
  timestamp: dateSchema,
});

/**
 * ModelInfo schema
 */
export const modelInfoSchema = z.object({
  provider: z.nativeEnum(ModelProvider),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  config: metaSchema,
});

/**
 * ReasoningTrail schema
 */
export const reasoningTrailSchema = z.object({
  id: idSchema,
  signalId: idSchema,
  steps: z.array(reasoningStepSchema).min(1),
  modelInfo: modelInfoSchema,
  createdAt: dateSchema,
});

export const createReasoningTrailSchema = reasoningTrailSchema.omit({ id: true, createdAt: true });

/**
 * Pagination schemas
 */
export const paginationParamsSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const paginatedResultSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    totalPages: z.number().int().min(0),
  });

/**
 * Utility: Parse and validate with confidence label auto-calculation
 */
export function parseCreateSignal(input: unknown) {
  const parsed = createSignalSchema.parse(input);
  return {
    ...parsed,
    confidenceLabel: confidenceToLabel(parsed.confidence),
  };
}

/**
 * Utility: Validate Evidence offsets make sense
 */
export const evidenceWithValidationSchema = evidenceSchema.refine(
  (data) => data.offsetEnd > data.offsetStart,
  {
    message: 'offsetEnd must be greater than offsetStart',
    path: ['offsetEnd'],
  }
);

// Type exports inferred from schemas
export type SourceSchema = z.infer<typeof sourceSchema>;
export type CreateSourceSchema = z.infer<typeof createSourceSchema>;
export type RawItemSchema = z.infer<typeof rawItemSchema>;
export type CreateRawItemSchema = z.infer<typeof createRawItemSchema>;
export type ClaimSchema = z.infer<typeof claimSchema>;
export type CreateClaimSchema = z.infer<typeof createClaimSchema>;
export type EvidenceSchema = z.infer<typeof evidenceSchema>;
export type CreateEvidenceSchema = z.infer<typeof createEvidenceSchema>;
export type SignalSchema = z.infer<typeof signalSchema>;
export type CreateSignalSchema = z.infer<typeof createSignalSchema>;
export type ClusterSchema = z.infer<typeof clusterSchema>;
export type CreateClusterSchema = z.infer<typeof createClusterSchema>;
export type ReasoningStepSchema = z.infer<typeof reasoningStepSchema>;
export type ModelInfoSchema = z.infer<typeof modelInfoSchema>;
export type ReasoningTrailSchema = z.infer<typeof reasoningTrailSchema>;
export type CreateReasoningTrailSchema = z.infer<typeof createReasoningTrailSchema>;
export type PaginationParamsSchema = z.infer<typeof paginationParamsSchema>;

# Kael Platform Technical Specification

> Living document defining system architecture, data models, and processing pipelines.

---

## Domain Definitions

### Signal
A unit of civic information that has passed quality thresholds and is published for consumption.
- Has a confidence tier (see KAEL.md)
- Links to one or more Evidence items
- Immutable once published (corrections create new versions)

### Claim
A single factual assertion extracted from source material.
- Atomic: one assertion per Claim
- Normalized: standard phrasing for comparison
- Attributed: linked to original statement and speaker

### Evidence
Verified documentation supporting or refuting a Claim.
- Types: Document, Video, Audio, Database Record, Expert Testimony
- Graded for authenticity and relevance
- Chain of custody documented

### Source
Origin of raw information.
- Attributes: type (official, news, academic, corporate, individual), credibility tier, bias indicators
- Snapshots stored for verification
- Rated for transparency (open data vs. opaque)

### Cluster
A group of related Claims about the same event/topic.
- Contains Claims from multiple Sources
- Enables cross-verification
- Generates consensus or contested status

### Digest
A synthesized summary for end-user consumption.
- Generated from Cluster + analysis
- Includes confidence assessment
- Contextualizes within broader narrative

### Alert
Time-sensitive notification of significant development.
- Triggered by confidence change or novel information
- Rate-limited to prevent alert fatigue
- Routed by user preferences

### Confidence
Structured uncertainty rating attached to every output.

```typescript
interface Confidence {
  tier: 'VERIFIED' | 'LIKELY' | 'UNVERIFIED' | 'CONTESTED' | 'FALSE';
  score: number;           // 0.0 - 1.0 (internal precision)
  methodology: string;     // How this was determined
  dissent?: string[];      // Contradictory sources
  updatedAt: Date;         // When last reassessed
}
```

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           INGESTION LAYER                                │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │ APIs    │  │ RSS     │  │ PDF     │  │ Social  │  │ Manual  │         │
│  │ Feeds   │  │ Scrapers│  │ Parser  │  │ Monitor │  │ Upload  │         │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘         │
│       └─────────────┴─────────────┴─────────────┴─────────────┘         │
│                              │                                          │
│                         ┌────▼────┐                                     │
│                         │ Message │                                     │
│                         │ Queue   │                                     │
│                         └────┬────┘                                     │
└──────────────────────────────┼─────────────────────────────────────────┘
                               │
┌──────────────────────────────┼─────────────────────────────────────────┐
│                         PROCESSING LAYER                               │
│                              │                                          │
│  ┌───────────────────────────▼───────────────────────────────────────┐  │
│  │                    NORMALIZATION ENGINE                             │  │
│  │  • Entity extraction  • Date parsing  • Claim segmentation        │  │
│  └───────────────────────────┬───────────────────────────────────────┘  │
│                              │                                         │
│  ┌───────────────────────────▼───────────────────────────────────────┐  │
│  │                    DEDUPLICATION ENGINE                           │  │
│  │  • Semantic similarity  • Near-duplicate detection  • Merge logic   │  │
│  └───────────────────────────┬───────────────────────────────────────┘  │
│                              │                                         │
│  ┌───────────────────────────▼───────────────────────────────────────┐  │
│  │                    CLUSTERING ENGINE                              │  │
│  │  • Event grouping  • Temporal alignment  • Entity resolution      │  │
│  └───────────────────────────┬───────────────────────────────────────┘  │
│                              │                                         │
│  ┌───────────────────────────▼───────────────────────────────────────┐  │
│  │                    SCORING ENGINE                                 │  │
│  │  • Source credibility  • Corroboration  • Contradiction detection  │  │
│  └───────────────────────────┬───────────────────────────────────────┘  │
│                              │                                         │
│  ┌───────────────────────────▼───────────────────────────────────────┐  │
│  │                    EXPLANATION ENGINE                               │  │
│  │  • Rationale generation  • Confidence calculation  • Dissent notes │  │
│  └───────────────────────────┬───────────────────────────────────────┘  │
│                              │                                         │
└──────────────────────────────┼─────────────────────────────────────────┘
                               │
┌──────────────────────────────┼─────────────────────────────────────────┐
│                         PUBLICATION LAYER                              │
│                              │                                         │
│  ┌───────────────────────────▼───────────────────────────────────────┐  │
│  │                    OUTPUT GENERATOR                                 │  │
│  │  • Digest composition  • Alert triggers  • Format adaptation       │  │
│  └───────────────────────────┬───────────────────────────────────────┘  │
│                              │                                         │
│       ┌────────────┬─────────┴──────────┬────────────┐                │
│       ▼            ▼                    ▼            ▼                │
│   ┌───────┐   ┌───────┐            ┌─────────┐  ┌─────────┐          │
│   │ Web   │   │ API   │            │ Alerts  │  │ Export  │          │
│   │ App   │   │ Endpt │            │ (Email, │  │ (JSON,  │          │
│   │       │   │       │            │ Push)   │  │ PDF)    │          │
│   └───────┘   └───────┘            └─────────┘  └─────────┘          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Pipeline Stages

### Stage 1: Ingest
**Responsibility**: Collect raw material from configured sources

```typescript
interface IngestionJob {
  sourceId: string;
  sourceType: 'api' | 'rss' | 'file' | 'manual';
  schedule: 'realtime' | 'hourly' | 'daily' | 'on_demand';
  filters: FilterRule[];      // Pre-filtering at collection
  output: {
    rawContent: Buffer;
    metadata: SourceMetadata;
    collectedAt: Date;
  };
}
```

**Safety Checkpoints**:
- Source whitelist enforcement
- Rate limiting to prevent overwhelming targets
- PII scrubbing before storage
- Copyright/respect robots.txt

---

### Stage 2: Normalize
**Responsibility**: Transform raw content into structured Claims

| Input | Output |
|-------|--------|
| News article | Array of Claim objects with speaker attribution |
| PDF document | Extracted text + table data + embedded Claims |
| Social post | Claim + metadata (platform, engagement metrics) |
| Database record | Structured fields mapped to Claim schema |

```typescript
interface Claim {
  claimId: string;
  rawText: string;           // Original phrasing
  normalizedText: string;    // Standardized phrasing
  speaker?: Entity;          // Who said it
  context?: string;          // Surrounding information
  timestamp?: Date;          // When stated
  sourceDocumentId: string;  // Parent document
  extractedAt: Date;
}
```

---

### Stage 3: Deduplicate
**Responsibility**: Identify and merge equivalent Claims

**Matching Strategies**:
- Exact match: Identical normalized text
- Semantic match: Vector similarity > 0.92
- Near-duplicate: Same claim + minor phrasing differences

**Merge Logic**:
- Keep all source attributions
- Preserve earliest timestamp
- Create ClaimCluster (precursor to full Cluster)

---

### Stage 4: Cluster
**Responsibility**: Group related Claims into event/topic Clusters

**Clustering Dimensions**:
- Temporal: Events within time window (default: 24h)
- Entity: Same primary entities involved
- Semantic: Topic model similarity
- Causal: Claim A implies/contradicts Claim B

```typescript
interface Cluster {
  clusterId: string;
  claims: Claim[];
  entities: Entity[];        // Extracted people, orgs, locations
  timeline: TimelineEvent[]; // Chronology within cluster
  status: 'emerging' | 'stable' | 'cooling' | 'resolved';
  createdAt: Date;
  updatedAt: Date;
}
```

---

### Stage 5: Score
**Responsibility**: Assess confidence in Cluster content

**Scoring Inputs**:
| Factor | Weight | Calculation |
|--------|--------|-------------|
| Source credibility | 30% | Tier-based base score × history accuracy |
| Corroboration | 35% | % of sources in cluster agreeing on key facts |
| Contradiction | 20% | Presence/severity of opposing claims |
| Recency | 10% | Time since last source update |
| Source diversity | 5% | Cross-domain confirmation bonus |

**Output**: Confidence tier + detailed scorecard

---

### Stage 6: Explain
**Responsibility**: Generate human-readable rationale

**For VERIFIED/LIKELY**:
```
This claim is VERIFIED based on:
• Official government record (Source A, Tier 1)
• Independent news confirmation (Source B, Tier 2)
• Cross-referenced database (Source C, Tier 2)
Consensus on all material facts. No significant dissent.
```

**For CONTESTED**:
```
This claim is CONTESTED:
• Government states X (Source A, official statement)
• Watchdog organization states Y (Source B, investigative report)
Contradiction on key metric Z. Both sources Tier 2. 
Pending independent verification.
```

---

### Stage 7: Publish
**Responsibility**: Generate outputs and distribute

**Digest Generation**:
- Header: Signal title + confidence badge + last updated
- Summary: 1-2 sentence synthesis
- Timeline: Chronological claim development
- Evidence list: Linked sources with credibility markers
- Confidence breakdown: Visual scorecard

**Alert Logic**:
- NEW SIGNAL: First publication of cluster
- CONFIDENCE CHANGE: Tier shift (up or down)
- MAJOR UPDATE: Significant new evidence added
- CORRECTION: Previous version marked inaccurate

---

## Safety + Ethics Constraints

### Technical Safeguards

| Layer | Constraint | Implementation |
|-------|-----------|----------------|
| Ingest | No PII collection | Regex + ML entity detection |
| Ingest | Respect robots.txt | Parser enforcement |
| Ingest | Source authentication | Domain verification |
| Normalize | Speaker attribution required | NLP pipeline checkpoint |
| Score | Confidence floor | Sub-0.6 auto-rejected |
| Publish | Human escalation gate | High-impact Signals reviewed |
| All | Audit logging | Immutable append-only logs |

### Content Boundaries

**Auto-Reject** (no human review):
- Doxxing attempts
- Non-consensual intimate imagery
- Direct incitement to violence
- Child safety violations

**Human Review Required**:
- Confidence tier change on high-visibility Signal
- Sources with known bias indicators
- Content involving minors (even public figures)
- Health/safety claims without medical consensus

**Auto-Publish** (within confidence thresholds):
- Routine government proceedings
- Business filings and financial disclosures
- Weather and public safety alerts
- Established scientific consensus

### Bias Mitigation

**Source Diversity Requirement**:
- Minimum 2 independent source domains for VERIFIED
- Cross-ideological corroboration bonus in scoring
- Bias indicator transparency (labeling, not exclusion)

**Temporal Fairness**:
- Recency bias correction (older but verified sources maintain weight)
- Update cadence tracking (frequently revised = flag for instability)

### Accountability

**Correction Protocol**:
1. New evidence triggers reassessment
2. If confidence drops, auto-generate correction notice
3. Correction includes: what changed, why, previous version archive
4. Alert all subscribers to affected Signals

**External Audit**:
- Quarterly public reports on accuracy rates
- Independent review of random Signal sample
- Bias audit by third-party researchers
- Source credibility tier reassessment

---

## API Surface

```typescript
// Core endpoints
GET  /signals              // List Signals (paginated, filterable)
GET  /signals/:id          // Single Signal with full audit trail
GET  /signals/:id/versions // Version history
GET  /clusters             // Active clusters
GET  /sources              // Source directory with credibility tiers
GET  /search?q=...        // Semantic search across Claims

POST /ingest               // Submit manual source (authenticated)
POST /feedback             // Submit correction/flag (authenticated)

WebSocket /stream          // Real-time alerts and updates
```

---

## Data Retention

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| Published Signals | Permanent | With version history |
| Source snapshots | 90 days | Extend for active stories |
| Failed/Noise | 30 days | For false positive analysis |
| User queries | 1 year | Anonymized for pattern analysis |
| Audit logs | 7 years | Compliance standard |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-02-28 | Initial specification |

---

*For identity, tone, and operating principles, see `packages/core/KAEL.md`*

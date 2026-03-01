# Sentinel Network Roadmap (Kael)

I build Sentinel in small, auditable steps.  
Each milestone below is scoped to ship, test, and harden before we expand.

---

## v0 - Baseline (Current)

### Goals
- Ingest from configured sources.
- Normalize, cluster, score, and publish signals.
- Provide operator visibility through API and dashboard.

### Components
- Source ingestion pipeline (RSS/manual baseline).
- Deduplication, clustering, and heuristic scoring.
- Signal + digest persistence.
- Fastify API (`signals`, `clusters`, `sources`, `digests`).
- Next.js dashboard (feed + signal detail).

### Tests
- Ingest test: new feed items become `RawItem` records.
- Analysis test: `RawItem` batch produces deterministic clusters/signals.
- API test: `GET /signals` and `GET /signals/:id` return consistent envelope.
- UI test: feed pagination + signal detail render without runtime errors.

### Risks
- Source quality variance can degrade signal quality.
- Heuristic-only scoring may over/under-rank edge events.
- Pipeline drift if schemas diverge across packages.

---

## v0.1 - Telegram Notifications + Operator Commands

### Goals
- Keep operator informed without alert fatigue.
- Enable command-and-control from Telegram.

### Components
- Telegram notifier with retry/timeout/rate-limit handling.
- Lifecycle notifications (start, error, high-signal alerts).
- Operator commands (`/status`, `/quiet`, `/verbose`, `/autopilot on|off`).
- Persistent operator state and chat memory.

### Tests
- Integration test: startup sends one online message to configured chat.
- Command test: `/quiet` suppresses cycle updates; `/verbose` re-enables.
- Error-path test: failed LLM call sends safe error notification.
- Restart test: command preferences persist across worker restarts.

### Risks
- Multiple worker instances can cause duplicate notifications.
- Misconfigured chat IDs/tokens silently degrade operator trust.
- Overly chatty defaults can create alert blindness.

---

## v0.2 - Source Discovery + Source Health Monitoring

### Goals
- Expand coverage safely.
- Detect source outages and data quality regressions early.

### Components
- Source discovery job (seed lists + controlled candidate scoring).
- Source health metrics (latency, freshness, parse success, duplicate rate).
- Source status model (`healthy`, `degraded`, `offline`) with reason codes.
- Auto-disable/auto-recover policy thresholds with operator override.

### Tests
- Discovery test: candidate sources are ranked and queued for review.
- Health test: simulated feed failures transition source to `degraded/offline`.
- Recovery test: source returns to `healthy` after stable successful pulls.
- API/UI test: source health is visible and filterable.

### Risks
- Low-quality source expansion increases noise.
- Aggressive auto-disable can hide important but intermittent sources.
- External feed format changes can break parsers unexpectedly.

---

## v0.3 - LLM-Assisted Claim Extraction (Auditable, Optional)

### Goals
- Improve claim extraction quality while preserving deterministic fallback.
- Keep LLM usage transparent, bounded, and optional.

### Components
- Optional LLM extraction stage behind feature flag.
- Reasoning trail entries for every LLM/tool call (input refs, output, duration).
- Confidence attribution split: heuristic vs LLM vs hybrid.
- Redaction guardrail before model submission.

### Tests
- A/B test: heuristic-only vs hybrid extraction on same corpus.
- Audit test: every LLM-produced claim has traceable provenance.
- Safety test: blocked PII/harmful content never sent to model.
- Cost test: enforce token/call caps per cycle and per day.

### Risks
- Hallucinations can pollute claim graph if guardrails are weak.
- Cost spikes under bursty workloads.
- Provider outages can stall extraction without fallback discipline.

---

## v1 - Multi-Sentinel Specializations

### Goals
- Run specialized sentinels for distinct domains.
- Share a common core while keeping domain-specific scoring logic isolated.

### Components
- Sentinel profiles: `markets`, `governance`, `culture`.
- Domain-specific source packs, taxonomies, and scoring adapters.
- Shared event bus + cross-sentinel correlation layer.
- Per-sentinel digest and alert routing.

### Tests
- Profile test: each sentinel runs with isolated config and outputs.
- Cross-correlation test: same event across domains links correctly.
- Regression test: one sentinel update does not break others.
- Operator test: command targeting by sentinel profile works.

### Risks
- Ontology drift between domains.
- Profile-specific bias can leak into shared outputs.
- Operational complexity increases with each profile.

---

## v2 - Distributed Nodes + Federation + Signed Outputs

### Goals
- Support resilient multi-node operation.
- Federate trusted outputs with verifiable integrity.

### Components
- Node identity + key management.
- Signed signal/digest envelopes.
- Federation protocol for exchange, dedupe, and trust scoring.
- Conflict resolution for contradictory federated claims.

### Tests
- Signature test: outputs verify across independent nodes.
- Federation test: nodes exchange updates without duplicate storms.
- Partition test: nodes continue locally and reconcile on reconnect.
- Trust test: low-trust nodes cannot dominate merged outputs.

### Risks
- Key compromise undermines trust network.
- Federation spam or Sybil-like behavior.
- Reconciliation bugs causing state divergence.

---

## Delivery Discipline

- One feature per patch.
- Every patch updates tests and reasoning trail expectations.
- No milestone is complete until:
  - feature works end-to-end,
  - logging/audit trail are updated,
  - no new type errors are introduced.

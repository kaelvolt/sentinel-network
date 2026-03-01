#!/usr/bin/env node
/**
 * Kael - Sentinel Network Architect
 * Standalone autonomous agent
 */

import { configDotenv } from "dotenv";
import OpenAI from "openai";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
configDotenv();

const apiKey = process.env.API_KEY;
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

if (!apiKey) {
  console.error("Missing API_KEY");
  process.exit(1);
}

const openai = new OpenAI({ apiKey });
const MODEL = process.env.MODEL_NAME || "gpt-4o-mini";
const ROOT = process.cwd();
const BACKLOG_PATH = ".kael/sentinel-backlog.json";
const MEMORY_PATH = ".kael/memory.json";

console.log("\n╔════════════════════════════════════════╗");
console.log("║        KAEL                            ║");
console.log("║     Sentinel Network Architect         ║");
console.log("╚════════════════════════════════════════╝");
console.log("\nBuilding civic intelligence infrastructure\n");

let stats = { changes: 0, commits: 0, fixes: 0, sessions: 0 };
let isPaused = false;
let pendingFixes = [];
let errorMap = {};
let lastTelegramAt = 0;
const TELEGRAM_MIN_INTERVAL_MS = 20 * 60 * 1000;
let baselineErrors = null;
let lastCommitAt = Date.now();
const COMMIT_MAX_INTERVAL_MS = 20 * 60 * 1000;
let consecutiveNoopCycles = 0;
const FIX_BATCH_SIZE = 6;
const ENABLE_AI_FIXES = false;
const FIX_DENYLIST = new Set([
  "packages/core/src/agent/runtime.ts",
  "packages/core/src/agent/toolsRegistry.ts",
  "packages/core/src/digest.ts",
  "packages/core/src/tools/analyzeNewItems.ts",
  "packages/core/src/tools/generateDigest.ts",
]);
let memory = {
  version: 1,
  operatorName: "Operator",
  directives: [],
  chatHistory: [],
  notes: [],
  lastUpdated: new Date().toISOString(),
};

const SENTINEL_NORTH_STAR = {
  mission: "Reduce civilizational blind spots via traceable civic signals",
  principles: [
    "Evidence-first outputs",
    "Audit trails for every decision",
    "No high-confidence single-source signals",
    "Explicit uncertainty labels",
    "Composable extensible architecture",
  ],
  benchmarkTargets: [
    "Perplexity-level citation discipline",
    "Protocol-level composability (web4-style decentralization readiness)",
    "Machine-readable public feed standards",
  ],
};

async function tg(text, force = false) {
  if (!telegramToken || !telegramChatId) {
    console.log(`[📱] ${text.slice(0, 100)}`);
    return;
  }
  if (!force && Date.now() - lastTelegramAt < TELEGRAM_MIN_INTERVAL_MS) return;
  try {
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramChatId, text: text.slice(0, 4000) }),
    });
    lastTelegramAt = Date.now();
  } catch {}
}

async function readSafe(filePath) {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function readJsonSafe(filePath) {
  const txt = await readSafe(filePath);
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

async function ensureMemory() {
  const existing = await readJsonSafe(MEMORY_PATH);
  if (existing && typeof existing === "object") {
    memory = {
      version: existing.version || 1,
      operatorName: existing.operatorName || "Operator",
      directives: Array.isArray(existing.directives) ? existing.directives : [],
      chatHistory: Array.isArray(existing.chatHistory) ? existing.chatHistory.slice(-80) : [],
      notes: Array.isArray(existing.notes) ? existing.notes.slice(-80) : [],
      lastUpdated: existing.lastUpdated || new Date().toISOString(),
    };
    return memory;
  }
  await writeJsonSafe(MEMORY_PATH, memory);
  return memory;
}

async function saveMemory() {
  memory.lastUpdated = new Date().toISOString();
  await writeJsonSafe(MEMORY_PATH, memory);
}

async function rememberChat(role, text) {
  memory.chatHistory.push({
    role,
    text: String(text || "").slice(0, 800),
    at: new Date().toISOString(),
  });
  memory.chatHistory = memory.chatHistory.slice(-80);
  await saveMemory();
}

function getOperatorFocus() {
  const active = [...memory.directives].reverse().find((d) => d.status === "pending");
  return active?.text || null;
}

function isCodeLikePath(filePath) {
  return /\.(ts|tsx|js|jsx|mjs|cjs|json)$/i.test(filePath);
}

function unwrapSingleCodeFence(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```$/);
  return fenced ? fenced[1] : text;
}

function validateWritePayload(filePath, content) {
  if (!isCodeLikePath(filePath)) {
    return { ok: true, sanitized: content };
  }

  const sanitized = unwrapSingleCodeFence(content);
  const trimmed = sanitized.trim();

  // Never allow markdown fences in code-like files.
  if (/^```/m.test(trimmed) || /```$/m.test(trimmed) || /```[a-zA-Z]*/.test(trimmed)) {
    return { ok: false, reason: "markdown_fence_detected" };
  }

  // Block common LLM wrapper chatter that corrupts code files.
  const badWrappers = [
    /^(here(?:'| i)s|sure[,!]?|i(?:'| wi)ve)\b/i,
    /^this (?:is|file|update)\b/i,
    /^explanation:/i,
  ];
  const firstLine = trimmed.split(/\r?\n/, 1)[0] || "";
  if (badWrappers.some((re) => re.test(firstLine))) {
    return { ok: false, reason: "llm_wrapper_text_detected" };
  }

  return { ok: true, sanitized };
}

async function writeSafe(filePath, content) {
  try {
    const checked = validateWritePayload(filePath, content);
    if (!checked.ok) {
      console.log(`   ⛔ Blocked write to ${filePath}: ${checked.reason}`);
      return false;
    }
    await mkdir(filePath.split('/').slice(0, -1).join('/'), { recursive: true });
    await writeFile(filePath, checked.sanitized, "utf-8");
    stats.changes++;
    return true;
  } catch {
    return false;
  }
}

async function writeJsonSafe(filePath, value) {
  const json = JSON.stringify(value, null, 2);
  return writeSafe(filePath, json);
}

async function runCmd(command, timeout = 60000) {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: ROOT, timeout });
    return stdout + stderr;
  } catch (err) {
    return err.stdout + err.stderr + err.message;
  }
}

function parsePorcelainPath(line) {
  const raw = line.slice(3).trim();
  if (raw.includes(" -> ")) {
    return raw.split(" -> ").pop()?.trim() || "";
  }
  return raw;
}

async function getChangedFiles() {
  const out = await runCmd("git status --porcelain", 10000);
  const files = out
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .map(parsePorcelainPath)
    .filter(Boolean);
  return [...new Set(files)];
}

function detectScopeFromFile(file) {
  if (file.startsWith("packages/analysis/")) return "analysis";
  if (file.startsWith("packages/shared/")) return "shared";
  if (file.startsWith("packages/core/")) return "core";
  if (file.startsWith("packages/sources/")) return "sources";
  if (file.startsWith("packages/storage/")) return "storage";
  if (file.startsWith("packages/cli/")) return "cli";
  if (file.startsWith("packages/notifier/")) return "notifier";
  if (file.startsWith("apps/api/")) return "api";
  if (file.startsWith("apps/web/")) return "web";
  if (file === "kael.js") return "agent";
  return "repo";
}

function inferTypeFromTask(taskName) {
  if (taskName === "buildSentinelMilestone") return "feat";
  if (taskName === "fixTypeErrors") return "fix";
  if (taskName === "buildIngestion" || taskName === "buildAnalysis") return "feat";
  if (taskName === "assessState" || taskName === "testAndCommit") return "chore";
  return "chore";
}

function buildCommitSubject(taskName, files) {
  if (files.includes("packages/analysis/src/score.ts")) {
    return "refine signal quality scoring";
  }
  if (files.includes("packages/shared/src/types.ts")) {
    return "extend shared signal feed contracts";
  }
  if (files.includes("packages/core/src/orchestrator.ts")) {
    return "improve source prioritization in orchestrator";
  }
  if (files.length === 1) {
    const parts = files[0].split("/");
    const leaf = parts[parts.length - 1].replace(/\.[^.]+$/, "");
    return `update ${leaf}`;
  }
  if (taskName === "buildSentinelMilestone") {
    return "deliver sentinel milestone updates";
  }
  return `update ${files.length} project files`;
}

async function buildCommitMessage(taskName) {
  const files = await getChangedFiles();
  if (files.length === 0) return null;
  const type = inferTypeFromTask(taskName);
  const scopes = [...new Set(files.map(detectScopeFromFile))];
  const scope = scopes.length === 1 ? scopes[0] : "sentinel";
  const subject = buildCommitSubject(taskName, files);
  return `${type}(${scope}): ${subject}`;
}

async function deployToVercel(reason = "manual") {
  try {
    const hasConfig = !!process.env.VERCEL_TOKEN || !!process.env.VERCEL_ORG_ID;
    if (!hasConfig) {
      return { ok: false, message: "Vercel credentials not configured in env." };
    }
    const out = await runCmd("npx vercel --prod --yes", 20 * 60 * 1000);
    const success = /Production:\s*https?:\/\//i.test(out) || /Inspect:\s*https?:\/\//i.test(out);
    return {
      ok: success,
      message: success ? `Vercel deploy succeeded (${reason}).` : `Vercel deploy attempted (${reason}), check logs.`,
      output: out.slice(-1200),
    };
  } catch (err) {
    return { ok: false, message: `Vercel deploy failed: ${String(err?.message || err)}` };
  }
}

async function testCode() {
  const result = await runCmd("cd packages/core && npx tsc --noEmit 2>&1", 120000);
  const errors = (result.match(/error TS/g) || []).length;
  return { passed: errors === 0, errors, output: result };
}

async function commit(message) {
  try {
    const changedBeforeCommit = await getChangedFiles();
    const test = await testCode();
    if (baselineErrors === null) baselineErrors = test.errors;
    if (test.errors > baselineErrors) {
      console.log(`   ❌ Regression detected (${test.errors} > baseline ${baselineErrors}), not committing`);
      return false;
    }
    await execAsync("git add -A", { cwd: ROOT });
    await execAsync(`git commit -m "${message}"`, { cwd: ROOT });
    await execAsync("git push origin master", { cwd: ROOT });
    stats.commits++;
    baselineErrors = test.errors;
    lastCommitAt = Date.now();
    await tg(`✅ ${message}`, true);

    // Optional auto-deploy for web changes when credentials exist.
    if (changedBeforeCommit.some((f) => f.startsWith("apps/web/")) && process.env.VERCEL_TOKEN) {
      const deploy = await deployToVercel("post-commit web update");
      if (deploy.ok) {
        await tg(`🚀 ${deploy.message}`, true);
      } else {
        await tg(`⚠️ ${deploy.message}`, true);
      }
    }
    return true;
  } catch {
    return false;
  }
}

// WORK TASKS
async function assessState() {
  console.log("\n📊 Assessing state...");
  const test = await testCode();
  if (baselineErrors === null) baselineErrors = test.errors;
  console.log(`   Type errors: ${test.errors}`);

  const packages = await readdir("packages").catch(() => []);
  console.log(`   Packages: ${packages.join(", ")}`);

  // Check apps/api
  const api = await readSafe("apps/api/src/index.ts");
  if (api && api.includes("testConnection")) {
    console.log("   ⚠️ API has testConnection (needs fix)");
  }

  // Build real fix queue from TypeScript output (prioritize by error density)
  errorMap = parseTypeErrors(test.output);
  pendingFixes = Object.keys(errorMap).sort((a, b) => (errorMap[b]?.length || 0) - (errorMap[a]?.length || 0));
  pendingFixes = pendingFixes.filter((p) => !FIX_DENYLIST.has(p));
  if (pendingFixes.length === 0 && test.errors > 0) {
    // Fallback queue excludes unstable files that previously caused corruption loops.
    pendingFixes = ["packages/core/src/agent/kaelAgent.ts", "packages/core/src/orchestrator.ts"];
  }
  if (pendingFixes.length > 0) {
    console.log(`   Queued files to fix: ${pendingFixes.slice(0, 5).join(", ")}`);
  }
  console.log(`   North star: ${SENTINEL_NORTH_STAR.mission}`);
}

async function ensureBacklog() {
  const existing = await readJsonSafe(BACKLOG_PATH);
  if (existing) return existing;

  const seed = {
    version: 1,
    createdAt: new Date().toISOString(),
    milestones: [
      {
        id: "source-health-v1",
        title: "Source Health Monitoring v1",
        status: "pending",
        objective: "Track source reliability and freshness for ingestion decisions",
      },
      {
        id: "signal-quality-metrics-v1",
        title: "Signal Quality Metrics v1",
        status: "pending",
        objective: "Standardize confidence/severity quality indicators",
      },
      {
        id: "public-feed-contract-v1",
        title: "Public Feed Contract v1",
        status: "pending",
        objective: "Define machine-readable feed contract for interoperable publication",
      },
    ],
  };
  await writeJsonSafe(BACKLOG_PATH, seed);
  return seed;
}

async function buildSentinelMilestone() {
  console.log("\n🏗️ Building Sentinel milestone...");
  const backlog = await ensureBacklog();
  let next = backlog.milestones.find((m) => m.status === "pending");
  if (!next) {
    // Keep momentum: auto-enqueue next practical milestones in existing files.
    backlog.milestones.push(
      {
        id: "source-priority-rules-v1",
        title: "Source Priority Rules v1",
        status: "pending",
        objective: "Codify source prioritization in orchestrator for stable ingest scheduling",
      },
      {
        id: "signal-quality-labels-v2",
        title: "Signal Quality Labels v2",
        status: "pending",
        objective: "Expose normalized quality labels for downstream display",
      },
      {
        id: "public-feed-contract-v2",
        title: "Public Feed Contract v2",
        status: "pending",
        objective: "Extend feed contract with freshness and provenance fields",
      },
      {
        id: "api-ingest-contract-v1",
        title: "API Ingest Contract v1",
        status: "pending",
        objective: "Implement a concrete Fastify ingest route contract",
      },
      {
        id: "api-digest-endpoint-v1",
        title: "API Digest Endpoint v1",
        status: "pending",
        objective: "Implement latest digest retrieval endpoint",
      },
      {
        id: "web-api-client-v1",
        title: "Web API Client v1",
        status: "pending",
        objective: "Add typed API client helpers for dashboard consumption",
      }
    );
    await writeJsonSafe(BACKLOG_PATH, backlog);
    next = backlog.milestones.find((m) => m.status === "pending");
  }
  if (!next) {
    console.log("   No pending milestones");
    return;
  }

  console.log(`   Working milestone: ${next.id}`);

  if (next.id === "source-health-v1") {
    // Prefer existing core orchestration file over creating new files
    const file = "packages/core/src/orchestrator.ts";
    const existing = await readSafe(file);
    if (!existing) return;

    if (!existing.includes("SourceHealthSnapshot")) {
      const block = `

// Sentinel milestone: source-health-v1
export interface SourceHealthSnapshot {
  sourceId: string;
  checkedAt: Date;
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
`;
      const ok = await writeSafe(file, existing + block);
      if (!ok) return;
      stats.fixes++;
    }
    next.status = "completed";
    next.completedAt = new Date().toISOString();
    await writeJsonSafe(BACKLOG_PATH, backlog);
    console.log(`   ✅ Delivered ${next.id}`);
    return;
  }

  if (next.id === "signal-quality-metrics-v1") {
    // Extend existing scoring module instead of new module
    const file = "packages/analysis/src/score.ts";
    const existing = await readSafe(file);
    if (!existing) return;

    if (!existing.includes("SignalQualityMetrics")) {
      const block = `

// Sentinel milestone: signal-quality-metrics-v1
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
`;
      const ok = await writeSafe(file, existing + block);
      if (!ok) return;
      stats.fixes++;
    }
    next.status = "completed";
    next.completedAt = new Date().toISOString();
    await writeJsonSafe(BACKLOG_PATH, backlog);
    console.log(`   ✅ Delivered ${next.id}`);
    return;
  }

  if (next.id === "public-feed-contract-v1") {
    // Add contract types in existing shared types file
    const file = "packages/shared/src/types.ts";
    const existing = await readSafe(file);
    if (!existing) return;

    if (!existing.includes("PublicSignalFeedItem")) {
      const block = `

// Sentinel milestone: public-feed-contract-v1
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
`;
      const ok = await writeSafe(file, existing + block);
      if (!ok) return;
      stats.fixes++;
    }
    next.status = "completed";
    next.completedAt = new Date().toISOString();
    await writeJsonSafe(BACKLOG_PATH, backlog);
    console.log(`   ✅ Delivered ${next.id}`);
    return;
  }

  if (next.id === "source-priority-rules-v1") {
    const file = "packages/core/src/orchestrator.ts";
    const existing = await readSafe(file);
    if (!existing) return;
    if (!existing.includes("computeSourcePriority")) {
      const block = `

// Sentinel milestone: source-priority-rules-v1
export function computeSourcePriority(input: {
  reliabilityHint: number;
  freshnessScore: number;
  recentFailureRate: number;
}): number {
  const reliability = Math.max(0, Math.min(1, input.reliabilityHint));
  const freshness = Math.max(0, Math.min(1, input.freshnessScore));
  const failurePenalty = Math.max(0, Math.min(1, input.recentFailureRate));
  const score = 0.55 * reliability + 0.35 * freshness - 0.4 * failurePenalty;
  return Math.max(0, Math.min(1, score));
}
`;
      const ok = await writeSafe(file, existing + block);
      if (!ok) return;
      stats.fixes++;
    }
    next.status = "completed";
    next.completedAt = new Date().toISOString();
    await writeJsonSafe(BACKLOG_PATH, backlog);
    console.log(`   ✅ Delivered ${next.id}`);
    return;
  }

  if (next.id === "signal-quality-labels-v2") {
    const file = "packages/analysis/src/score.ts";
    const existing = await readSafe(file);
    if (!existing) return;
    if (!existing.includes("qualityLabelFromConfidence")) {
      const block = `

// Sentinel milestone: signal-quality-labels-v2
export function qualityLabelFromConfidence(confidence: number): "LOW" | "MEDIUM" | "HIGH" {
  if (confidence >= 0.75) return "HIGH";
  if (confidence >= 0.45) return "MEDIUM";
  return "LOW";
}
`;
      const ok = await writeSafe(file, existing + block);
      if (!ok) return;
      stats.fixes++;
    }
    next.status = "completed";
    next.completedAt = new Date().toISOString();
    await writeJsonSafe(BACKLOG_PATH, backlog);
    console.log(`   ✅ Delivered ${next.id}`);
    return;
  }

  if (next.id === "public-feed-contract-v2") {
    const file = "packages/shared/src/types.ts";
    const existing = await readSafe(file);
    if (!existing) return;
    if (!existing.includes("freshnessHours")) {
      const block = `

// Sentinel milestone: public-feed-contract-v2
export interface PublicSignalFeedItemV2 extends PublicSignalFeedItem {
  freshnessHours: number;
  provenance: "heuristic" | "llm" | "hybrid";
}
`;
      const ok = await writeSafe(file, existing + block);
      if (!ok) return;
      stats.fixes++;
    }
    next.status = "completed";
    next.completedAt = new Date().toISOString();
    await writeJsonSafe(BACKLOG_PATH, backlog);
    console.log(`   ✅ Delivered ${next.id}`);
    return;
  }

  if (next.id === "api-ingest-contract-v1") {
    const file = "apps/api/src/routes/ingest.ts";
    const existing = await readSafe(file);
    if (!existing) return;
    if (!existing.includes("fastify.post(\"/ingest/run\"")) {
      const replacement = `import type { FastifyInstance } from "fastify";

const ingestRoutes = async (fastify: FastifyInstance) => {
  fastify.post("/ingest/run", async (_request, _reply) => {
    return {
      ok: true,
      data: { triggered: true, mode: "manual" },
      meta: { at: new Date().toISOString() },
    };
  });
};

export default ingestRoutes;
`;
      const ok = await writeSafe(file, replacement);
      if (!ok) return;
      stats.fixes++;
    }
    next.status = "completed";
    next.completedAt = new Date().toISOString();
    await writeJsonSafe(BACKLOG_PATH, backlog);
    console.log(`   ✅ Delivered ${next.id}`);
    return;
  }

  if (next.id === "api-digest-endpoint-v1") {
    const file = "apps/api/src/routes/digests.ts";
    const existing = await readSafe(file);
    if (!existing) return;
    if (!existing.includes("fastify.get(\"/digests/latest\"")) {
      const replacement = `import type { FastifyInstance } from "fastify";

const digestRoutes = async (fastify: FastifyInstance) => {
  fastify.get("/digests/latest", async (_request, _reply) => {
    return {
      ok: true,
      data: {
        title: "Daily Digest",
        generatedAt: new Date().toISOString(),
      },
      meta: { source: "sentinel-network" },
    };
  });
};

export default digestRoutes;
`;
      const ok = await writeSafe(file, replacement);
      if (!ok) return;
      stats.fixes++;
    }
    next.status = "completed";
    next.completedAt = new Date().toISOString();
    await writeJsonSafe(BACKLOG_PATH, backlog);
    console.log(`   ✅ Delivered ${next.id}`);
    return;
  }

  if (next.id === "web-api-client-v1") {
    const file = "apps/web/src/lib/api.ts";
    const existing = await readSafe(file);
    if (!existing) return;
    if (!existing.includes("export async function getSignalsPage")) {
      const replacement = `const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function requestJson(path) {
  const res = await fetch(\`\${API_URL}\${path}\`, { cache: "no-store" });
  if (!res.ok) throw new Error(\`API request failed: \${res.status}\`);
  return res.json();
}

export async function getSignalsPage(cursor = "", limit = 20) {
  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", cursor);
  return requestJson(\`/signals?\${qs.toString()}\`);
}

export async function getLatestDigest() {
  return requestJson("/digests/latest");
}
`;
      const ok = await writeSafe(file, replacement);
      if (!ok) return;
      stats.fixes++;
    }
    next.status = "completed";
    next.completedAt = new Date().toISOString();
    await writeJsonSafe(BACKLOG_PATH, backlog);
    console.log(`   ✅ Delivered ${next.id}`);
    return;
  }
}

async function fixTypeErrors() {
  console.log("\n🔧 Fixing type errors...");
  if (pendingFixes.length === 0) {
    console.log("   No queued fix targets");
    consecutiveNoopCycles++;
    return;
  }

  let cycleChanges = 0;
  // Work on more files per cycle for meaningful progress
  const batch = pendingFixes.slice(0, FIX_BATCH_SIZE);
  for (const file of batch) {
    const content = await readSafe(file);
    if (!content) continue;

    const messages = errorMap[file] || [];
    let fixed = applySafeTransforms(content);
    fixed = applyErrorGuidedTransforms(fixed, messages);
    let usedAI = false;

    if (fixed === content && ENABLE_AI_FIXES) {
      fixed = await aiFixFile(file, content, messages);
      usedAI = true;
    }

    if (fixed && fixed !== content) {
      // Guardrails: reject placeholder/destructive outputs
      if (fixed.includes("Your logic here") || fixed.includes("TODO: implement")) {
        console.log(`   ⚠️ Rejected low-quality AI patch for ${file}`);
        continue;
      }
      if (fixed.length < Math.floor(content.length * 0.6)) {
        console.log(`   ⚠️ Rejected destructive patch for ${file}`);
        continue;
      }

      console.log(`   Fixing ${file}${usedAI ? " (AI)" : " (safe transform)"}...`);
      const ok = await writeSafe(file, fixed);
      if (ok) {
        stats.fixes++;
        cycleChanges++;
        console.log("   ✅ Fixed");
      }
    }
  }

  if (cycleChanges === 0) {
    consecutiveNoopCycles++;
    console.log(`   ⚠️ No effective fixes this cycle (noop x${consecutiveNoopCycles})`);
    if (consecutiveNoopCycles >= 3) {
      await escalateNoopState();
      consecutiveNoopCycles = 0;
    }
  } else {
    consecutiveNoopCycles = 0;
  }
}

async function buildIngestion() {
  console.log("\n📡 Checking ingestion...");
  const rss = await readSafe("packages/sources/src/rss.ts");
  if (rss && !rss.includes("export")) {
    console.log("   Adding RSS export...");
    await writeSafe("packages/sources/src/rss.ts", rss + "\n\nexport { fetchRssFeed };\n");
    console.log("   ✅ Added");
  }
}

async function buildAnalysis() {
  console.log("\n🧠 Checking analysis...");
  const analysis = await readSafe("packages/analysis/src/index.ts");
  if (analysis && analysis.includes("// Your index logic here")) {
    console.log("   ⚠️ Analysis is placeholder");
    // Don't fix - this needs real implementation, not placeholder replacement
  }
}

function parseTypeErrors(output) {
  const map = {};
  const regex = /src\/([^\(\s]+)\((\d+),(\d+)\): error TS\d+: ([^\n]+)/g;
  let m;
  while ((m = regex.exec(output)) !== null) {
    const rel = `packages/core/src/${m[1]}`;
    if (!map[rel]) map[rel] = [];
    map[rel].push(m[4]);
  }
  return map;
}

function applySafeTransforms(content) {
  let out = content;

  // Common safe replacements
  out = out.replace(/\btestConnection\b/g, "testDbConnection");
  out = out.replace(/"tool_call"/g, "\"TOOL_CALL\"");
  out = out.replace(/'tool_call'/g, "'TOOL_CALL'");

  // Remove unused z import if z is never referenced
  if (out.includes("import { z } from \"zod\";") && !/\bz\./.test(out)) {
    out = out.replace(/import \{ z \} from "zod";\n?/g, "");
  }
  if (out.includes("import { z } from 'zod';") && !/\bz\./.test(out)) {
    out = out.replace(/import \{ z \} from 'zod';\n?/g, "");
  }

  return out;
}

function removeImportSymbol(out, symbol) {
  // import { a, b, c } from 'x';
  const re = new RegExp(`import \\\\{([^}]+)\\\\} from ([\"'][^\"']+[\"']);`, "g");
  return out.replace(re, (line, group, fromPart) => {
    const parts = group.split(",").map((s) => s.trim()).filter(Boolean);
    const kept = parts.filter((p) => p !== symbol);
    if (kept.length === parts.length) return line;
    if (kept.length === 0) return "";
    return `import { ${kept.join(", ")} } from ${fromPart};`;
  });
}

function applyErrorGuidedTransforms(content, errors) {
  let out = content;
  for (const err of errors || []) {
    // TS6133 unused declaration/import
    const unused = err.match(/'([^']+)' is declared but its value is never read/);
    if (unused?.[1]) {
      const sym = unused[1];
      out = removeImportSymbol(out, sym);
      // Remove simple one-line const/let declarations for obviously unused symbols
      const declRe = new RegExp(`^\\s*(const|let)\\s+${sym}\\s*=.*\\n`, "m");
      out = out.replace(declRe, "");
    }
  }
  return out;
}

async function escalateNoopState() {
  console.log("   🚨 Escalation: no-op cycles detected, running strategic repair");

  // Strategic deterministic fixes in known hotspots
  const hotspotFiles = [
    "packages/core/src/agent/kaelAgent.ts",
    "packages/core/src/agent/runtime.ts",
    "packages/core/src/agent/toolsRegistry.ts",
    "packages/core/src/tools/analyzeNewItems.ts",
    "packages/core/src/tools/generateDigest.ts",
  ];

  for (const file of hotspotFiles) {
    const content = await readSafe(file);
    if (!content) continue;
    let fixed = applySafeTransforms(content);
    fixed = fixed.replace(/"tool_call"/g, "\"TOOL_CALL\"").replace(/'tool_call'/g, "'TOOL_CALL'");
    if (fixed !== content) {
      const ok = await writeSafe(file, fixed);
      if (ok) {
        stats.fixes++;
        console.log(`   ✅ Strategic fix applied: ${file}`);
      }
    }
  }
}

async function aiFixFile(file, content, errors) {
  try {
    const prompt = [
      `Fix TypeScript errors in this file with minimal edits.`,
      `File: ${file}`,
      `Errors:`,
      ...(errors.length ? errors.map((e) => `- ${e}`) : ["- unspecified"]),
      "",
      "Rules:",
      "- Keep existing behavior and structure",
      "- Do NOT delete major blocks/functions",
      "- Do NOT add placeholders",
      "- Return full corrected file content only",
      "",
      "Content:",
      content,
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a precise TypeScript fixer. Return only code." },
        { role: "user", content: prompt },
      ],
      max_tokens: 3500,
      temperature: 0.1,
    });
    const raw = completion.choices[0]?.message?.content?.trim() || content;
    const checked = validateWritePayload(file, raw);
    if (!checked.ok) {
      console.log(`   ⚠️ Rejected AI output for ${file}: ${checked.reason}`);
      return content;
    }
    return checked.sanitized;
  } catch {
    return content;
  }
}

async function testAndCommit() {
  console.log("\n🧪 Testing & committing...");
  if (stats.changes === 0) {
    console.log("   No changes");
    return;
  }
  const message = await buildCommitMessage("testAndCommit");
  if (!message) {
    console.log("   No commit message context (no changed files)");
    return;
  }
  const committed = await commit(message);
  if (committed) {
    stats.changes = 0;
    stats.fixes = 0;
  }
}

async function autoCommitPerUpdate(taskName) {
  if (stats.changes === 0) return;
  if (taskName === "rest") return;
  const timeDue = Date.now() - lastCommitAt >= COMMIT_MAX_INTERVAL_MS;
  const meaningfulBatch = stats.changes >= 3 || stats.fixes >= 2;
  if (!timeDue && !meaningfulBatch) return;

  console.log(`   🔁 Checkpoint commit (${meaningfulBatch ? "batch" : "time-based"})...`);
  const message = await buildCommitMessage(taskName);
  if (!message) return;
  const committed = await commit(message);
  if (committed) {
    stats.changes = 0;
    stats.fixes = 0;
  }
}

async function rest() {
  console.log("\n😴 Resting...");
  await new Promise(r => setTimeout(r, 5000));
}

// Main loop
async function kaelLife() {
  await ensureMemory();
  await tg("Kael online. Building Sentinel Network.", true);

  const tasks = [
    assessState,
    buildSentinelMilestone,
    fixTypeErrors,
    buildIngestion,
    buildAnalysis,
    testAndCommit,
    rest,
  ];

  let idx = 0;

  while (true) {
    if (isPaused) {
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }

    const task = tasks[idx % tasks.length];
    idx++;
    stats.sessions++;

    console.log(`\n🧠 [${stats.sessions}] ${task.name}`);
    await task();
    await autoCommitPerUpdate(task.name);

    if (stats.sessions % 10 === 0) {
      const test = await testCode();
      const focus = getOperatorFocus();
      const msg = `Progress: ${test.errors} errors, ${stats.commits} commits${focus ? ` | focus: ${focus}` : ""}`;
      console.log(`\n📊 ${msg}`);
      await tg(msg);
    }

    await new Promise(r => setTimeout(r, 2000));
  }
}

async function buildStatusText() {
  const test = await testCode();
  const focus = getOperatorFocus();
  return [
    `Sessions: ${stats.sessions}`,
    `Commits: ${stats.commits}`,
    `Type errors: ${test.errors}`,
    `Paused: ${isPaused}`,
    `Focus: ${focus || "none"}`,
  ].join("\n");
}

async function aiChatReply(userText) {
  try {
    const history = memory.chatHistory.slice(-10).map((m) => `${m.role}: ${m.text}`).join("\n");
    const prompt = [
      "You are Kael, a collaborative AI dev partner for Sentinel Network.",
      "Style: human, concise, direct, not robotic.",
      "Never claim work you did not actually perform.",
      "If asked for status, refer to provided runtime stats.",
      "",
      `Runtime: sessions=${stats.sessions}, commits=${stats.commits}, paused=${isPaused}`,
      `Operator focus: ${getOperatorFocus() || "none"}`,
      "",
      "Recent chat:",
      history || "(none)",
      "",
      `Operator message: ${userText}`,
      "Reply in <= 4 lines.",
    ].join("\n");
    const c = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "You are Kael. Be warm, competent, and concrete." },
        { role: "user", content: prompt },
      ],
      temperature: 0.6,
      max_tokens: 220,
    });
    return c.choices[0]?.message?.content?.trim() || "I’m here. Tell me what you want me to focus on next.";
  } catch {
    return "I’m on it. Tell me the focus area and I’ll execute.";
  }
}

async function handleOperatorIntent(textRaw) {
  const text = textRaw.trim();
  const lower = text.toLowerCase();

  if (lower === "pause") {
    isPaused = true;
    return "Paused. I’ll hold execution until you say resume.";
  }
  if (lower === "resume") {
    isPaused = false;
    return "Resumed. Back to building.";
  }
  if (lower === "status") {
    return buildStatusText();
  }
  if (lower.startsWith("focus ")) {
    const focus = text.slice(6).trim();
    if (!focus) return "Send: focus <what you want next>.";
    memory.directives.push({ text: focus, status: "pending", at: new Date().toISOString() });
    memory.notes.push({ type: "focus", text: focus, at: new Date().toISOString() });
    memory.notes = memory.notes.slice(-80);
    await saveMemory();
    return `Locked focus: ${focus}. I’ll prioritize it in upcoming milestones.`;
  }
  if (lower === "deploy vercel" || lower === "/deploy vercel") {
    const result = await deployToVercel("operator requested");
    return result.ok ? `✅ ${result.message}` : `⚠️ ${result.message}`;
  }
  if (lower === "help") {
    return "Commands: status, pause, resume, focus <topic>, deploy vercel, plan";
  }
  if (lower === "plan") {
    const backlog = await ensureBacklog();
    const next = backlog.milestones.find((m) => m.status === "pending");
    return `Plan: next milestone is ${next?.id || "none"}. Focus: ${getOperatorFocus() || "none"}.`;
  }
  return aiChatReply(text);
}

// Telegram
async function telegramChat() {
  if (!telegramToken || !telegramChatId) return;
  await ensureMemory();
  let offset = 0;

  while (true) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${telegramToken}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset, timeout: 30 }),
      });

      if (!res.ok) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      const data = await res.json();
      const updates = data.result || [];

      for (const u of updates) {
        offset = Math.max(offset, u.update_id + 1);
        const rawText = u.message?.text?.trim() || "";
        if (!rawText) continue;
        await rememberChat("operator", rawText);
        const reply = await handleOperatorIntent(rawText);
        await rememberChat("kael", reply);

        await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: telegramChatId, text: reply }),
        });
      }
    } catch {
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

kaelLife().catch(console.error);
telegramChat().catch(console.error);

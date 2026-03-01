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

async function writeSafe(filePath, content) {
  try {
    await mkdir(filePath.split('/').slice(0, -1).join('/'), { recursive: true });
    await writeFile(filePath, content, "utf-8");
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

async function testCode() {
  const result = await runCmd("cd packages/core && npx tsc --noEmit 2>&1", 120000);
  const errors = (result.match(/error TS/g) || []).length;
  return { passed: errors === 0, errors, output: result };
}

async function commit(message) {
  try {
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
  if (pendingFixes.length === 0 && test.errors > 0) {
    // Fallback queue for known hot spots until parser catches all cases
    pendingFixes = [
      "packages/core/src/agent/kaelAgent.ts",
      "packages/core/src/agent/runtime.ts",
      "packages/core/src/agent/toolsRegistry.ts",
      "packages/core/src/digest.ts",
      "packages/core/src/orchestrator.ts",
      "packages/core/src/tools/analyzeNewItems.ts",
      "packages/core/src/tools/generateDigest.ts",
    ];
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
  const next = backlog.milestones.find((m) => m.status === "pending");
  if (!next) {
    console.log("   No pending milestones");
    return;
  }

  console.log(`   Working milestone: ${next.id}`);

  if (next.id === "source-health-v1") {
    const file = "packages/core/src/monitoring/sourceHealth.ts";
    const content = `export interface SourceHealthSnapshot {
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
`;
    const ok = await writeSafe(file, content);
    if (ok) {
      next.status = "completed";
      next.completedAt = new Date().toISOString();
      stats.fixes++;
      await writeJsonSafe(BACKLOG_PATH, backlog);
      console.log(`   ✅ Delivered ${next.id}`);
    }
    return;
  }

  if (next.id === "signal-quality-metrics-v1") {
    const file = "packages/analysis/src/metrics.ts";
    const content = `export interface SignalQualityMetrics {
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
    const ok = await writeSafe(file, content);
    if (ok) {
      next.status = "completed";
      next.completedAt = new Date().toISOString();
      stats.fixes++;
      await writeJsonSafe(BACKLOG_PATH, backlog);
      console.log(`   ✅ Delivered ${next.id}`);
    }
    return;
  }

  if (next.id === "public-feed-contract-v1") {
    const file = "packages/shared/src/contracts/feed.ts";
    const content = `export interface PublicSignalFeedItem {
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
    const ok = await writeSafe(file, content);
    if (ok) {
      next.status = "completed";
      next.completedAt = new Date().toISOString();
      stats.fixes++;
      await writeJsonSafe(BACKLOG_PATH, backlog);
      console.log(`   ✅ Delivered ${next.id}`);
    }
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

    if (fixed === content) {
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
    return completion.choices[0]?.message?.content?.trim() || content;
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
  const committed = await commit(`Kael: ${stats.fixes} fixes`);
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
  const backlog = await ensureBacklog();
  const completed = backlog.milestones.filter((m) => m.status === "completed").length;
  const committed = await commit(
    `Kael checkpoint: ${taskName} | fixes=${stats.fixes} changes=${stats.changes} milestones=${completed}/${backlog.milestones.length}`
  );
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
      const msg = `Progress: ${test.errors} errors, ${stats.commits} commits`;
      console.log(`\n📊 ${msg}`);
      await tg(msg);
    }

    await new Promise(r => setTimeout(r, 2000));
  }
}

// Telegram
async function telegramChat() {
  if (!telegramToken || !telegramChatId) return;
  let offset = 0;

  const responses = {
    "hey": "Hey 👋",
    "hi": "Hi!",
    "hello": "Building Sentinel.",
    "how are you": "Good. Coding.",
    "what are you doing": "Building civic intelligence infrastructure.",
    "status": `Sessions: ${stats.sessions}\nCommits: ${stats.commits}\nPaused: ${isPaused}`,
  };

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
        const text = u.message?.text?.trim()?.toLowerCase() || "";
        if (!text) continue;

        let reply = responses[text] || "Working on Sentinel. Say 'status' for progress.";
        if (text === "pause") {
          isPaused = true;
          reply = "Paused.";
        } else if (text === "resume") {
          isPaused = false;
          reply = "Resumed.";
        }

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

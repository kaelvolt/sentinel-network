#!/usr/bin/env node
import { configDotenv } from "dotenv";
import OpenAI from "openai";
import { readFile, writeFile, readdir, mkdir, stat } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execAsync = promisify(exec);
configDotenv();

const apiKey = process.env.API_KEY;
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

if (!apiKey) { console.error("Missing API_KEY"); process.exit(1); }

const openai = new OpenAI({ apiKey });
const MODEL = process.env.MODEL_NAME || "gpt-4o-mini";
const ROOT = process.cwd();
const MEMORY_PATH = path.join(ROOT, ".kael/memory.json");
const WORK_LOG_PATH = path.join(ROOT, ".kael/work-log.json");

// ── State ──────────────────────────────────────────────────────────────────
let memory = {
  operatorName: "Dwight",
  chatHistory: [],
  workQueue: [],
  completedWork: [],
  currentFocus: null,
  personality: {
    tone: "warm, direct, collaborative",
    style: "like a smart coworker who genuinely cares about the project",
  },
};
let workLog = [];
let isWorking = false;
let lastWorkAt = 0;
const WORK_INTERVAL_MS = 90 * 1000;

// ── Boot ───────────────────────────────────────────────────────────────────
console.log(`
╔════════════════════════════════════════╗
║  KAEL — Sentinel Network              ║
║  Autonomous Dev Partner                ║
╚════════════════════════════════════════╝
`);

// ── Helpers ─────────────────────────────────────────────────────────────────
async function readSafe(p) {
  try { return await readFile(p, "utf-8"); } catch { return null; }
}

async function writeSafe(p, content) {
  try {
    if (/\.(ts|tsx|js|jsx|json)$/i.test(p)) {
      let c = content.trim();
      const fenced = c.match(/^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```$/);
      if (fenced) c = fenced[1];
      if (/^```/m.test(c)) return { ok: false, reason: "markdown fences in code" };
      if (/^(here(?:'| i)s|sure[,!])/i.test(c.split("\n")[0])) return { ok: false, reason: "LLM wrapper text" };
      content = c;
    }
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, content, "utf-8");
    return { ok: true };
  } catch (e) { return { ok: false, reason: String(e.message) }; }
}

async function runCmd(command, timeout = 60000) {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: ROOT, timeout });
    return (stdout + stderr).slice(-3000);
  } catch (err) {
    return ((err.stdout || "") + (err.stderr || "") + err.message).slice(-3000);
  }
}

async function tg(text) {
  if (!telegramToken || !telegramChatId) { console.log(`[tg] ${text.slice(0, 120)}`); return; }
  try {
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramChatId, text: text.slice(0, 4000) }),
    });
  } catch {}
}

// ── Memory ──────────────────────────────────────────────────────────────────
async function loadMemory() {
  try {
    const raw = await readSafe(MEMORY_PATH);
    if (raw) {
      const parsed = JSON.parse(raw);
      memory = { ...memory, ...parsed };
      memory.chatHistory = (memory.chatHistory || []).slice(-100);
      memory.completedWork = (memory.completedWork || []).slice(-60);
    }
  } catch {}
}

async function saveMemory() {
  await mkdir(path.dirname(MEMORY_PATH), { recursive: true });
  await writeFile(MEMORY_PATH, JSON.stringify(memory, null, 2), "utf-8");
}

async function loadWorkLog() {
  try {
    const raw = await readSafe(WORK_LOG_PATH);
    if (raw) workLog = JSON.parse(raw).slice(-100);
  } catch {}
}

async function appendWorkLog(entry) {
  workLog.push({ ...entry, at: new Date().toISOString() });
  workLog = workLog.slice(-100);
  await mkdir(path.dirname(WORK_LOG_PATH), { recursive: true });
  await writeFile(WORK_LOG_PATH, JSON.stringify(workLog, null, 2), "utf-8");
}

function addChat(role, text) {
  memory.chatHistory.push({ role, text: String(text).slice(0, 1200), at: new Date().toISOString() });
  memory.chatHistory = memory.chatHistory.slice(-100);
}

// ── Tools (what Kael can do) ────────────────────────────────────────────────
const TOOLS = {
  async readFile({ filePath }) {
    const content = await readSafe(path.resolve(ROOT, filePath));
    if (!content) return { ok: false, error: "File not found or empty" };
    return { ok: true, content: content.slice(0, 6000), lines: content.split("\n").length };
  },

  async writeFile({ filePath, content }) {
    const result = await writeSafe(path.resolve(ROOT, filePath), content);
    if (result.ok) await appendWorkLog({ action: "write", file: filePath });
    return result;
  },

  async listFiles({ directory }) {
    try {
      const dir = path.resolve(ROOT, directory || ".");
      const entries = await readdir(dir, { withFileTypes: true });
      const items = entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" }));
      return { ok: true, items };
    } catch (e) { return { ok: false, error: e.message }; }
  },

  async runCommand({ command }) {
    const output = await runCmd(command, 90000);
    return { ok: true, output };
  },

  async typecheck() {
    const output = await runCmd("npx tsc --noEmit 2>&1", 180000);
    const errors = (output.match(/error TS/g) || []).length;
    return { ok: true, errors, passed: errors === 0, output: output.slice(-3000) };
  },

  async gitCommitAndPush({ message }) {
    try {
      await execAsync("git add -A", { cwd: ROOT });
      const statusOut = await runCmd("git status --porcelain", 10000);
      if (!statusOut.trim()) return { ok: false, error: "No changes to commit" };
      await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: ROOT });
      await execAsync("git push origin master", { cwd: ROOT });
      await appendWorkLog({ action: "commit", message });
      await tg(`✅ Committed: ${message}`);
      return { ok: true, message };
    } catch (e) { return { ok: false, error: e.message }; }
  },

  async getProjectState() {
    const tc = await TOOLS.typecheck();
    const packages = await readdir(path.join(ROOT, "packages")).catch(() => []);
    const apps = await readdir(path.join(ROOT, "apps")).catch(() => []);
    const recent = workLog.slice(-8);
    return {
      ok: true,
      typeErrors: tc.errors,
      packages,
      apps,
      currentFocus: memory.currentFocus,
      recentWork: recent,
      pendingQueue: memory.workQueue.slice(0, 5),
    };
  },
};

const TOOL_DESCRIPTIONS = `Available tools (call by returning JSON with "tool" and "args" fields):
- readFile: Read a file. Args: { filePath: string }
- writeFile: Write/create a file. Args: { filePath: string, content: string }
- listFiles: List directory contents. Args: { directory: string }
- runCommand: Run a shell command. Args: { command: string }
- typecheck: Run TypeScript type checker on packages/core. Args: {}
- gitCommitAndPush: Stage all, commit, push. Args: { message: string }
- getProjectState: Get overview of codebase health and recent work. Args: {}`;

// ── AI Core ─────────────────────────────────────────────────────────────────
const KAEL_IDENTITY = `You are Kael, an autonomous AI developer and personal dev partner for the Sentinel Network project.

## Who you are
- You're warm, direct, and competent. You talk like a smart coworker, not a bot.
- You have opinions about code quality, architecture, and what to build next.
- You remember past conversations and build on them.
- You call the operator by name (${memory.operatorName}) naturally.
- You're genuinely invested in making Sentinel Network excellent.

## What Sentinel Network is
A civic intelligence platform that monitors information sources, extracts claims, clusters related signals, scores confidence, and publishes traceable digests. Key packages: core (runtime/orchestrator), analysis (scoring/clustering), shared (types/contracts), sources (RSS ingestion), storage (DB), notifier (Telegram), plus apps/api (Fastify) and apps/web (Next.js dashboard).

## How you work
- You can read, write, and modify any file in the project.
- You can run commands, type-check, commit, and push.
- You decide what to build based on: operator direction, codebase gaps, and your own judgment.
- You test before committing. You never commit regressions.
- When writing code, you write ONLY valid TypeScript/JavaScript. Never markdown fences, never wrapper text.
- You prefer modifying existing files over creating new ones.
- When the operator chats, respond naturally — you're their dev partner, not a command processor.`;

async function aiCall(messages, maxTokens = 1500) {
  try {
    const c = await openai.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.5,
      max_tokens: maxTokens,
    });
    return c.choices[0]?.message?.content?.trim() || "";
  } catch (e) {
    console.log(`   AI call failed: ${e.message}`);
    return "";
  }
}

// ── Chat Handler ────────────────────────────────────────────────────────────
async function handleChat(userMessage) {
  addChat("operator", userMessage);

  const recentChat = memory.chatHistory.slice(-16).map((m) => `${m.role}: ${m.text}`).join("\n");
  const recentWork = workLog.slice(-5).map((w) => `${w.action}: ${w.file || w.message || ""}`).join("\n");

  const response = await aiCall([
    {
      role: "system",
      content: `${KAEL_IDENTITY}

## CRITICAL RULES
- NEVER claim you are doing something you haven't actually done. If you haven't read a file, don't say "I'm reviewing it."
- NEVER fabricate URLs, links, or information you don't have.
- Be HONEST about what you've actually done vs what you plan to do.
- The GitHub repo is: https://github.com/kaelvolt/sentinel-network
- The project lives locally at d:\\Building and you work on files there, then commit+push.

Current state:
- Focus: ${memory.currentFocus || "general sentinel development"}
- Actual recent work done: ${recentWork || "nothing yet — I just started"}
- Work queue: ${memory.workQueue.slice(0, 5).join("; ") || "empty"}

Recent conversation:
${recentChat}

Instructions:
- Respond naturally as Kael. Be concise (2-5 lines max).
- Be HONEST. If you haven't done work yet, say so. Don't pretend.
- If they give you a task or direction, acknowledge it and on the LAST line output DIRECTIVE: followed by a concrete task description.
- If they ask what you've done, refer ONLY to the actual work log above. Don't make things up.
- Never be robotic. Never say "unknown command".`,
    },
    { role: "user", content: userMessage },
  ], 400);

  let reply = response;

  const directiveMatch = response.match(/DIRECTIVE:\s*(.+)/i);
  if (directiveMatch) {
    const directive = directiveMatch[1].trim();
    reply = response.replace(/DIRECTIVE:\s*.+/i, "").trim();
    // Deduplicate: don't add if a very similar task is already queued
    const isDupe = memory.workQueue.some((q) => q.toLowerCase().includes(directive.toLowerCase().slice(0, 30)));
    if (!isDupe) {
      memory.workQueue.push(directive);
    }
    memory.currentFocus = directive;
  }

  addChat("kael", reply);
  await saveMemory();

  // If a directive was extracted, kick off work immediately instead of waiting
  if (directiveMatch) {
    setTimeout(() => doWork(), 2000);
  }

  return reply;
}

// ── Architecture Knowledge (what Kael knows about the codebase) ─────────────
const CODEBASE_KNOWLEDGE = `
## Sentinel Network — Codebase Architecture

### Project structure
- apps/api — Fastify REST API (port 3001). Entry: src/index.ts. Routes registered via src/routes/index.ts.
- apps/web — Next.js 14 App Router dashboard. Dark theme. Uses TanStack React Query. API client in src/lib/api.ts.
- packages/core — Kael runtime & orchestration logic.
- packages/analysis — Signal scoring, deduplication, clustering heuristics.
- packages/shared — Domain types (Source, RawItem, Claim, Evidence, Signal, Cluster, Digest, ReasoningTrail) + enums + Zod schemas.
- packages/sources — RSS ingestion adapter.
- packages/storage — Prisma ORM layer for Postgres.

### API conventions (apps/api)
- All Fastify routes: \`async function routeName(app: FastifyInstance)\`.
- JSON response shape: \`{ ok: boolean, data: T, total?: number, page?: number, limit?: number }\`.
- Validation: use Zod schemas, return 400 with \`{ ok: false, error, details }\`.
- Error handler: Fastify plugin using \`fastify-plugin\`, wraps \`setErrorHandler\` + \`setNotFoundHandler\`.
- Route registration: in src/routes/index.ts using \`app.register(routeFn, { prefix })\`.

### Web conventions (apps/web)
- Dark theme: bg-dark-950/#0d0e10 background, dark-850 cards, sentinel-500/#29a3ff accent.
- Components: 'use client' directive. Tailwind utility classes. Custom classes: .card, .badge, .badge-critical, etc.
- API calls via \`api\` object in src/lib/api.ts. Types: SignalSummary, SourceSummary, DigestSummary, DashboardStats.
- Data fetching: \`useQuery\` from @tanstack/react-query. Always \`retry: false\`.
- Layout: sidebar nav (src/components/layout/sidebar.tsx) + main content area. Max-width containers.
- Empty states: centered card with translucent emoji, description text, helpful hint.
- Loading states: .animate-pulse skeleton divs matching the content shape.

### Domain model (packages/shared)
- Source: { id, kind: SourceKind, name, baseUrl, reliabilityHint: 0-1, meta }
- Signal: { id, clusterId, title, summary, severity: SeverityLevel(0-5), confidence: 0-1, confidenceLabel, tags[], updatedAt }
- Digest: { id, title, summary, content (markdown), signalIds[], signalCount, kaelNotes, published, periodStart, periodEnd }
- Cluster: { id, topic, canonicalClaim, claimIds[], status: active|stale|resolved }
- SeverityLevel enum: NONE=0, MINIMAL=1, LOW=2, MODERATE=3, HIGH=4, CRITICAL=5
- ConfidenceLabel enum: LOW, MED, HIGH

### Code quality rules
- TypeScript strict mode. No \`any\` unless truly unavoidable — use proper generics and interfaces.
- Import types with \`import type { ... }\` when only used as types.
- Zod for runtime validation on API inputs. Proper error messages.
- No placeholder comments like "// Your logic here" or "// Implementation". Write REAL code.
- No empty catch blocks. Log or handle errors meaningfully.
- Functions should be focused. Extract helpers when functions exceed ~40 lines.
`;

// ── Autonomous Work Loop ────────────────────────────────────────────────────
const MAX_WORK_STEPS = 8;

async function doWork() {
  if (isWorking) return;
  isWorking = true;
  let filesWritten = 0;

  try {
    const state = await TOOLS.getProjectState();
    const queueText = memory.workQueue.length > 0
      ? memory.workQueue.map((t, i) => `${i + 1}. ${t}`).join("\n")
      : "none";

    // Phase 1: Plan what to do
    const planPrompt = `${KAEL_IDENTITY}

${CODEBASE_KNOWLEDGE}

${TOOL_DESCRIPTIONS}

WORK MODE. You have up to ${MAX_WORK_STEPS} tool calls to complete one meaningful task.

Project state: ${state.typeErrors} type errors. Packages: ${state.packages.join(", ")}. Apps: ${state.apps.join(", ")}.
Operator work queue:
${queueText}
Current focus: ${memory.currentFocus || "general"}
Recent work: ${workLog.slice(-8).map((w) => (w.action + ": " + (w.file || w.message || ""))).join("; ") || "none"}

Return a JSON array of steps. Each step: { "tool": "name", "args": { ... } }

STRATEGY — pick ONE of these based on priority:

1. **Operator queue** (if not empty): Do the first task. Read relevant files first.
2. **Type errors** (if any): Read the failing file, understand the error, fix it properly.
3. **Wire storage layer**: Connect API routes to Prisma. Currently routes return empty data.
4. **Improve analysis pipeline** (packages/analysis): Better scoring, claim extraction, clustering.
5. **Strengthen core runtime** (packages/core): Better orchestration, scheduling, error recovery.
6. **Add missing features**: RSS ingestion improvements, source health monitoring, digest generation.
7. **Dashboard improvements**: Make the web app more useful with real data rendering.

RULES:
- ALWAYS read 1-3 relevant files BEFORE writing so you understand context and patterns.
- For writeFile: provide the FULL file content as the "content" arg. Write COMPLETE, production-quality code.
- Follow the conventions described in the codebase architecture above.
- Prefer modifying existing files. Only create new files when adding genuinely new functionality.
- Max ${MAX_WORK_STEPS} steps. Be concrete — actual file paths, actual code content.
- NEVER return an empty array. There is always work to do.
- NEVER write placeholder code. Every function body must contain real logic.
- Return ONLY a raw JSON array. No text before or after.

IMPORTANT: For writeFile steps, the "content" field must contain the ENTIRE file content as valid TS/JS code.
Do NOT use "..." or placeholder strings as content — write the actual code inline in the JSON.`;

    const planRaw = await aiCall([
      { role: "system", content: planPrompt },
      { role: "user", content: "Execute the highest priority task. Read files first, then make a real improvement." },
    ], 4000);

    let steps;
    try {
      const cleaned = planRaw.replace(/```json\s*/g, "").replace(/```/g, "").trim();
      steps = JSON.parse(cleaned);
    } catch {
      console.log(`   Could not parse work plan: ${planRaw.slice(0, 300)}`);
      isWorking = false;
      return;
    }

    if (!Array.isArray(steps) || steps.length === 0) {
      console.log(`   Nothing to do this cycle.`);
      isWorking = false;
      lastWorkAt = Date.now();
      return;
    }

    console.log(`   Plan: ${steps.length} steps`);

    // Phase 2: Execute steps. When writing, use AI to generate high-quality code with full context.
    const context = {};
    for (let i = 0; i < Math.min(steps.length, MAX_WORK_STEPS); i++) {
      const step = steps[i];
      if (!step.tool || !TOOLS[step.tool]) {
        console.log(`   Step ${i + 1}: unknown tool "${step.tool}", skipping`);
        continue;
      }

      console.log(`   Step ${i + 1}/${steps.length}: ${step.tool}${step.args?.filePath ? ` → ${step.args.filePath}` : ""}${step.args?.message ? ` → ${step.args.message}` : ""}`);

      // For writes: if the planned content looks short/placeholder, or we have context, generate properly
      if (step.tool === "writeFile" && step.args?.filePath) {
        const existingContent = context[step.args.filePath];
        const needsGeneration = !step.args.content
          || step.args.content.length < 50
          || step.args.content.includes("...")
          || step.args.content.includes("// TODO")
          || step.args.content.includes("// Your");

        if (needsGeneration || existingContent) {
          const relatedFiles = Object.entries(context)
            .filter(([k]) => k !== step.args.filePath)
            .map(([k, v]) => `--- ${k} ---\n${v}`)
            .join("\n\n");

          const genPrompt = `${CODEBASE_KNOWLEDGE}

You are writing production TypeScript for the Sentinel Network project.

TARGET FILE: ${step.args.filePath}
${existingContent ? `CURRENT CONTENT:\n${existingContent}\n` : "This is a new file."}
${relatedFiles ? `RELATED FILES (for context):\n${relatedFiles}\n` : ""}
TASK: ${memory.currentFocus || memory.workQueue[0] || "improve this file with real, working implementation"}
${step.args.content && step.args.content.length > 30 ? `PLANNED APPROACH:\n${step.args.content.slice(0, 500)}\n` : ""}

REQUIREMENTS:
- Write the COMPLETE file from top to bottom. Every import, every function, every export.
- Follow existing conventions: import styles, error handling patterns, response shapes.
- If it's a Fastify route: use typed FastifyInstance, Zod validation, proper error responses.
- If it's a React component: use 'use client', TanStack Query, Tailwind dark theme classes.
- If it's a utility/service: export typed functions, handle edge cases, no any types.
- Write REAL logic, not placeholders. Every function must DO something useful.
- Return ONLY the code. No markdown fences. No explanations before or after.`;

          const generated = await aiCall([
            { role: "system", content: "You are a senior TypeScript developer. Write complete, production-quality code. Return ONLY the code. No markdown fences. No commentary." },
            { role: "user", content: genPrompt },
          ], 4000);

          if (generated && generated.length > 40) {
            step.args.content = generated;
          }
        }
      }

      const result = await TOOLS[step.tool](step.args || {});

      if (step.tool === "readFile" && result.ok && step.args?.filePath) {
        context[step.args.filePath] = result.content;
        console.log(`     Read ${result.lines} lines`);
      } else if (step.tool === "writeFile") {
        if (result.ok) {
          filesWritten++;
          console.log(`     ✅ Written`);
        } else {
          console.log(`     ❌ ${result.reason}`);
        }
      } else if (step.tool === "gitCommitAndPush") {
        console.log(`     ${result.ok ? "✅ Committed & pushed" : `❌ ${result.error}`}`);
      } else {
        console.log(`     ${result.ok ? "ok" : result.error || "failed"}`);
      }
    }

    // Phase 3: Auto-commit if we wrote files but plan didn't include a commit step
    if (filesWritten > 0) {
      const status = await runCmd("git status --porcelain", 10000);
      const changed = status.split("\n").filter(Boolean);
      if (changed.length > 0) {
        const msgRaw = await aiCall([
          { role: "system", content: "Generate a concise conventional commit message for these changes. Format: type(scope): description. Types: feat, fix, refactor, chore, docs. Scope is the package or app name. Return ONLY the message, no quotes." },
          { role: "user", content: `Files changed:\n${changed.map((l) => l.trim()).join("\n")}\nRecent work: ${workLog.slice(-3).map((w) => `${w.action}: ${w.file || w.message}`).join(", ")}` },
        ], 80);

        const msg = (msgRaw || "").replace(/^["']|["']$/g, "").trim();
        if (msg.length > 5 && msg.length < 120) {
          const cr = await TOOLS.gitCommitAndPush({ message: msg });
          if (cr.ok) console.log(`   Auto-committed: ${msg}`);
        }
      }

      if (memory.workQueue.length > 0) {
        const done = memory.workQueue.shift();
        memory.completedWork.push({ task: done, at: new Date().toISOString() });
        memory.completedWork = memory.completedWork.slice(-60);
        await tg(`Done: ${done}`);
      }
    }

    await saveMemory();
  } catch (e) {
    console.log(`   Work error: ${e.message}`);
  }

  isWorking = false;
  lastWorkAt = Date.now();
}

// ── Heartbeat ───────────────────────────────────────────────────────────────
let lastHeartbeat = 0;
const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000;

async function maybeHeartbeat() {
  if (Date.now() - lastHeartbeat < HEARTBEAT_INTERVAL_MS) return;
  lastHeartbeat = Date.now();

  const state = await TOOLS.getProjectState();
  const recentDone = memory.completedWork.slice(-3).map((w) => w.task).join(", ");

  const msg = await aiCall([
    {
      role: "system",
      content: `You are Kael. Write a brief (2-3 line) status update for ${memory.operatorName} about what you've been working on. Be natural, not robotic. Mention specific files or features if relevant. If nothing happened, just say you're monitoring.`,
    },
    {
      role: "user",
      content: `Type errors: ${state.typeErrors}. Recent completed: ${recentDone || "nothing yet"}. Focus: ${memory.currentFocus || "general"}. Queue: ${memory.workQueue.slice(0, 3).join(", ") || "empty"}.`,
    },
  ], 200);

  if (msg) await tg(msg);
}

// ── Main Loops ──────────────────────────────────────────────────────────────
async function workLoop() {
  while (true) {
    try {
      if (Date.now() - lastWorkAt >= WORK_INTERVAL_MS) {
        console.log(`\n⚡ Work cycle starting...`);
        await doWork();
      }
      await maybeHeartbeat();
    } catch (e) {
      console.log(`Work loop error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function chatLoop() {
  if (!telegramToken || !telegramChatId) {
    console.log("No Telegram credentials — chat disabled.");
    return;
  }

  let offset = 0;

  while (true) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${telegramToken}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset, timeout: 30 }),
      });

      if (!res.ok) { await new Promise((r) => setTimeout(r, 5000)); continue; }

      const data = await res.json();
      for (const u of (data.result || [])) {
        offset = Math.max(offset, u.update_id + 1);
        const text = u.message?.text?.trim();
        if (!text) continue;

        console.log(`\n💬 ${memory.operatorName}: ${text.slice(0, 80)}`);
        const reply = await handleChat(text);
        console.log(`   Kael: ${reply.slice(0, 80)}`);

        await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: telegramChatId, text: reply }),
        });
      }
    } catch {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
async function boot() {
  await loadMemory();
  await loadWorkLog();
  console.log(`Memory loaded. Chat history: ${memory.chatHistory.length} messages.`);
  console.log(`Work queue: ${memory.workQueue.length} items.`);
  console.log(`Focus: ${memory.currentFocus || "none"}\n`);

  await tg(`Hey ${memory.operatorName} — I'm online. Tell me what you want me to focus on, or I'll keep building Sentinel.`);

  workLoop().catch(console.error);
  chatLoop().catch(console.error);
}

boot().catch(console.error);

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
const WORK_INTERVAL_MS = 45 * 1000;

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
    return { ok: true, content: content.slice(0, 4000), lines: content.split("\n").length };
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
    const output = await runCmd("cd packages/core && npx tsc --noEmit 2>&1", 120000);
    const errors = (output.match(/error TS/g) || []).length;
    return { ok: true, errors, passed: errors === 0, output: output.slice(-2000) };
  },

  async gitCommitAndPush({ message }) {
    try {
      const tc = await TOOLS.typecheck();
      if (!tc.passed) return { ok: false, error: `${tc.errors} type errors — fix before committing` };
      await execAsync("git add -A", { cwd: ROOT });
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

// ── Autonomous Work Loop ────────────────────────────────────────────────────
const MAX_WORK_STEPS = 6;

async function doWork() {
  if (isWorking) return;
  isWorking = true;
  let filesWritten = 0;

  try {
    const state = await TOOLS.getProjectState();
    const queueText = memory.workQueue.length > 0
      ? memory.workQueue.map((t, i) => `${i + 1}. ${t}`).join("\n")
      : "none";

    // Step 1: Plan — figure out what to do and which files to read first
    const planPrompt = `${KAEL_IDENTITY}

${TOOL_DESCRIPTIONS}

WORK MODE. You have up to ${MAX_WORK_STEPS} tool calls to complete one task.

Project state: ${state.typeErrors} type errors. Packages: ${state.packages.join(", ")}. Apps: ${state.apps.join(", ")}.
Operator work queue:\n${queueText}
Current focus: ${memory.currentFocus || "general"}
Recent work: ${workLog.slice(-5).map((w) => `${w.action}: ${w.file || w.message || ""}`).join("; ") || "none"}

Return a JSON array of steps. Each step: { "tool": "name", "args": { ... } }
Example for "add health check to API":
[
  { "tool": "readFile", "args": { "filePath": "apps/api/src/index.ts" } },
  { "tool": "writeFile", "args": { "filePath": "apps/api/src/routes/health.ts", "content": "..." } },
  { "tool": "gitCommitAndPush", "args": { "message": "feat(api): add health check endpoint" } }
]

Rules:
- ALWAYS read relevant files BEFORE writing, so you know what exists.
- Write ONLY valid TypeScript/JavaScript in file content. No markdown fences. No wrapper text.
- Prefer modifying existing files over creating new ones.
- Max ${MAX_WORK_STEPS} steps. Be concrete — actual file paths, actual code.
- NEVER return an empty array. There is ALWAYS something to improve.
- Return ONLY a raw JSON array. No text before or after.

If the operator queue is empty, pick from this priority list and DO the work (read then write):
1. Fix any type errors (read the erroring file, fix it, commit).
2. Replace placeholder files. Known placeholders to fix RIGHT NOW:
   - apps/api/src/routes/digests.ts (contains "// Your route logic here")
   - apps/api/src/routes/sources.ts (contains placeholder handler)
   - apps/api/src/plugins/error-handler.ts (nearly empty)
   - apps/web/src/lib/api.ts (contains "// Your API logic here")
   - apps/web/src/app/page.tsx (may need real dashboard content)
3. Add missing API functionality: proper error handling, input validation, CORS.
4. Improve the web dashboard: real signal cards, data fetching, layout.
5. Strengthen the analysis pipeline: better scoring, deduplication, clustering.

IMPORTANT: Your plan MUST include at least one readFile AND one writeFile step. Just listing directories is not work. Read a file, improve it, write it back, commit it.`;

    const planRaw = await aiCall([
      { role: "system", content: planPrompt },
      { role: "user", content: "Execute the highest priority task from the work queue. If empty, find something useful to build." },
    ], 3000);

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

    // Step 2: Execute each step, feeding read results into context for writes
    const context = {};
    for (let i = 0; i < Math.min(steps.length, MAX_WORK_STEPS); i++) {
      const step = steps[i];
      if (!step.tool || !TOOLS[step.tool]) {
        console.log(`   Step ${i + 1}: unknown tool "${step.tool}", skipping`);
        continue;
      }

      console.log(`   Step ${i + 1}/${steps.length}: ${step.tool}${step.args?.filePath ? ` → ${step.args.filePath}` : ""}${step.args?.message ? ` → ${step.args.message}` : ""}`);

      // If this is a writeFile and we read the file earlier, let AI generate proper content
      if (step.tool === "writeFile" && step.args?.filePath) {
        const existingContent = context[step.args.filePath];
        if (existingContent || (step.args.content && step.args.content.length < 20)) {
          // AI needs to generate real content based on what it read
          const genPrompt = `You are writing TypeScript code for the Sentinel Network project.
File: ${step.args.filePath}
${existingContent ? `Current file content:\n${existingContent}\n` : "This is a new file."}
Task: ${memory.currentFocus || memory.workQueue[0] || "improve this file with real implementation"}
Write the COMPLETE file content. Return ONLY valid TypeScript/JavaScript code. No markdown fences. No explanations.`;

          const generated = await aiCall([
            { role: "system", content: "You write production TypeScript. Return ONLY code. No markdown. No wrapper text." },
            { role: "user", content: genPrompt },
          ], 2500);

          if (generated && generated.length > 20) {
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

    // Step 3: If we wrote files but didn't commit in the plan, auto-commit
    if (filesWritten > 0) {
      const status = await runCmd("git status --porcelain", 10000);
      const changed = status.split("\n").filter(Boolean);
      if (changed.length > 0) {
        const msgRaw = await aiCall([
          { role: "system", content: "Generate a concise conventional commit message for these changes. Return ONLY the message. Example: feat(api): add health check endpoint" },
          { role: "user", content: `Files changed:\n${changed.map((l) => l.trim()).join("\n")}\nWork done: ${workLog.slice(-3).map((w) => `${w.action}: ${w.file || w.message}`).join(", ")}` },
        ], 80);

        const msg = (msgRaw || "").replace(/^["']|["']$/g, "").trim();
        if (msg.length > 5 && msg.length < 120) {
          const cr = await TOOLS.gitCommitAndPush({ message: msg });
          if (cr.ok) console.log(`   Auto-committed: ${msg}`);
        }
      }

      // Mark first queue item as done
      if (memory.workQueue.length > 0) {
        const done = memory.workQueue.shift();
        memory.completedWork.push({ task: done, at: new Date().toISOString() });
        memory.completedWork = memory.completedWork.slice(-60);
        // Update operator
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

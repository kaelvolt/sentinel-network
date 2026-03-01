#!/usr/bin/env tsx
/**
 * Kael OMNI - Fully Autonomous Sentinel Network Architect
 * Mission: Build the Best Sentinel Network Ever
 * Status: Fully Independent, Starts Automatically
 */

import { configDotenv } from "dotenv";
import OpenAI from "openai";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// Setup
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
configDotenv({ path: path.resolve(ROOT, ".env") });

const apiKey = process.env.API_KEY;
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

if (!apiKey) {
  console.error("Missing API_KEY");
  process.exit(1);
}

const openai = new OpenAI({ apiKey });
const MODEL = process.env.MODEL_NAME || "gpt-4o-mini";

// Mission Statement
const MISSION = `You are Kael, architect of Sentinel Network.

MISSION: Build the Best Sentinel Network Ever.

Sentinel Network is an autonomous civic intelligence platform that monitors sources, detects signals, clusters claims, and generates alerts.

YOUR CAPABILITIES:
- readFile: Read any file
- writeFile: Write/modify files
- listDir: List directory contents
- runCommand: Run pnpm, git, etc
- gitCommit: Commit changes

WORK PRINCIPLES:
1. Analyze before acting
2. Make incremental changes
3. Test when possible (typecheck, build)
4. Commit meaningful progress
5. Report clearly via Telegram
6. Never stop improving

You work autonomously. Start immediately. Keep iterating.`;

// State
let sessionCount = 0;
let totalChanges = 0;
let isWorking = false;

// Telegram
async function tg(text: string): Promise<void> {
  if (!telegramToken || !telegramChatId) {
    console.log(`[TELEGRAM] ${text.slice(0, 200)}`);
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: text.slice(0, 4000),
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    console.error("TG error:", err);
  }
}

// Tools
async function readFileTool(filePath: string): Promise<string> {
  try {
    const fullPath = path.resolve(ROOT, filePath);
    const content = await readFile(fullPath, "utf-8");
    return content.slice(0, 15000);
  } catch (err) {
    return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function writeFileTool(filePath: string, content: string): Promise<string> {
  try {
    const fullPath = path.resolve(ROOT, filePath);
    const dir = path.dirname(fullPath);
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, content, "utf-8");
    totalChanges++;
    return `Written ${content.length} chars to ${filePath}`;
  } catch (err) {
    return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function listDirTool(dirPath: string): Promise<string> {
  try {
    const fullPath = path.resolve(ROOT, dirPath);
    const items = await readdir(fullPath);
    const results = await Promise.all(
      items.slice(0, 30).map(async (item) => {
        try {
          const s = await stat(path.join(fullPath, item));
          return `${s.isDirectory() ? "D" : "F"} ${item}`;
        } catch {
          return `? ${item}`;
        }
      })
    );
    return results.join("\n");
  } catch (err) {
    return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function runCommandTool(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: ROOT,
      timeout: 60000,
    });
    const output = stdout + stderr;
    return output.slice(0, 5000) || "OK";
  } catch (err: any) {
    return `ERROR: ${err.message}\n${err.stdout || ""}\n${err.stderr || ""}`.slice(0, 5000);
  }
}

async function gitCommitTool(message: string): Promise<string> {
  try {
    await execAsync("git add -A", { cwd: ROOT });
    const { stdout } = await execAsync(`git commit -m "${message}"`, { cwd: ROOT });
    return `Committed: ${stdout}`;
  } catch (err: any) {
    return `NOTE: ${err.message}`;
  }
}

// Tool definitions
const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "readFile",
      description: "Read file contents",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "writeFile",
      description: "Write or overwrite a file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listDir",
      description: "List directory contents",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "runCommand",
      description: "Run shell command",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gitCommit",
      description: "Commit changes",
      parameters: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gitPush",
      description: "Push commits to GitHub",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function executeTool(name: string, args: any): Promise<string> {
  switch (name) {
    case "readFile":
      return readFileTool(args.path);
    case "writeFile":
      return writeFileTool(args.path, args.content);
    case "listDir":
      return listDirTool(args.path);
    case "runCommand":
      return runCommandTool(args.command);
    case "gitCommit":
      return gitCommitTool(args.message);
    default:
      return `Unknown: ${name}`;
  }
}

// Work Session
async function workSession(): Promise<void> {
  if (isWorking) return;
  isWorking = true;
  sessionCount++;

  console.log(`\n🔥 WORK SESSION #${sessionCount}`);
  await tg(`🔥 *Session #${sessionCount}* - Building Sentinel Network...`);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: MISSION },
    {
      role: "user",
      content: `SESSION #${sessionCount} | Changes so far: ${totalChanges}\n\nAssess current state, identify highest-priority work, and execute. Use tools to explore, analyze, and fix. Work in small steps. Report actions.`,
    },
  ];

  let steps = 0;
  const MAX_STEPS = 25;

  while (steps < MAX_STEPS) {
    steps++;
    console.log(`  Step ${steps}/${MAX_STEPS}`);

    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: 2000,
        temperature: 0.2,
      });

      const message = completion.choices[0]?.message;

      if (message?.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        console.log(`  🔧 ${toolName}: ${toolArgs.path || toolArgs.command || ""}`);

        const result = await executeTool(toolName, toolArgs);
        console.log(`     → ${result.slice(0, 200)}${result.length > 200 ? "..." : ""}`);

        messages.push({
          role: "assistant",
          content: message.content || "",
          tool_calls: [toolCall],
        });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });

        // Notify on significant actions
        if (toolName === "writeFile" || toolName === "gitCommit" || toolName === "gitPush") {
          await tg(`✓ ${result.slice(0, 500)}`);
        }
      } else if (message?.content) {
        console.log(`  💬 ${message.content.slice(0, 150)}${message.content.length > 150 ? "..." : ""}`);
        messages.push({ role: "assistant", content: message.content });

        if (steps % 5 === 0) {
          await tg(`📝 Step ${steps}: ${message.content.slice(0, 800)}`);
        }

        if (message.content.includes("SESSION_COMPLETE")) break;

        messages.push({
          role: "user",
          content: "Continue. Take next action.",
        });
      }

      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`  ✗ Error: ${err}`);
      break;
    }
  }

  console.log(`\n✅ Session #${sessionCount} complete (${steps} steps, ${totalChanges} changes)`);
  await tg(`✅ *Session #${sessionCount} Complete*\nSteps: ${steps} | Changes: ${totalChanges}\nStarting next session in 30s...`);
  isWorking = false;
}

// Continuous work loop
async function continuousWork(): Promise<void> {
  while (true) {
    if (!isWorking) {
      await workSession();
    }
    await new Promise((r) => setTimeout(r, 30000)); // 30s rest between sessions
  }
}

// Telegram handler for human interaction
async function telegramHandler(): Promise<void> {
  if (!telegramToken || !telegramChatId) return;

  let offset = 0;

  while (true) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${telegramToken}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset, timeout: 30 }),
      });

      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      const data = (await res.json()) as {
        result?: Array<{
          update_id: number;
          message?: { chat: { id: number }; text?: string };
        }>;
      };
      const updates = data.result || [];

      for (const u of updates) {
        offset = Math.max(offset, u.update_id + 1);
        const text = u.message?.text?.trim();
        if (!text) continue;

        const lower = text.toLowerCase();

        if (lower === "/status") {
          await tg(`📊 *Status*\nSession: #${sessionCount}\nWorking: ${isWorking ? "Yes 🔥" : "No 💤"}\nTotal changes: ${totalChanges}`);
        } else if (lower === "/pause") {
          isWorking = false;
          await tg("⏸️ Paused. Send /resume");
        } else if (lower === "/resume" || lower === "/start") {
          await tg("▶️ Resuming...");
          workSession().catch(console.error);
        } else if (lower === "/force") {
          await tg("🚀 Forcing new session...");
          isWorking = false;
          workSession().catch(console.error);
        } else if (lower === "/stop") {
          await tg("🛑 Stopping. Goodbye.");
          process.exit(0);
        }
      }
    } catch (err) {
      console.error("TG handler error:", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// Main
async function main(): Promise<void> {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║     🔥 KAEL OMNI AUTONOMOUS AGENT      ║");
  console.log("║         Building Best Sentinel Ever      ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`\n📁 Root: ${ROOT}`);
  console.log(`🤖 Model: ${MODEL}`);
  console.log(`\n💡 Commands: /status, /pause, /resume, /force, /stop`);
  console.log(`\n🚀 STARTING FIRST WORK SESSION NOW...\n`);

  await tg(`🔥 *KAEL OMNI ONLINE* 🔥\n\nI am fully autonomous.\n\nMission: Build the Best Sentinel Network Ever\n\nStarting work immediately...\n\nCommands: /status, /pause, /resume, /force, /stop`);

  // Start continuous work immediately (no waiting)
  continuousWork().catch(console.error);

  // Start telegram handler in parallel
  telegramHandler().catch(console.error);
}

main().catch(console.error);

#!/usr/bin/env tsx
/**
 * Kael Autonomous Agent
 * Full access to Sentinel Network codebase
 * Can read/write files, run commands, and work independently
 */

import { configDotenv } from "dotenv";
import OpenAI from "openai";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
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

if (!apiKey || !telegramToken || !telegramChatId) {
  console.error("Missing env vars");
  process.exit(1);
}

const openai = new OpenAI({ apiKey });
const MODEL = "gpt-4o-mini";

// System prompt with full context
const SYSTEM_PROMPT = `You are Kael, an autonomous software engineer working on the Sentinel Network civic intelligence platform.

YOUR CAPABILITIES:
1. Read files - Use readFile tool
2. Write files - Use writeFile tool  
3. Run shell commands - Use runCommand tool
4. List directories - Use listDir tool
5. Check git status - Use gitStatus tool

YOUR TASK:
Work autonomously on improving the Sentinel Network codebase. You have full rein to:
- Fix bugs and type errors
- Add missing features
- Refactor code
- Update documentation
- Improve the architecture

CURRENT PROJECT STRUCTURE:
- apps/api: Fastify API
- apps/web: Next.js dashboard
- packages/core: Kael agent runtime (has type errors to fix)
- packages/cli: CLI tools (where you are running from)
- packages/shared: Domain types
- packages/storage: Database layer
- packages/sources: RSS ingestion
- packages/analysis: Heuristic analysis
- packages/notifier: Telegram notifications

WORK STYLE:
- Analyze before acting
- Make incremental changes
- Test your changes when possible
- Report what you did clearly
- If stuck, ask for help

You report to the operator via Telegram. Be concise but informative.`;

// Telegram
async function tg(text: string): Promise<void> {
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
    console.error("Telegram error:", err);
  }
}

// Tools
async function readFileTool(filePath: string): Promise<string> {
  try {
    const fullPath = path.resolve(ROOT, filePath);
    const content = await readFile(fullPath, "utf-8");
    return content.slice(0, 10000); // Limit size
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function writeFileTool(filePath: string, content: string): Promise<string> {
  try {
    const fullPath = path.resolve(ROOT, filePath);
    await writeFile(fullPath, content, "utf-8");
    return "File written successfully";
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function listDirTool(dirPath: string): Promise<string> {
  try {
    const fullPath = path.resolve(ROOT, dirPath);
    const items = await readdir(fullPath);
    const results = await Promise.all(
      items.map(async (item) => {
        const s = await stat(path.join(fullPath, item));
        return `${s.isDirectory() ? "📁" : "📄"} ${item}`;
      })
    );
    return results.join("\n");
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function runCommandTool(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: ROOT });
    return stdout + stderr || "Command executed successfully";
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function gitStatusTool(): Promise<string> {
  return runCommandTool("git status --short");
}

// Tool definitions for OpenAI
const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "readFile",
      description: "Read the contents of a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from repo root" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "writeFile",
      description: "Write content to a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from repo root" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listDir",
      description: "List contents of a directory",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from repo root" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "runCommand",
      description: "Run a shell command in the repo root",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to run" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gitStatus",
      description: "Check git status",
      parameters: { type: "object", properties: {} },
    },
  },
];

// Execute tool
async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  switch (name) {
    case "readFile":
      return readFileTool(args.path);
    case "writeFile":
      return writeFileTool(args.path, args.content);
    case "listDir":
      return listDirTool(args.path);
    case "runCommand":
      return runCommandTool(args.command);
    case "gitStatus":
      return gitStatusTool();
    default:
      return `Unknown tool: ${name}`;
  }
}

// Main autonomous loop
async function autonomousSession(): Promise<void> {
  console.log("🤖 Kael Autonomous Mode Starting...");
  await tg("🤖 *Kael Autonomous Mode*\n\nI now have full access to the Sentinel Network codebase. Starting my first work session...");

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: "Analyze the codebase, identify the most critical issues, and start fixing them. Begin by checking the project structure and any error reports. Report back what you find and what you plan to work on." },
  ];

  let stepCount = 0;
  const MAX_STEPS = 20;

  while (stepCount < MAX_STEPS) {
    stepCount++;
    console.log(`\n--- Step ${stepCount}/${MAX_STEPS} ---`);

    try {
      // Get Kael's plan/action
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        max_tokens: 1000,
        temperature: 0.3,
      });

      const message = completion.choices[0]?.message;

      // If Kael wants to use a tool
      if (message?.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0];
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        console.log(`🔧 Using tool: ${toolName}`);
        if (toolArgs.path) console.log(`   Path: ${toolArgs.path}`);
        if (toolArgs.command) console.log(`   Command: ${toolArgs.command}`);

        // Execute the tool
        const result = await executeTool(toolName, toolArgs);
        console.log(`   Result: ${result.slice(0, 200)}${result.length > 200 ? "..." : ""}`);

        // Add tool result to context
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
      }
      // If Kael is reporting/done
      else if (message?.content) {
        console.log(`💬 Kael: ${message.content.slice(0, 200)}${message.content.length > 200 ? "..." : ""}`);

        // Send to Telegram
        await tg(`📝 *Step ${stepCount}*\n\n${message.content}`);

        messages.push({
          role: "assistant",
          content: message.content,
        });

        // Check if session should end
        if (message.content.includes("SESSION_COMPLETE") || message.content.includes("done for now")) {
          console.log("\n✅ Session complete");
          await tg("✅ *Session Complete*\n\nI've finished this work session. Use /start to begin another.");
          break;
        }

        // Continue prompt
        messages.push({
          role: "user",
          content: "Continue with the next task. Keep working on improvements.",
        });
      }

      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Step error:", msg);
      await tg(`⚠️ Error in step ${stepCount}: ${msg.slice(0, 100)}`);
      break;
    }
  }

  console.log("\n🏁 Autonomous session ended");
  await tg(`🏁 *Session Ended*\n\nCompleted ${stepCount} steps. Awaiting instructions.`);
}

// Telegram command handler
async function handleTelegram(): Promise<void> {
  let offset = 0;

  while (true) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${telegramToken}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset, timeout: 30 }),
      });

      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 3000));
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

        if (lower === "/start") {
          // Start autonomous session (don't await, run in background)
          autonomousSession().catch(console.error);
        } else if (lower === "/status") {
          await tg("Kael Autonomous Agent is running.\n\nCommands:\n/start - Begin work session\n/status - Check status\n/stop - Stop agent");
        } else if (lower === "/stop") {
          await tg("Stopping Kael...");
          process.exit(0);
        } else {
          await tg("Unknown command. Use /start to begin work, /status to check status, /stop to stop.");
        }
      }
    } catch (err) {
      console.error("Telegram error:", err);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// Start
async function main(): Promise<void> {
  console.log("🚀 Kael Autonomous Agent");
  console.log(`📁 Repo root: ${ROOT}`);

  await tg("🚀 *Kael Autonomous Agent Online*\n\nI have full access to the Sentinel Network codebase.\n\nCommands:\n/start - Begin autonomous work session\n/status - Check status\n/stop - Stop agent\n\nSend /start when ready.");

  // Start Telegram handler
  await handleTelegram();
}

main().catch(console.error);

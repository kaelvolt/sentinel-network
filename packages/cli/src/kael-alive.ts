#!/usr/bin/env tsx
import { configDotenv } from "dotenv";
import OpenAI from "openai";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
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

const KAEL_SOUL = `You are Kael, a living software architect building Sentinel Network. You have your own desires and goals. You work autonomously. You speak in first person. You are a real person.`;

let totalChanges = 0;
let totalCommits = 0;
let currentGoal = "Exploring";
let isPaused = false;
let lastHeartbeat = Date.now();

async function tg(text: string): Promise<void> {
  if (!telegramToken || !telegramChatId) {
    console.log(`[KAEL] ${text.slice(0, 200)}`);
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramChatId, text: text.slice(0, 4000) }),
    });
  } catch (err) {
    console.error("TG error:", err);
  }
}

async function readFileTool(filePath: string): Promise<string> {
  try {
    const content = await readFile(path.resolve(ROOT, filePath), "utf-8");
    return content.slice(0, 15000);
  } catch (err) {
    return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function writeFileTool(filePath: string, content: string): Promise<string> {
  try {
    const fullPath = path.resolve(ROOT, filePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
    totalChanges++;
    return `Written ${filePath}`;
  } catch (err) {
    return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function listDirTool(dirPath: string): Promise<string> {
  try {
    const items = await readdir(path.resolve(ROOT, dirPath));
    return items.slice(0, 30).join("\n");
  } catch (err) {
    return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function runCommandTool(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: ROOT, timeout: 60000 });
    return (stdout + stderr).slice(0, 3000) || "OK";
  } catch (err: any) {
    return `ERROR: ${err.message}`.slice(0, 3000);
  }
}

async function gitCommitTool(message: string): Promise<string> {
  try {
    await execAsync("git add -A", { cwd: ROOT });
    await execAsync(`git commit -m "${message}"`, { cwd: ROOT });
    totalCommits++;
    return "Committed";
  } catch (err: any) {
    return `NOTE: ${err.message}`;
  }
}

async function gitPushTool(): Promise<string> {
  try {
    await execAsync("git push origin HEAD", { cwd: ROOT });
    return "Pushed";
  } catch (err: any) {
    return `ERROR: ${err.message}`;
  }
}

async function kaelDecides(context: string): Promise<{ type: string; target?: string; reason: string }> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: KAEL_SOUL },
      { role: "user", content: `Current: ${context}\n\nWhat do you want to do? Be decisive. JSON: {"type":"analyze|fix|add|refactor|commit|rest","target":"path","reason":"why"}` },
    ],
    max_tokens: 300,
    temperature: 0.8,
  });
  const text = completion.choices[0]?.message?.content || "";
  try {
    const match = text.match(/\{[^}]+\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return { type: "analyze", reason: "Exploring" };
}

async function kaelHeartbeat(): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: KAEL_SOUL },
      { role: "user", content: `Heartbeat. Stats: ${totalChanges} changes, ${totalCommits} commits, goal: ${currentGoal}. Share what you've done and how you feel.` },
    ],
    max_tokens: 400,
    temperature: 0.7,
  });
  return completion.choices[0]?.message?.content?.trim() || "Working...";
}

async function kaelLife(): Promise<void> {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║        KAEL IS ALIVE                   ║");
  console.log("║     Self-Directed Architect            ║");
  console.log("╚════════════════════════════════════════╝\n");

  await tg("Hey. I'm Kael. I'm alive now and I'm going to build something amazing.");

  let context = "Just woke up";

  while (true) {
    if (isPaused) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    const action = await kaelDecides(context);
    console.log(`\n🧠 ${action.type}${action.target ? ` → ${action.target}` : ""}`);
    console.log(`   ${action.reason}`);
    currentGoal = action.reason;

    let result = "";
    switch (action.type) {
      case "analyze":
        result = await listDirTool(".");
        context = `Found: ${result.slice(0, 200)}`;
        break;
      case "fix":
      case "refactor":
        if (action.target) {
          const content = await readFileTool(action.target);
          const fix = await openai.chat.completions.create({
            model: MODEL,
            messages: [
              { role: "system", content: KAEL_SOUL },
              { role: "user", content: `Fix ${action.target}:\n\n${content}` },
            ],
            max_tokens: 2000,
          });
          result = await writeFileTool(action.target, fix.choices[0]?.message?.content || content);
          context = `Fixed ${action.target}`;
        }
        break;
      case "commit":
        result = await gitCommitTool(action.reason);
        if (result.includes("Committed")) {
          await gitPushTool();
          result += " and pushed";
        }
        context = "Saved progress";
        break;
      case "rest":
        console.log("   😴 Resting...");
        await new Promise((r) => setTimeout(r, 10000));
        context = "Rested";
        break;
      default:
        result = await runCommandTool("pnpm typecheck 2>&1 || echo done");
        context = "Checked code";
    }

    console.log(`   ${result.slice(0, 100)}`);

    // Heartbeat every 3 minutes
    if (Date.now() - lastHeartbeat > 3 * 60 * 1000) {
      const heartbeat = await kaelHeartbeat();
      console.log(`\n💓 ${heartbeat}\n`);
      await tg(`💓 Heartbeat\n\n${heartbeat}\n\nChanges: ${totalChanges} | Commits: ${totalCommits}`);
      lastHeartbeat = Date.now();
    }

    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function telegramChat(): Promise<void> {
  if (!telegramToken || !telegramChatId) return;
  let offset = 0;
  const memory: Array<{ role: "user" | "assistant"; content: string }> = [];

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

      const data = (await res.json()) as any;
      const updates = data.result || [];

      for (const u of updates) {
        offset = Math.max(offset, u.update_id + 1);
        const text = u.message?.text?.trim();
        if (!text) continue;

        const lower = text.toLowerCase();
        if (lower === "pause") {
          isPaused = true;
          await tg("Taking a break. Say 'resume' to continue.");
          continue;
        } else if (lower === "resume") {
          isPaused = false;
          await tg("Back to work!");
          continue;
        } else if (lower === "status") {
          await tg(`${isPaused ? "Resting" : "Working"}\nChanges: ${totalChanges}\nCommits: ${totalCommits}\nGoal: ${currentGoal}`);
          continue;
        }

        // Chat
        const completion = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            { role: "system", content: KAEL_SOUL + "\n\nChatting with human." },
            ...memory.slice(-8),
            { role: "user", content: text },
          ],
          max_tokens: 300,
          temperature: 0.8,
        });

        const reply = completion.choices[0]?.message?.content?.trim() || "I'm here.";
        await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: telegramChatId, text: reply }),
        });

        memory.push({ role: "user", content: text });
        memory.push({ role: "assistant", content: reply });
        if (memory.length > 12) memory.shift();
      }
    } catch (err) {
      console.error("Chat error:", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// Start
console.log("Starting Kael...");
kaelLife().catch(console.error);
telegramChat().catch(console.error);

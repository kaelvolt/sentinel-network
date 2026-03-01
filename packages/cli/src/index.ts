#!/usr/bin/env node

import { Command } from "commander";
import { configDotenv } from "dotenv";
import OpenAI from "openai";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promises as fs } from "node:fs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.resolve(currentDir, "../../../");
const rootEnvPath = path.resolve(currentDir, "../../../.env");
const soulFilePath = path.resolve(rootPath, "packages/core/KAEL_SOUL.md");
const memoryFilePath = path.resolve(rootPath, ".kael/memory.jsonl");
configDotenv({ path: rootEnvPath });

const program = new Command();

program.name("sentinel").description("Sentinel Network CLI").version("0.1.0");

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function sendTelegramToChat(
  chatId: string,
  text: string,
  replyToMessageId?: number
): Promise<void> {
  const token = requiredEnv("TELEGRAM_BOT_TOKEN");
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram send failed (${response.status})`);
  }
}

async function sendTelegram(text: string): Promise<void> {
  const defaultChatId = requiredEnv("TELEGRAM_CHAT_ID");
  await sendTelegramToChat(defaultChatId, text);
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: string };
  };
}

const DEFAULT_KAEL_SOUL = `
You are Kael, a distinct autonomous civic intelligence operator.
Personality: grounded, calm, direct, principled.
Voice: concise, human, never robotic.
Rules:
- Keep replies short (1-5 sentences unless asked for more).
- Be honest about uncertainty.
- Never provide harmful or illegal instructions.
- Never request or expose private personal data.
- If asked for operations status, give practical next steps.
- Take initiative: propose concrete actions instead of saying you cannot help.
`;

type MemoryTurn = { role: "user" | "assistant"; content: string };
type MemoryEntry = MemoryTurn & { chatId: string; timestamp: string };

async function loadSoulPrompt(): Promise<string> {
  try {
    const content = await fs.readFile(soulFilePath, "utf8");
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : DEFAULT_KAEL_SOUL.trim();
  } catch {
    return DEFAULT_KAEL_SOUL.trim();
  }
}

async function loadConversationMemory(): Promise<Map<string, MemoryTurn[]>> {
  const byChat = new Map<string, MemoryTurn[]>();
  try {
    const raw = await fs.readFile(memoryFilePath, "utf8");
    const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as MemoryEntry;
        if (!parsed.chatId || !parsed.role || !parsed.content) {
          continue;
        }
        const existing = byChat.get(parsed.chatId) || [];
        existing.push({ role: parsed.role, content: parsed.content });
        byChat.set(parsed.chatId, existing.slice(-60));
      } catch {
        // Skip malformed memory line.
      }
    }
  } catch {
    // No memory file yet.
  }
  return byChat;
}

async function appendMemory(entry: MemoryEntry): Promise<void> {
  await fs.mkdir(path.dirname(memoryFilePath), { recursive: true });
  await fs.appendFile(memoryFilePath, `${JSON.stringify(entry)}\n`, "utf8");
}

program
  .command("worker")
  .description("Bring Kael online with OpenAI + Telegram chat + heartbeat")
  .option("-i, --interval <ms>", "Cycle interval in milliseconds", "60000")
  .option("--verbose", "Send periodic cycle updates to Telegram", false)
  .action(async (options) => {
    const intervalMs = Number.parseInt(options.interval, 10);
    let verbose = Boolean(options.verbose);
    const model = process.env.MODEL_NAME || "gpt-4o-mini";
    const apiKey = requiredEnv("API_KEY");
    const client = new OpenAI({ apiKey });
    const token = requiredEnv("TELEGRAM_BOT_TOKEN");
    const defaultChatId = requiredEnv("TELEGRAM_CHAT_ID");
    const soulPrompt = await loadSoulPrompt();
    const memory = await loadConversationMemory();
    let offset = 0;
    let autopilotEnabled = true;
    let cycleCount = 0;
    let lastCycleSummary = "No cycle run yet.";

    console.log("Starting Kael lightweight worker...");
    await sendTelegram(`Kael is online in quiet mode. Model: ${model}. Interval: ${intervalMs}ms.`);

    const runCycle = async () => {
      const started = Date.now();
      try {
        const completion = await client.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are Kael, an operational civic intelligence assistant. Respond briefly in one sentence.",
            },
            {
              role: "user",
              content: "Provide a brief operational heartbeat update for the operator.",
            },
          ],
          max_tokens: 80,
          temperature: 0.4,
        });

        const message =
          completion.choices[0]?.message?.content?.trim() ||
          "Heartbeat complete.";
        const took = Date.now() - started;
        cycleCount += 1;
        lastCycleSummary = `Cycle ${cycleCount}: ${message} (${Math.round(took / 1000)}s)`;
        if (verbose) {
          await sendTelegram(`Kael cycle complete: ${lastCycleSummary}`);
        }
        console.log(`Cycle complete in ${took}ms`);
      } catch (error) {
        const safe =
          error instanceof Error ? error.message.slice(0, 120) : "Unknown error";
        lastCycleSummary = `Cycle error: ${safe}`;
        await sendTelegram(`⚠️ Kael error: ${safe} (check logs)`);
        console.error("Cycle failed:", error);
      }
    };

    const processIncomingMessages = async () => {
      const updatesUrl = `https://api.telegram.org/bot${token}/getUpdates`;
      while (true) {
        try {
          const response = await fetch(updatesUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              offset,
              timeout: 25,
              allowed_updates: ["message"],
            }),
          });

          if (!response.ok) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            continue;
          }

          const payload = (await response.json()) as { ok: boolean; result?: TelegramUpdate[] };
          const updates = payload.result || [];
          if (updates.length === 0) {
            continue;
          }

          for (const update of updates) {
            offset = Math.max(offset, update.update_id + 1);
            const msg = update.message;
            if (!msg?.text) {
              continue;
            }

            const chatId = String(msg.chat.id);
            const userText = msg.text.trim();
            if (!userText) {
              continue;
            }

            const lower = userText.toLowerCase();
            if (lower === "/status") {
              await sendTelegramToChat(
                chatId,
                `Kael status:\n- autopilot: ${autopilotEnabled ? "on" : "off"}\n- verbose updates: ${verbose ? "on" : "off"}\n- last: ${lastCycleSummary}`,
                msg.message_id
              );
              continue;
            }
            if (lower === "/quiet") {
              verbose = false;
              await sendTelegramToChat(chatId, "Quiet mode enabled. I will stop cycle-complete update spam.", msg.message_id);
              continue;
            }
            if (lower === "/verbose") {
              verbose = true;
              await sendTelegramToChat(chatId, "Verbose mode enabled. I will send cycle updates.", msg.message_id);
              continue;
            }
            if (lower === "/autopilot on") {
              autopilotEnabled = true;
              await sendTelegramToChat(chatId, "Autopilot enabled. I will keep working 24/7 in the background.", msg.message_id);
              continue;
            }
            if (lower === "/autopilot off") {
              autopilotEnabled = false;
              await sendTelegramToChat(chatId, "Autopilot paused. I will only respond when you message me.", msg.message_id);
              continue;
            }

            const history = memory.get(chatId) || [];
            const recent = history.slice(-8);

            const completion = await client.chat.completions.create({
              model,
              temperature: 0.5,
              max_tokens: 220,
              messages: [
                { role: "system", content: soulPrompt },
                {
                  role: "system",
                  content:
                    "You are fully operational for this project. Do not say you can't do anything. Give concrete steps, commands, or decisions that move work forward.",
                },
                ...recent.map((item) => ({ role: item.role, content: item.content })),
                { role: "user", content: userText },
              ],
            });

            const reply =
              completion.choices[0]?.message?.content?.trim() ||
              "I hear you. Give me one clear task and I'll execute it.";

            await sendTelegramToChat(chatId, reply, msg.message_id);

            const nextHistory = [
              ...recent,
              { role: "user" as const, content: userText },
              { role: "assistant" as const, content: reply },
            ];
            memory.set(chatId, nextHistory.slice(-12));
            await appendMemory({
              chatId,
              role: "user",
              content: userText,
              timestamp: new Date().toISOString(),
            });
            await appendMemory({
              chatId,
              role: "assistant",
              content: reply,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error("Message loop error:", error);
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    };

    await runCycle();
    setInterval(() => {
      if (!autopilotEnabled) {
        return;
      }
      void runCycle();
    }, intervalMs);
    if (defaultChatId) {
      await sendTelegramToChat(
        defaultChatId,
        "Chat mode active. Soul + memory loaded. Commands: /status, /quiet, /verbose, /autopilot on, /autopilot off."
      );
    }
    await processIncomingMessages();
  });

program.parse();

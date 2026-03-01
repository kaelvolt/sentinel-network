#!/usr/bin/env tsx
/**
 * Kael Worker - Standalone Agent
 * Minimal working implementation using OpenAI
 */

import { configDotenv } from "dotenv";
import OpenAI from "openai";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../../.env");
console.log("Loading .env from:", envPath);
configDotenv({ path: envPath });

// Check env
const apiKey = process.env.API_KEY;
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

if (!apiKey || !telegramToken || !telegramChatId) {
  console.error("Missing required env vars: API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID");
  process.exit(1);
}

const openai = new OpenAI({ apiKey });
const model = "gpt-4o-mini";

const SOUL = `You are Kael, an autonomous civic intelligence operator.
Personality: calm, direct, principled, grounded.
Keep replies short (1-3 sentences). Be honest about uncertainty.
Propose concrete actions, not excuses.`;

// Telegram sender
async function tg(text: string): Promise<void> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramChatId, text }),
    });
    if (!res.ok) console.error("Telegram failed:", res.status);
  } catch (err) {
    console.error("Telegram error:", err);
  }
}

// Memory per chat
const memory = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>();

// Main worker loop
async function runCycle(): Promise<void> {
  const start = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SOUL },
        { role: "user", content: "Provide a brief operational status update." },
      ],
      max_tokens: 100,
      temperature: 0.4,
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "Cycle complete.";
    const took = Date.now() - start;

    console.log(`[Cycle] ${reply} (${took}ms)`);
    await tg(`Kael: ${reply}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Cycle] Error:", msg);
    await tg(`⚠️ Error: ${msg.slice(0, 100)}`);
  }
}

// Telegram command handler
async function handleCommands(): Promise<void> {
  let offset = 0;

  while (true) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${telegramToken}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset, timeout: 25 }),
      });

      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      const data = (await res.json()) as { result?: Array<{ update_id: number; message?: { chat: { id: number }; text?: string; message_id: number } }> };
      const updates = data.result || [];

      for (const u of updates) {
        offset = Math.max(offset, u.update_id + 1);
        const text = u.message?.text?.trim();
        if (!text) continue;

        const chatId = String(u.message.chat.id);
        const lower = text.toLowerCase();

        // Commands
        if (lower === "/status") {
          await tg("Kael status: running");
          continue;
        }
        if (lower === "/stop") {
          await tg("Stopping Kael.");
          process.exit(0);
        }

        // Chat with memory
        const hist = memory.get(chatId) || [];
        const completion = await openai.chat.completions.create({
          model,
          messages: [
            { role: "system", content: SOUL },
            ...hist.slice(-6),
            { role: "user", content: text },
          ],
          max_tokens: 200,
          temperature: 0.5,
        });

        const reply = completion.choices[0]?.message?.content?.trim() || "I hear you.";
        await tg(reply);

        // Store memory
        const next = [...hist, { role: "user" as const, content: text }, { role: "assistant" as const, content: reply }];
        memory.set(chatId, next.slice(-10));
      }
    } catch (err) {
      console.error("Command loop error:", err);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// Start
async function main(): Promise<void> {
  console.log("Kael Worker starting...");
  await tg("Kael is online. Commands: /status, /stop");

  // Run initial cycle
  await runCycle();

  // Handle Telegram commands
  await handleCommands();
}

main().catch(console.error);

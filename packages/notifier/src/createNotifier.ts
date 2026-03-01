/**
 * Notifier factory - creates appropriate notifier based on configuration
 */

import type { Notifier } from './types.js';
import { TelegramNotifier } from './telegramNotifier.js';
import { NoopNotifier } from './noopNotifier.js';
import { getConfig } from './config.js';

/**
 * Create a notifier instance based on environment configuration
 * - Uses Telegram if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set
 * - Falls back to NoopNotifier otherwise
 */
export function createNotifier(): Notifier {
  const config = getConfig();

  if (config.telegram.token && config.telegram.chatId) {
    return new TelegramNotifier(config.telegram.token, config.telegram.chatId);
  }

  return new NoopNotifier();
}

/**
 * Create a Telegram notifier explicitly
 */
export function createTelegramNotifier(token: string, chatId: string): Notifier {
  return new TelegramNotifier(token, chatId);
}

/**
 * Create a no-op notifier for testing or when notifications are disabled
 */
export function createNoopNotifier(): Notifier {
  return new NoopNotifier();
}

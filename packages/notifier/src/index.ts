/**
 * @kael/notifier - Notification package for Sentinel Network
 * Supports Telegram notifications with automatic fallback to no-op
 */

// Types
export type {
  Notifier,
  TelegramConfig,
  SendMessageOptions,
  SignalAlertOptions,
  DigestOptions,
} from './types.js';

// Core notifier implementations
export { TelegramNotifier } from './telegramNotifier.js';
export { NoopNotifier } from './noopNotifier.js';

// Factory functions
export {
  createNotifier,
  createTelegramNotifier,
  createNoopNotifier,
} from './createNotifier.js';

// Telegram API functions
export {
  sendMessage,
  sendSignalAlert,
  sendDigest,
  sendPlainText,
} from './telegram.js';

// Utilities
export { fetchWithRetry, FetchError } from './fetcher.js';
export { getConfig, hasTelegramConfig } from './config.js';

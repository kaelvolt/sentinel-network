/**
 * Telegram notification implementation
 * Handles sending messages, signal alerts, and digests via Telegram Bot API
 */

import { fetchWithRetry, FetchError } from './fetcher.js';
import type { SendMessageOptions, SignalAlertOptions, DigestOptions } from './types.js';
import type { Signal, Digest, ConfidenceLabel, SeverityLevel } from '@kael/shared';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const MAX_MESSAGE_LENGTH = 4096;

/**
 * Send a message to a Telegram chat
 */
export async function sendMessage(options: SendMessageOptions): Promise<void> {
  const {
    token,
    chatId,
    text,
    parseMode = 'MarkdownV2',
    disableWebPreview = true,
    replyToMessageId,
  } = options;

  // Truncate if exceeds max length
  const safeText = text.length > MAX_MESSAGE_LENGTH
    ? text.slice(0, MAX_MESSAGE_LENGTH - 3) + '...'
    : text;

  const url = `${TELEGRAM_API_BASE}${token}/sendMessage`;

  const body = {
    chat_id: chatId,
    text: safeText,
    parse_mode: parseMode,
    disable_web_page_preview: disableWebPreview,
    ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
  };

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    timeout: 30000,
    retries: 3,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new FetchError(`Telegram API error: ${error}`, response.status);
  }
}

/**
 * Escape MarkdownV2 special characters
 * Telegram requires escaping: _ * [ ] ( ) ~ ` > # + - = | { } . !
 */
function escapeMarkdown(text: string): string {
  return text
    .replace(/[_*\[\]()~`>#+=|{}]/g, '\\$&')
    .replace(/!/g, '\\!');
}

/**
 * Format confidence label for display
 */
function formatConfidence(confidence: number): string {
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.5) return 'Medium';
  return 'Low';
}

/**
 * Format severity level for display
 */
function formatSeverity(severity: number): string {
  const levels = ['Info', 'Low', 'Medium', 'High', 'Critical', 'Emergency'];
  return levels[Math.min(severity, 5)] || 'Unknown';
}

/**
 * Get emoji for severity level
 */
function getSeverityEmoji(severity: number): string {
  const emojis = ['ℹ️', '🟢', '🟡', '🟠', '🔴', '🚨'];
  return emojis[Math.min(severity, 5)] || '❓';
}

/**
 * Format signal tags for display
 */
function formatTags(tags: string[] | undefined): string {
  if (!tags || tags.length === 0) return '';
  return tags.map(tag => `#${escapeMarkdown(tag.replace(/\s+/g, '_'))}`).join(' ');
}

/**
 * Send a signal alert notification
 */
export async function sendSignalAlert(
  token: string,
  chatId: string,
  options: SignalAlertOptions
): Promise<void> {
  const { signal, evidenceLinks } = options;

  const severityEmoji = getSeverityEmoji(signal.severity);
  const severityText = formatSeverity(signal.severity);
  const confidenceText = formatConfidence(signal.confidence);

  const lines = [
    `${severityEmoji} *Signal Alert* ${severityEmoji}`,
    '',
    `*Title:* ${escapeMarkdown(signal.title)}`,
    `*Severity:* ${escapeMarkdown(severityText)}`,
    `*Confidence:* ${escapeMarkdown(confidenceText)}`,
  ];

  if (signal.tags && signal.tags.length > 0) {
    lines.push(`*Tags:* ${formatTags(signal.tags)}`);
  }

  lines.push('');

  if (signal.summary) {
    lines.push(`*Summary:*`);
    lines.push(escapeMarkdown(signal.summary));
    lines.push('');
  }

  if (evidenceLinks.length > 0) {
    lines.push('*Evidence:*');
    evidenceLinks.forEach((link, index) => {
      lines.push(`${index + 1}\. [Source ${index + 1}](${escapeMarkdown(link)})`);
    });
    lines.push('');
  }

  lines.push(`_Created: ${escapeMarkdown(new Date(signal.createdAt).toLocaleString())}_`);

  const text = lines.join('\n');

  await sendMessage({
    token,
    chatId,
    text,
    parseMode: 'MarkdownV2',
    disableWebPreview: false,
  });
}

/**
 * Send a digest notification
 */
export async function sendDigest(
  token: string,
  chatId: string,
  options: DigestOptions
): Promise<void> {
  const { digest } = options;

  const lines = [
    '📰 *Daily Digest*',
    '',
    `*${escapeMarkdown(digest.title)}*`,
    '',
  ];

  if (digest.summary) {
    lines.push(escapeMarkdown(digest.summary));
    lines.push('');
  }

  if (digest.kaelNotes) {
    lines.push('*Kael\'s Notes:*');
    lines.push(escapeMarkdown(digest.kaelNotes));
    lines.push('');
  }

  lines.push(`_Period: ${escapeMarkdown(new Date(digest.periodStart).toLocaleDateString())} \- ${escapeMarkdown(new Date(digest.periodEnd).toLocaleDateString())}_`);
  lines.push(`_Signals: ${digest.signalCount}_`);

  const headerText = lines.join('\n');

  // Send header first
  await sendMessage({
    token,
    chatId,
    text: headerText,
    parseMode: 'MarkdownV2',
    disableWebPreview: true,
  });

  // Send digest content in chunks if needed
  if (digest.content) {
    const chunks = chunkMessage(digest.content, MAX_MESSAGE_LENGTH - 100);
    for (const chunk of chunks) {
      await sendMessage({
        token,
        chatId,
        text: escapeMarkdown(chunk),
        parseMode: 'MarkdownV2',
        disableWebPreview: false,
      });
    }
  }
}

/**
 * Chunk a long message into smaller pieces
 */
function chunkMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to find a good break point
    let breakPoint = remaining.lastIndexOf('\n\n', maxLength);
    if (breakPoint === -1) breakPoint = remaining.lastIndexOf('\n', maxLength);
    if (breakPoint === -1) breakPoint = remaining.lastIndexOf('. ', maxLength);
    if (breakPoint === -1 || breakPoint < maxLength * 0.5) breakPoint = maxLength;

    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return chunks;
}

/**
 * Send a simple text message
 */
export async function sendPlainText(
  token: string,
  chatId: string,
  text: string
): Promise<void> {
  await sendMessage({
    token,
    chatId,
    text: escapeMarkdown(text),
    parseMode: 'MarkdownV2',
    disableWebPreview: true,
  });
}

import type { Signal, Digest } from '@kael/shared';

export interface Notifier {
  send(text: string): Promise<void>;
  alertSignal(signal: Signal, evidenceLinks: string[]): Promise<void>;
  sendDigest(title: string, markdown: string): Promise<void>;
}

export interface TelegramConfig {
  token: string;
  chatId: string;
  defaultParseMode?: 'MarkdownV2' | 'HTML';
}

export interface SendMessageOptions {
  token: string;
  chatId: string;
  text: string;
  parseMode?: 'MarkdownV2' | 'HTML';
  disableWebPreview?: boolean;
  replyToMessageId?: number;
}

export interface SignalAlertOptions {
  signal: Signal;
  evidenceLinks: string[];
}

export interface DigestOptions {
  digest: Digest;
}

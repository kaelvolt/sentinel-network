import type { Notifier } from './types.js';
import type { Signal } from '@kael/shared';

/**
 * No-op notifier implementation for testing or when notifications are disabled.
 * Logs to console instead of sending actual notifications.
 */
export class NoopNotifier implements Notifier {
  async send(text: string): Promise<void> {
    console.log('[NoopNotifier] send:', text);
  }

  async alertSignal(signal: Signal, evidenceLinks: string[]): Promise<void> {
    console.log('[NoopNotifier] alertSignal:', { signal, evidenceLinks });
  }

  async sendDigest(title: string, markdown: string): Promise<void> {
    console.log('[NoopNotifier] sendDigest:', { title, markdown });
  }
}

import { Source } from '@kael/shared';
import { createAdapter, SourceAdapter } from '../adapters/index.js';
import { logger } from '@kael/core';

export interface SyncResult {
  sourceId: string;
  success: boolean;
  recordCount: number;
  duration: number;
  error?: string;
}

export class SyncManager {
  private adapters = new Map<string, SourceAdapter>();

  async syncSource(source: Source): Promise<SyncResult> {
    const startTime = Date.now();

    try {
      const adapter = this.getOrCreateAdapter(source);

      if (!adapter.isConnected()) {
        await adapter.connect();
      }

      const data = await adapter.fetch();

      logger.info(`Source ${source.id} synced`, {
        recordCount: data.length,
        duration: Date.now() - startTime,
      });

      return {
        sourceId: source.id,
        success: true,
        recordCount: data.length,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Source ${source.id} sync failed`, { error: errorMessage });

      return {
        sourceId: source.id,
        success: false,
        recordCount: 0,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  async syncBatch(sources: Source[]): Promise<SyncResult[]> {
    const results = await Promise.all(sources.map((s) => this.syncSource(s)));
    return results;
  }

  private getOrCreateAdapter(source: Source): SourceAdapter {
    let adapter = this.adapters.get(source.id);
    if (!adapter) {
      adapter = createAdapter(source);
      this.adapters.set(source.id, adapter);
    }
    return adapter;
  }

  async disconnectAll(): Promise<void> {
    await Promise.all(
      Array.from(this.adapters.values()).map((adapter) => adapter.disconnect())
    );
    this.adapters.clear();
  }
}

export const syncManager = new SyncManager();

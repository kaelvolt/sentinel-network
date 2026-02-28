import { Source } from '@kael/shared';

export interface SourceAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  fetch(): Promise<unknown[]>;
  validate(config: Record<string, unknown>): boolean;
}

export abstract class BaseSourceAdapter implements SourceAdapter {
  protected config: Record<string, unknown>;
  protected connected = false;

  constructor(config: Record<string, unknown>) {
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract fetch(): Promise<unknown[]>;
  abstract validate(config: Record<string, unknown>): boolean;

  isConnected(): boolean {
    return this.connected;
  }
}

export function createAdapter(source: Source): SourceAdapter {
  switch (source.type) {
    case 'api':
      return new ApiAdapter(source.config);
    case 'database':
      return new DatabaseAdapter(source.config);
    case 'file':
      return new FileAdapter(source.config);
    default:
      throw new Error(`Unknown source type: ${source.type}`);
  }
}

// API Adapter
class ApiAdapter extends BaseSourceAdapter {
  async connect(): Promise<void> {
    // API connections are stateless
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async fetch(): Promise<unknown[]> {
    const { url, headers = {} } = this.config as { url: string; headers?: Record<string, string> };
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as unknown[];
  }

  validate(config: Record<string, unknown>): boolean {
    return typeof config.url === 'string' && config.url.length > 0;
  }
}

// Database Adapter
class DatabaseAdapter extends BaseSourceAdapter {
  async connect(): Promise<void> {
    // Implementation depends on specific database
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async fetch(): Promise<unknown[]> {
    const { query } = this.config as { query: string };
    // Would use actual database client here
    throw new Error('Database adapter not yet implemented');
  }

  validate(config: Record<string, unknown>): boolean {
    return (
      typeof config.connectionString === 'string' && typeof config.query === 'string'
    );
  }
}

// File Adapter
class FileAdapter extends BaseSourceAdapter {
  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async fetch(): Promise<unknown[]> {
    const { path, format = 'json' } = this.config as {
      path: string;
      format?: 'json' | 'csv';
    };
    // Would use file system or storage service here
    throw new Error('File adapter not yet implemented');
  }

  validate(config: Record<string, unknown>): boolean {
    return typeof config.path === 'string';
  }
}

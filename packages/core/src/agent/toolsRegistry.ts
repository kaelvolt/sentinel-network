```typescript
/**
 * Tools Registry for Kael Agent
 * Contains all callable tools with their metadata
 */

import { z } from 'zod';
import {
  sendTelegramUpdate,
  sendTelegramUpdateInputSchema,
} from '../tools/sendTelegramUpdate.js';
import {
  listSources,
  listSourcesInputSchema,
} from '../tools/listSources.js';
import {
  addSource,
  addSourceInputSchema,
} from '../tools/addSource.js';
import {
  fetchAndIngest,
  fetchAndIngestInputSchema,
} from '../tools/fetchAndIngest.js';
import {
  analyzeNewItems,
  analyzeNewItemsInputSchema,
} from '../tools/analyzeNewItems.js';
import {
  generateDigest,
  generateDigestInputSchema,
} from '../tools/generateDigest.js';
import {
  searchRawItems,
  searchRawItemsInputSchema,
} from '../tools/searchRawItems.js';

export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<unknown>;
  execute: (input: unknown) => Promise<{ success: boolean; [key: string]: unknown }>;
}

// Helper to wrap typed functions
const wrapTool = <T>(
  fn: (input: T) => Promise<{ success: boolean; [key: string]: unknown }>
): ((input: unknown) => Promise<{ success: boolean; [key: string]: unknown }>) => {
  return (input: unknown) => fn(input as T);
};

export const toolsRegistry: Tool[] = [
  {
    name: 'listSources',
    description: 'List all configured information sources with their status (enabled/disabled).',
    inputSchema: listSourcesInputSchema,
    execute: wrapTool(listSources as (input: { enabledOnly: boolean; limit: number; }) => Promise<{ success: boolean; [key: string]: unknown }>)
  },
  {
    name: 'addSource',
    description: 'Add a new information source (RSS feed or webhook) to monitor.',
    inputSchema: addSourceInputSchema,
    execute: wrapTool(addSource as (input: { url: string; name: string; kind: "rss" | "web" | "github" | "manual"; reliabilityHint: number; }) => Promise<{ success: boolean; [key: string]: unknown }>)
  },
  {
    name: 'fetchAndIngest',
    description: 'Fetch new content from all enabled sources and ingest as raw items.',
    inputSchema: fetchAndIngestInputSchema,
    execute: wrapTool(fetchAndIngest as (input: { limit: number; sourceIds?: string[] | undefined; }) => Promise<{ success: boolean; [key: string]: unknown }>)
  },
  {
    name: 'analyzeNewItems',
    description: 'Analyze pending raw items to extract claims, form clusters, and generate signals.',
    inputSchema: analyzeNewItemsInputSchema,
    execute: wrapTool(analyzeNewItems as (input: { limit: number; sourceIds?: string[] | undefined; requestId?: string | undefined; }) => Promise<{ success: boolean; [key: string]: unknown }>)
  },
  {
    name: 'generateDigest',
    description: 'Generate a daily summary digest of recent signals and activity.',
    inputSchema: generateDigestInputSchema,
    execute: wrapTool(generateDigest as (input: { hoursBack: number; publish: boolean; requestId?: string | undefined; }) => Promise<{ success: boolean; [key: string]: unknown }>)
  },
  {
    name: 'searchRawItems',
    description: 'Search through raw items by keywords, date range, or source.',
    inputSchema: searchRawItemsInputSchema,
    execute: wrapTool(searchRawItems as (input: { limit: number; query: string; sourceId?: string | undefined; }) => Promise<{ success: boolean; [key: string]: unknown }>)
  },
  {
    name: 'sendTelegramUpdate',
    description: 'Send a brief operational update to the operator via Telegram.',
    inputSchema: sendTelegramUpdateInputSchema,
    execute: wrapTool(sendTelegramUpdate as (input: { text: string; priority: "normal" | "urgent"; }) => Promise<{ success: boolean; [key: string]: unknown }>)
  },
];

/**
 * Get a tool by name
 */
export function getTool(name: string): Tool | undefined {
  return toolsRegistry.find(tool => tool.name === name);
}

/**
 * Get all tool names
 */
export function getToolNames(): string[] {
  return toolsRegistry.map(tool => tool.name);
}

/**
 * Get formatted descriptions of all tools
 */
export function getToolsDescription(): string {
  return toolsRegistry
    .map(tool => `- ${tool.name}: ${tool.description}`)
    .join('\n');
}
```
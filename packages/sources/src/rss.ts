/**
 * RSS feed ingestion adapter
 * Fetches and parses RSS/Atom feeds into normalized items
 */

import Parser from 'rss-parser';
import { logger } from '@kael/shared';
import { fetchWithRetry, FetchOptions } from './fetcher.js';

// Extended parser type with custom fields
export interface RssItem {
  title?: string;
  description?: string;
  summary?: string;
  content?: string;
  contentSnippet?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  published?: string;
  isoDate?: string;
  creator?: string;
  author?: string;
  categories?: string[];
  enclosure?: {
    url?: string;
    type?: string;
    length?: string;
  };
  // Common RSS extensions
  'dc:creator'?: string;
  'content:encoded'?: string;
}

export interface RssFeed {
  title?: string;
  description?: string;
  link?: string;
  language?: string;
  lastBuildDate?: string;
  items: RssItem[];
}

export interface FetchRssResult {
  feed: RssFeed;
  meta: {
    url: string;
    fetchedAt: Date;
    durationMs: number;
    itemCount: number;
  };
}

/**
 * Create RSS parser instance
 */
function createParser(): Parser<RssItem, RssFeed> {
  return new Parser({
    customFields: {
      feed: ['language', 'lastBuildDate'],
      item: [
        'content:encoded',
        'dc:creator',
        'summary',
        'contentSnippet',
        'creator',
        'categories',
      ],
    },
    timeout: 30000, // 30 second parser timeout (separate from fetch timeout)
  });
}

/**
 * Fetch and parse an RSS feed
 * @param url - The RSS feed URL
 * @param options - Fetch options for retry/timeout configuration
 * @returns Parsed feed with metadata
 */
export async function fetchRssFeed(
  url: string,
  options: FetchOptions = {}
): Promise<FetchRssResult> {
  const startTime = Date.now();

  try {
    // Fetch feed content with retry logic
    const fetchResult = await fetchWithRetry(url, {
      timeoutMs: 15000, // 15s for RSS feeds
      maxRetries: 3,
      retryDelayMs: 1000,
      ...options,
    });

    // Parse the RSS/Atom content
    const parser = createParser();
    const parsed = await parser.parseString(fetchResult.data);

    const durationMs = Date.now() - startTime;

    // Normalize feed structure
    const feed: RssFeed = {
      title: parsed.title,
      description: parsed.description,
      link: parsed.link,
      language: parsed.language,
      lastBuildDate: parsed.lastBuildDate,
      items: parsed.items.map(item => ({
        ...item,
        // Ensure standard fields exist
        title: item.title || '',
        link: item.link || '',
        pubDate: item.pubDate || item.published || item.isoDate,
      })),
    };

    logger.info(`RSS feed fetched`, {
      url,
      title: feed.title,
      itemCount: feed.items.length,
      durationMs,
    });

    return {
      feed,
      meta: {
        url: fetchResult.url,
        fetchedAt: new Date(),
        durationMs,
        itemCount: feed.items.length,
      },
    };
  } catch (error) {
    logger.error(`Failed to fetch RSS feed`, { url, error });
    throw error;
  }
}

/**
 * Fetch multiple RSS feeds in parallel
 * @param urls - Array of RSS feed URLs
 * @param options - Fetch options
 * @returns Array of results (successful and failed)
 */
export async function fetchMultipleFeeds(
  urls: string[],
  options: FetchOptions = {}
): Promise<Array<{ url: string; result?: FetchRssResult; error?: Error }>> {
  const promises = urls.map(async url => {
    try {
      const result = await fetchRssFeed(url, options);
      return { url, result };
    } catch (error) {
      return {
        url,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  });

  return Promise.all(promises);
}

/**
 * Validate if a URL is likely an RSS feed
 * Quick check based on common RSS file extensions and patterns
 */
export function isLikelyRssUrl(url: string): boolean {
  const rssIndicators = [
    /\.rss$/i,
    /\.xml$/i,
    /feed/i,
    /rss/i,
    /atom/i,
    /\/feeds?\//i,
  ];

  return rssIndicators.some(pattern => pattern.test(url));
}

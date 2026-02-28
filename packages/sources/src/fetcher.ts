/**
 * Generic HTTP fetcher with retry and timeout support
 */

import { logger } from '@kael/core';

export interface FetchOptions {
  /** Timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial retry delay in milliseconds (default: 1000) */
  retryDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Request headers */
  headers?: Record<string, string>;
}

export interface FetchResult {
  data: string;
  statusCode: number;
  headers: Record<string, string>;
  url: string;
  durationMs: number;
}

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly statusCode?: number,
    public readonly attempts: number = 1
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout support using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs: number }
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generic fetch with retries and timeout
 */
export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const {
    timeoutMs = 10000,
    maxRetries = 3,
    retryDelayMs = 1000,
    backoffMultiplier = 2,
    headers = {},
  } = options;

  const defaultHeaders = {
    'User-Agent': 'SentinelNetwork/0.1.0 (Civic Intelligence Platform)',
    'Accept': 'application/rss+xml, application/xml, application/atom+xml, text/xml, */*',
    ...headers,
  };

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();

    try {
      const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: defaultHeaders,
        timeoutMs,
      });

      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        throw new FetchError(
          `HTTP ${response.status}: ${response.statusText}`,
          url,
          response.status,
          attempt
        );
      }

      const data = await response.text();

      // Convert Headers to plain object
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      logger.debug(`Fetch succeeded`, { url, durationMs, attempt });

      return {
        data,
        statusCode: response.status,
        headers: responseHeaders,
        url: response.url || url,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      if (error instanceof FetchError) {
        lastError = error;
      } else if (error instanceof Error && error.name === 'AbortError') {
        lastError = new FetchError(`Request timeout after ${timeoutMs}ms`, url, undefined, attempt);
      } else {
        lastError = new FetchError(
          error instanceof Error ? error.message : 'Unknown error',
          url,
          undefined,
          attempt
        );
      }

      logger.warn(`Fetch attempt ${attempt}/${maxRetries} failed`, {
        url,
        durationMs,
        error: lastError.message,
      });

      // Don't retry on the last attempt
      if (attempt < maxRetries) {
        const delay = retryDelayMs * Math.pow(backoffMultiplier, attempt - 1);
        logger.debug(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Quick fetch with default options
 */
export async function fetchText(url: string): Promise<string> {
  const result = await fetchWithRetry(url);
  return result.data;
}

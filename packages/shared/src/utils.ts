/**
 * Utility functions for the civic intelligence domain model
 */

import { createHash } from 'crypto';

/**
 * Create a stable hash for text content using SHA-256
 * Used for deduplication and content verification
 */
export function stableHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Normalize a URL for consistent comparison and storage
 * - Converts to lowercase
 * - Removes trailing slashes
 * - Removes default ports (80 for http, 443 for https)
 * - Sorts query parameters alphabetically
 * - Decodes percent-encoded characters
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Lowercase protocol and hostname
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove default ports
    if (parsed.protocol === 'http:' && parsed.port === '80') {
      parsed.port = '';
    } else if (parsed.protocol === 'https:' && parsed.port === '443') {
      parsed.port = '';
    }

    // Remove trailing slash from pathname
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname;

    // Sort query parameters
    const params = Array.from(parsed.searchParams.entries());
    params.sort(([a], [b]) => a.localeCompare(b));

    // Rebuild URL
    const sortedParams = new URLSearchParams();
    for (const [key, value] of params) {
      // Skip tracking parameters
      if (isTrackingParameter(key)) continue;
      sortedParams.append(key, value);
    }

    parsed.search = sortedParams.toString() ? `?${sortedParams.toString()}` : '';

    // Remove hash/fragment
    parsed.hash = '';

    return parsed.toString();
  } catch {
    // If URL parsing fails, return normalized string
    return url.toLowerCase().trim();
  }
}

/**
 * Check if a query parameter is a tracking parameter (utm_, fbclid, etc.)
 */
function isTrackingParameter(param: string): boolean {
  const trackingPrefixes = [
    'utm_',
    'fbclid',
    'gclid',
    'twclid',
    'mc_cid',
    'mc_eid',
    'ref',
    'source',
    'campaign',
  ];
  return trackingPrefixes.some((prefix) => param.toLowerCase().startsWith(prefix));
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching and near-duplicate detection
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity ratio between two strings (0-1)
 * 1 = identical, 0 = completely different
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  return 1 - distance / maxLength;
}

/**
 * Chunk an array into smaller arrays of specified size
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

/**
 * Remove extra whitespace and normalize line endings
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Check if a date is within a reasonable range (not in future, not too old)
 */
export function isReasonableDate(date: Date, maxAgeDays: number = 365): boolean {
  const now = new Date();
  const maxAge = new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000);
  return date <= now && date >= maxAge;
}

/**
 * Generate a time-based sortable ID (similar to ULID)
 * Format: timestamp (48 bits) + random (80 bits) = 128 bits = 26 base32 chars
 */
export function generateId(): string {
  const timestamp = Date.now();
  const random = crypto.getRandomValues(new Uint8Array(10));

  // Encode timestamp (6 bytes) + random (10 bytes) = 16 bytes
  const bytes = new Uint8Array(16);
  bytes[0] = (timestamp >> 40) & 0xff;
  bytes[1] = (timestamp >> 32) & 0xff;
  bytes[2] = (timestamp >> 24) & 0xff;
  bytes[3] = (timestamp >> 16) & 0xff;
  bytes[4] = (timestamp >> 8) & 0xff;
  bytes[5] = timestamp & 0xff;
  bytes.set(random, 6);

  // Convert to base32
  return encodeBase32(bytes);
}

/**
 * Encode bytes to Crockford Base32
 */
function encodeBase32(bytes: Uint8Array): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let result = '';
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31];
  }

  return result;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pick specific keys from an object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specific keys from an object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Retry an async function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; delayMs?: number; backoff?: number } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, backoff = 2 } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        throw lastError;
      }

      const delay = delayMs * Math.pow(backoff, attempt - 1);
      await sleep(delay);
    }
  }

  throw lastError;
}

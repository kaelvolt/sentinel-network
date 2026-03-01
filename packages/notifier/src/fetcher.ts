/**
 * Fetch utility with retries, timeouts, and rate limit handling
 */

const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const RATE_LIMIT_RETRY_DELAY_MS = 5000;

interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
}

class FetchError extends Error {
  constructor(
    message: string,
    public status?: number,
    public isRateLimit = false
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number }
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Check if response indicates rate limiting
 */
function isRateLimited(response: Response): boolean {
  return response.status === 429;
}

/**
 * Get retry delay from response headers (if available)
 */
function getRetryAfterMs(response: Response): number {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }
  }
  return RATE_LIMIT_RETRY_DELAY_MS;
}

/**
 * Fetch with automatic retries and rate limit handling
 * Secrets are never logged
 */
export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { retries = MAX_RETRIES, ...fetchOptions } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, fetchOptions);

      if (response.ok) {
        return response;
      }

      // Handle rate limiting
      if (isRateLimited(response)) {
        const delay = getRetryAfterMs(response);
        if (attempt < retries) {
          await sleep(delay);
          continue;
        }
        throw new FetchError(
          `Rate limited after ${retries} retries`,
          response.status,
          true
        );
      }

      // Handle other errors
      const errorMessage = await response.text().catch(() => 'Unknown error');
      throw new FetchError(
        `HTTP ${response.status}: ${errorMessage}`,
        response.status,
        false
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on abort (timeout)
      if (lastError.name === 'AbortError') {
        throw new FetchError(`Request timeout after ${DEFAULT_TIMEOUT}ms`);
      }

      // Check if it's a rate limit error we already handled
      if (error instanceof FetchError && error.isRateLimit) {
        throw error;
      }

      // Retry with exponential backoff
      if (attempt < retries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError || new FetchError('Max retries exceeded');
}

export { FetchError };

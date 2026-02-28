export const APP_NAME = 'Kael Platform';
export const APP_VERSION = '0.0.1';

// API Constants
export const API_PREFIX = '/api/v1';
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Worker Constants
export const WORKER_DEFAULT_CONCURRENCY = 5;
export const WORKER_DEFAULT_TIMEOUT = 30000;
export const JOB_MAX_ATTEMPTS = 3;
export const JOB_RETRY_DELAY = 5000;

// Cache TTL (in seconds)
export const CACHE_TTL = {
  SHORT: 60,
  MEDIUM: 300,
  LONG: 3600,
};

// Rate Limits
export const RATE_LIMITS = {
  DEFAULT: 100,
  API: 1000,
  WEBHOOK: 50,
};

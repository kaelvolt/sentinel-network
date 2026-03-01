import { Redis } from "ioredis";
import { config, logger } from "@kael/shared";

export const redis = new Redis(config.redisUrl, {
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

redis.on("error", (error: Error) => {
  logger.error("Redis error", { error: error.message });
});

export async function closeRedis(): Promise<void> {
  await redis.quit();
  logger.info("Redis connection closed");
}

export async function testConnection(): Promise<boolean> {
  try {
    await redis.ping();
    logger.info("Redis connected successfully");
    return true;
  } catch (error) {
    logger.error("Redis connection failed", { error });
    return false;
  }
}

// Cache helpers
export async function getCache<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  return data ? (JSON.parse(data) as T) : null;
}

export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds: number = 300
): Promise<void> {
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
}

export async function deleteCache(key: string): Promise<void> {
  await redis.del(key);
}

export async function invalidatePattern(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

// Queue helpers for background jobs
export async function enqueue<T>(
  queueName: string,
  data: T,
  options: { delay?: number; priority?: number } = {}
): Promise<void> {
  const { delay = 0, priority = 0 } = options;
  const job = { data, priority, createdAt: Date.now() };

  if (delay > 0) {
    await redis.zadd(`delayed:${queueName}`, Date.now() + delay, JSON.stringify(job));
  } else {
    await redis.lpush(`queue:${queueName}`, JSON.stringify(job));
  }
}

export async function dequeue<T>(queueName: string): Promise<{ data: T } | null> {
  const job = await redis.rpop(`queue:${queueName}`);
  return job ? { data: JSON.parse(job).data } : null;
}

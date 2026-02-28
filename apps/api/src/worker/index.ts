import { configDotenv } from 'dotenv';
import { validateEnv, logger, config } from '@kael/core';
import { db, jobs, eq, lte, redis, enqueue } from '@kael/storage';
import { syncManager } from '@kael/sources';
import { sleep } from '@kael/shared';

configDotenv();
validateEnv();

interface WorkerJob {
  id: string;
  type: string;
  payload: unknown;
}

class Worker {
  private running = false;
  private concurrency: number;

  constructor(concurrency: number = 5) {
    this.concurrency = concurrency;
  }

  async start(): Promise<void> {
    this.running = true;
    logger.info(`Worker started with concurrency ${this.concurrency}`);

    // Start multiple workers
    const workers = Array.from({ length: this.concurrency }, () => this.processLoop());
    await Promise.all(workers);
  }

  async stop(): Promise<void> {
    this.running = false;
    logger.info('Worker stopping...');
  }

  private async processLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.processNextJob();
      } catch (error) {
        logger.error('Worker error', { error });
      }
      // Small delay to prevent tight loop
      await sleep(100);
    }
  }

  private async processNextJob(): Promise<void> {
    // First check delayed jobs
    await this.processDelayedJobs();

    // Get next job from queue or database
    const job = await this.fetchJob();
    if (!job) {
      return;
    }

    await this.executeJob(job);
  }

  private async processDelayedJobs(): Promise<void> {
    const now = Date.now();
    const delayedJobs = await redis.zrangebyscore('delayed:jobs', 0, now);

    for (const jobData of delayedJobs) {
      await redis.zrem('delayed:jobs', jobData);
      await redis.lpush('queue:jobs', jobData);
    }
  }

  private async fetchJob(): Promise<WorkerJob | null> {
    // Try Redis queue first
    const queueJob = await redis.brpop('queue:jobs', 5);
    if (queueJob) {
      const [, data] = queueJob;
      return JSON.parse(data) as WorkerJob;
    }

    // Fall back to database
    const [dbJob] = await db
      .update(jobs)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(jobs.status, 'pending'))
      .returning();

    if (dbJob) {
      return {
        id: dbJob.id,
        type: dbJob.type,
        payload: dbJob.payload,
      };
    }

    return null;
  }

  private async executeJob(job: WorkerJob): Promise<void> {
    const startTime = Date.now();
    logger.info(`Executing job ${job.id} of type ${job.type}`);

    try {
      switch (job.type) {
        case 'sync_source':
          // Handle source sync
          break;
        case 'analyze':
          // Handle analysis
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      // Mark as completed
      await db
        .update(jobs)
        .set({
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));

      logger.info(`Job ${job.id} completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await db
        .update(jobs)
        .set({
          status: 'failed',
          failedAt: new Date(),
          error: errorMessage,
          attempts: sql`${jobs.attempts} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));

      logger.error(`Job ${job.id} failed`, { error: errorMessage });
    }
  }
}

// SQL helper for raw SQL in drizzle
import { sql } from 'drizzle-orm';

const worker = new Worker(config.workerConcurrency);

async function shutdown(): Promise<void> {
  await worker.stop();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

worker.start().catch((error) => {
  logger.error('Worker failed to start', { error });
  process.exit(1);
});

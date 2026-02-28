/**
 * Kael Runtime
 * Main orchestration class for the civic intelligence system
 */

import { logger } from './logger/index.js';
import { config } from './config/index.js';
import { runPipeline, PipelineMetrics } from './orchestrator.js';

export interface KaelRuntimeOptions {
  /** Run interval in milliseconds */
  intervalMs?: number;
  /** Maximum concurrent pipeline runs */
  maxConcurrent?: number;
  /** Graceful shutdown timeout in milliseconds */
  shutdownTimeoutMs?: number;
}

export interface KaelRuntimeState {
  isRunning: boolean;
  isShuttingDown: boolean;
  lastRunAt: Date | null;
  lastMetrics: PipelineMetrics | null;
  totalRuns: number;
  consecutiveErrors: number;
}

/**
 * Kael Runtime - Main orchestrator for ingestion + analysis + publishing
 */
export class KaelRuntime {
  private options: Required<KaelRuntimeOptions>;
  private state: KaelRuntimeState;
  private intervalId: NodeJS.Timeout | null = null;
  private shutdownResolve: (() => void) | null = null;

  constructor(options: KaelRuntimeOptions = {}) {
    this.options = {
      intervalMs: options.intervalMs ?? config.kaelRunIntervalMs,
      maxConcurrent: options.maxConcurrent ?? 1,
      shutdownTimeoutMs: options.shutdownTimeoutMs ?? 30000,
    };

    this.state = {
      isRunning: false,
      isShuttingDown: false,
      lastRunAt: null,
      lastMetrics: null,
      totalRuns: 0,
      consecutiveErrors: 0,
    };

    // Bind signal handlers
    this.handleSignal = this.handleSignal.bind(this);
  }

  /**
   * Get current runtime state (read-only)
   */
  getState(): Readonly<KaelRuntimeState> {
    return { ...this.state };
  }

  /**
   * Check if Kael is enabled via config
   */
  isEnabled(): boolean {
    return config.kaelEnabled;
  }

  /**
   * Run the pipeline once
   * This is the core operation: fetch, analyze, store
   */
  async runOnce(): Promise<{ success: boolean; metrics?: PipelineMetrics; error?: Error }> {
    if (this.state.isShuttingDown) {
      logger.warn('Run aborted: runtime is shutting down');
      return { success: false, error: new Error('Runtime is shutting down') };
    }

    if (!this.isEnabled()) {
      logger.warn('Run aborted: Kael runtime is disabled via config');
      return { success: false, error: new Error('Runtime disabled') };
    }

    logger.info('Starting pipeline run', {
      runNumber: this.state.totalRuns + 1,
    });

    try {
      const result = await runPipeline();

      // Update state
      this.state.lastRunAt = new Date();
      this.state.totalRuns++;
      this.state.lastMetrics = result.metrics;

      if (result.success) {
        this.state.consecutiveErrors = 0;
        logger.info('Pipeline run completed successfully', {
          metrics: result.metrics,
        });
      } else {
        this.state.consecutiveErrors++;
        logger.error('Pipeline run failed', {
          error: result.error,
          consecutiveErrors: this.state.consecutiveErrors,
        });
      }

      return {
        success: result.success,
        metrics: result.metrics,
        error: result.error,
      };
    } catch (error) {
      this.state.consecutiveErrors++;
      logger.error('Unexpected error in runOnce', { error });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Start the continuous run loop
   * Runs the pipeline at configured intervals
   */
  async runForever(): Promise<void> {
    if (this.state.isRunning) {
      logger.warn('Kael runtime is already running');
      return;
    }

    if (!this.isEnabled()) {
      logger.warn('Kael runtime is disabled via config. Call runOnce() for manual execution.');
      return;
    }

    logger.info('Starting Kael runtime loop', {
      intervalMs: this.options.intervalMs,
    });

    this.state.isRunning = true;
    this.state.isShuttingDown = false;

    // Set up signal handlers for graceful shutdown
    process.on('SIGINT', this.handleSignal);
    process.on('SIGTERM', this.handleSignal);

    // Run immediately on start
    await this.runOnce();

    // Set up interval for subsequent runs
    this.intervalId = setInterval(async () => {
      if (this.state.isShuttingDown) {
        return;
      }

      // Check if too many consecutive errors
      if (this.state.consecutiveErrors >= 5) {
        logger.error('Too many consecutive errors, pausing runtime', {
          consecutiveErrors: this.state.consecutiveErrors,
        });
        this.stop();
        return;
      }

      await this.runOnce();
    }, this.options.intervalMs);

    // Wait for shutdown signal
    await new Promise<void>(resolve => {
      this.shutdownResolve = resolve;
    });
  }

  /**
   * Stop the runtime loop
   */
  stop(): void {
    if (!this.state.isRunning) {
      return;
    }

    logger.info('Stopping Kael runtime loop');
    this.state.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Resolve the promise to unblock runForever()
    if (this.shutdownResolve) {
      this.shutdownResolve();
      this.shutdownResolve = null;
    }

    // Remove signal handlers
    process.off('SIGINT', this.handleSignal);
    process.off('SIGTERM', this.handleSignal);
  }

  /**
   * Graceful shutdown handler
   */
  private async handleSignal(signal: NodeJS.Signals): Promise<void> {
    logger.info(`Received ${signal}, initiating graceful shutdown`);
    await this.shutdown();
  }

  /**
   * Perform graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.state.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.state.isShuttingDown = true;
    logger.info('Starting graceful shutdown', {
      timeoutMs: this.options.shutdownTimeoutMs,
    });

    const shutdownStart = Date.now();

    // Stop the interval loop
    this.stop();

    // Wait for any in-progress pipeline run to complete
    // (In a more complex implementation, we'd track active runs)
    await new Promise(resolve => setTimeout(resolve, 1000));

    const shutdownDuration = Date.now() - shutdownStart;
    logger.info('Graceful shutdown complete', { durationMs: shutdownDuration });

    this.state.isShuttingDown = false;
  }

  /**
   * Force immediate shutdown (not graceful)
   */
  forceShutdown(): void {
    logger.warn('Force shutdown initiated');
    this.stop();
    process.exit(1);
  }
}

/**
 * Create a new KaelRuntime instance
 */
export function createKaelRuntime(options?: KaelRuntimeOptions): KaelRuntime {
  return new KaelRuntime(options);
}

/**
 * Singleton instance for convenience
 */
let defaultRuntime: KaelRuntime | null = null;

export function getKaelRuntime(): KaelRuntime {
  if (!defaultRuntime) {
    defaultRuntime = createKaelRuntime();
  }
  return defaultRuntime;
}

/**
 * Helper to start Kael with CLI-friendly error handling
 */
export async function startKael(): Promise<void> {
  const runtime = getKaelRuntime();

  try {
    await runtime.runForever();
  } catch (error) {
    logger.error('Kael runtime crashed', { error });
    process.exit(1);
  }
}

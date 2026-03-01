/**
 * Kael Agent - Minimal Working Implementation
 * Fully independent agent using OpenClaw
 */

import { OpenClaw, loadLLMConfig } from './agent/openclaw.js';
import { toolsRegistry, getTool } from './agent/toolsRegistry.js';
import { SYSTEM_PROMPT } from './agent/kaelAgent.js';
import { logger } from './logger/index.js';
import { createNotifier } from '@kael/notifier';
import { config } from './config/index.js';

interface KaelAgentConfig {
  maxStepsPerCycle: number;
  cycleIntervalMs: number;
  enableNotifications: boolean;
}

interface AgentState {
  running: boolean;
  currentCycle: number;
  lastRunAt: Date | null;
  consecutiveErrors: number;
}

export class KaelAgent {
  private openclaw: OpenClaw;
  private config: KaelAgentConfig;
  private state: AgentState;
  private notifier = createNotifier();
  private intervalId: NodeJS.Timeout | null = null;

  constructor(agentConfig?: Partial<KaelAgentConfig>) {
    this.openclaw = new OpenClaw(loadLLMConfig());
    this.config = {
      maxStepsPerCycle: agentConfig?.maxStepsPerCycle ?? 5,
      cycleIntervalMs: agentConfig?.cycleIntervalMs ?? 60000,
      enableNotifications: agentConfig?.enableNotifications ?? true,
    };
    this.state = {
      running: false,
      currentCycle: 0,
      lastRunAt: null,
      consecutiveErrors: 0,
    };

    logger.info('Kael Agent initialized', {
      maxSteps: this.config.maxStepsPerCycle,
      interval: this.config.cycleIntervalMs,
    });
  }

  /**
   * Run a single agent cycle
   */
  async runOnce(): Promise<{ success: boolean; actions: string[]; error?: string }> {
    if (!this.state.running) {
      this.state.running = true;
    }

    this.state.currentCycle++;
    logger.info(`Starting agent cycle ${this.state.currentCycle}`);

    const actions: string[] = [];
    const cycleStartTime = Date.now();

    try {
      // Build context for LLM
      const messages = [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        {
          role: 'user' as const,
          content: `Cycle ${this.state.currentCycle}. Review system state and choose the next action from available tools: ${toolsRegistry.map(t => t.name).join(', ')}`,
        },
      ];

      // Planning loop
      for (let step = 0; step < this.config.maxStepsPerCycle; step++) {
        logger.debug(`Planning step ${step + 1}/${this.config.maxStepsPerCycle}`);

        // Convert tools to OpenAI format using actual Zod schemas
        const tools = toolsRegistry.map((tool) => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        }));

        const response = await this.openclaw.complete(messages, tools);

        if (!response.toolCalls || response.toolCalls.length === 0) {
          logger.info('No more actions needed, cycle complete');
          break;
        }

        // Execute the chosen tool
        const toolCall = response.toolCalls[0];
        const toolName = toolCall.function.name;
        const toolInput = JSON.parse(toolCall.function.arguments || '{}');

        const tool = getTool(toolName);
        if (!tool) {
          throw new Error(`Tool not found: ${toolName}`);
        }

        logger.info(`Executing tool: ${toolName}`, { input: toolInput });
        const result = await tool.execute(toolInput);

        actions.push(`${toolName}: ${result.success ? 'success' : 'failed'}`);

        // Add tool result to context (as assistant message since 'tool' role has constraints)
        messages.push({
          role: 'assistant' as const,
          content: `Tool ${toolName} result: ${JSON.stringify(result)}`,
        });

        // Early exit if first tool fails
        if (!result.success && step === 0) {
          throw new Error(`Critical tool failure: ${result.error}`);
        }
      }

      this.state.lastRunAt = new Date();
      this.state.consecutiveErrors = 0;

      const durationMs = Date.now() - cycleStartTime;
      logger.info(`Cycle ${this.state.currentCycle} complete`, {
        steps: actions.length,
        durationMs,
      });

      // Send notification if enabled
      if (this.config.enableNotifications) {
        await this.notifier.send(
          `Kael cycle ${this.state.currentCycle} complete: ${actions.length} actions in ${Math.round(durationMs / 1000)}s`
        );
      }

      return { success: true, actions };
    } catch (error) {
      this.state.consecutiveErrors++;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Cycle ${this.state.currentCycle} failed`, { error: errorMsg });

      if (this.config.enableNotifications) {
        await this.notifier.send(`⚠️ Kael error: ${errorMsg.slice(0, 100)}`);
      }

      return { success: false, actions, error: errorMsg };
    }
  }

  /**
   * Run continuously
   */
  async runContinuous(): Promise<void> {
    if (this.state.running) {
      logger.warn('Agent is already running');
      return;
    }

    this.state.running = true;
    logger.info('Starting continuous agent', { intervalMs: this.config.cycleIntervalMs });

    // Initial run
    await this.runOnce();

    // Set up interval
    this.intervalId = setInterval(async () => {
      if (!this.state.running) return;

      if (this.state.consecutiveErrors >= 5) {
        logger.error('Too many consecutive errors, stopping agent');
        this.stop();
        return;
      }

      await this.runOnce();
    }, this.config.cycleIntervalMs);

    // Keep alive
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.state.running) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }

  /**
   * Stop the agent
   */
  stop(): void {
    logger.info('Stopping Kael Agent');
    this.state.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Get current state
   */
  getState(): Readonly<AgentState> {
    return { ...this.state };
  }
}

/**
 * Create and run Kael Agent
 */
export async function runKaelAgent(config?: Partial<KaelAgentConfig>): Promise<void> {
  const agent = new KaelAgent(config);
  await agent.runContinuous();
}

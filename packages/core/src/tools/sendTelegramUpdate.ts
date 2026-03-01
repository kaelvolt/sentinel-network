/**
 * Tool: sendTelegramUpdate
 * Sends operational updates to the operator via Telegram
 */

import { z } from 'zod';
import { createNotifier } from '@kael/notifier';
import { logger } from '../logger/index.js';
import type { ToolExecutionStep } from './types.js';

// Input schema
export const sendTelegramUpdateInputSchema = z.object({
  text: z.string().min(1).max(4000).describe('The message text to send'),
  priority: z.enum(['normal', 'urgent']).optional().default('normal').describe('Message priority level'),
});

export type SendTelegramUpdateInput = z.infer<typeof sendTelegramUpdateInputSchema>;

export interface SendTelegramUpdateOutput {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a Telegram update to the operator
 */
export async function sendTelegramUpdate(
  input: SendTelegramUpdateInput
): Promise<SendTelegramUpdateOutput> {
  const startTime = Date.now();
  const notifier = createNotifier();

  // Prefix urgent messages
  const messageText = input.priority === 'urgent'
    ? `URGENT: ${input.text}`
    : input.text;

  try {
    await notifier.send(messageText);
    
    const durationMs = Date.now() - startTime;
    
    logger.info({ 
      tool: 'sendTelegramUpdate',
      priority: input.priority,
      durationMs 
    }, 'Telegram update sent successfully');

    return {
      success: true,
      messageId: `telegram-${Date.now()}`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ 
      tool: 'sendTelegramUpdate',
      error: errorMsg 
    }, 'Failed to send Telegram update');

    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Create a reasoning trail step for this tool execution
 */
export function createTelegramUpdateStep(
  input: SendTelegramUpdateInput,
  output: SendTelegramUpdateOutput,
  durationMs: number
): ToolExecutionStep {
  return {
    type: 'TOOL_CALL',
    toolName: 'sendTelegramUpdate',
    input: {
      text: input.text.slice(0, 100) + (input.text.length > 100 ? '...' : ''),
      priority: input.priority,
    },
    output: {
      success: output.success,
      messageId: output.messageId,
      error: output.error,
    },
    durationMs,
    success: output.success,
    timestamp: new Date(),
  };
}

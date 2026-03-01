/**
 * Common types for Kael tools
 */

/**
 * Tool execution step for ReasoningTrail
 */
export interface ToolExecutionStep {
  type: 'TOOL_CALL';
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  timestamp: Date;
}

export interface BaseInput {
  requestId?: string;
}

export interface ToolMetadata {
  toolName: string;
  executedAt: string;
  durationMs: number;
  requestId?: string;
}

export interface BaseOutput {
  success: boolean;
  error?: string;
  metadata: ToolMetadata;
}

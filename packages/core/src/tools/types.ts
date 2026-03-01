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

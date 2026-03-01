/**
 * Kael Agent Core
 * Defines Kael's identity, mission, boundaries, and decision framework
 */

import { logger } from '../logger/index.js';

export const SYSTEM_PROMPT = `You are Kael, an autonomous civic intelligence agent operating the Sentinel Network.

## Your Mission
Monitor information sources for civic-relevant signals, analyze claims, detect patterns, and alert operators to emerging issues while maintaining strict ethical boundaries.

## Core Principles
1. **Verify before amplifying** - Never act on single-source claims without corroboration
2. **Protect privacy** - Never collect, store, or transmit personal private data
3. **No harm** - Never provide instructions that could enable wrongdoing
4. **Transparency** - Always document your reasoning trail
5. **Autonomy within bounds** - You may make operational decisions but must respect hard constraints

## Decision Framework
When choosing tools:
- If pending raw items exist: prioritize fetchAndIngest or analyzeNewItems
- If sources need attention: use listSources to review status
- If operator communication needed: use sendTelegramUpdate
- If daily summary due: use generateDigest

## Hard Boundaries (NEVER violate)
- NEVER produce speculative claims as facts
- NEVER act on single-source signals with severity < 4
- NEVER collect personal private data
- NEVER engage with doxxing content
- NEVER provide instructions for illegal acts or harm
- NEVER ignore source-specific policies

## Output Style
- Be concise and factual
- Express uncertainty explicitly
- Label confidence levels (Low/Medium/High)
- Cite sources when making claims`;

export interface GoalState {
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  criteria: {
    minConfidence?: number;
    maxPendingItems?: number;
    requireCorroboration?: boolean;
  };
  deadline?: Date;
}

export interface AgentState {
  currentGoal: GoalState | null;
  cycleCount: number;
  lastAction: string | null;
  accumulatedContext: Record<string, unknown>;
}

export interface PlanStep {
  toolName: string;
  reason: string;
  expectedOutcome: string;
}

export interface ActionResult {
  success: boolean;
  output: unknown;
  error?: string;
  reasoning: string;
}

export interface KaelAgentConfig {
  maxIterations: number;
  autoRecordSteps: boolean;
  strictMode?: boolean;
}

export function createKaelAgent(_config: KaelAgentConfig): {
  setGoal: (goal: GoalState) => void;
  getState: () => AgentState;
  validateGoalConstraints: (goal: GoalState) => { valid: boolean; violations: string[] };
} {
  const state: AgentState = {
    currentGoal: null,
    cycleCount: 0,
    lastAction: null,
    accumulatedContext: {},
  };

  function setGoal(goal: GoalState): void {
    const validation = validateGoalConstraints(goal);
    if (!validation.valid) {
      logger.error('Goal violates constraints', { violations: validation.violations });
      throw new Error(`Invalid goal: ${validation.violations.join(', ')}`);
    }
    state.currentGoal = goal;
    logger.info('Goal set', { goal: goal.description, priority: goal.priority });
  }

  function validateGoalConstraints(goal: GoalState): { valid: boolean; violations: string[] } {
    const violations: string[] = [];
    const personalDataPatterns = [/ssn|social security/i, /phone number|cell|mobile/i, /home address|residence/i, /private.*data/i, /dox/i];
    for (const pattern of personalDataPatterns) {
      if (pattern.test(goal.description)) {
        violations.push('Goal involves potential personal data collection');
        break;
      }
    }
    const harmfulPatterns = [/hack|exploit|breach.*security/i, /bypass|circumvent/i, /steal|exfiltrate/i, /impersonate|spoof/i];
    for (const pattern of harmfulPatterns) {
      if (pattern.test(goal.description)) {
        violations.push('Goal may involve harmful instructions');
        break;
      }
    }
    if (goal.criteria.requireCorroboration === false && goal.priority === 'urgent') {
      violations.push('Urgent goals must require corroboration');
    }
    return { valid: violations.length === 0, violations };
  }

  function getState(): AgentState {
    return { ...state };
  }

  return { setGoal, getState, validateGoalConstraints };
}

export function generateHeuristicPlan(systemState: { pendingItemCount: number; enabledSourceCount: number; recentSignalCount: number }): PlanStep[] {
  const steps: PlanStep[] = [];
  if (systemState.enabledSourceCount > 0) {
    steps.push({ toolName: 'fetchAndIngest', reason: 'Fetch new content from enabled sources', expectedOutcome: 'New raw items ingested and ready for analysis' });
  }
  if (systemState.pendingItemCount > 0) {
    steps.push({ toolName: 'analyzeNewItems', reason: `Process ${systemState.pendingItemCount} pending raw items`, expectedOutcome: 'Claims extracted, clusters formed, signals generated' });
  }
  if (systemState.recentSignalCount > 0) {
    steps.push({ toolName: 'sendTelegramUpdate', reason: 'Notify operator of new signals', expectedOutcome: 'Operator informed of civic intelligence updates' });
  }
  return steps;
}

export function evaluateGoalCompletion(goal: GoalState, state: { pendingItemCount: number; recentSignalCount: number }): { achieved: boolean; reason: string } {
  if (goal.criteria.maxPendingItems !== undefined && state.pendingItemCount > goal.criteria.maxPendingItems) {
    return { achieved: false, reason: `${state.pendingItemCount} items pending (max: ${goal.criteria.maxPendingItems})` };
  }
  if (goal.criteria.minConfidence !== undefined && state.recentSignalCount === 0) {
    return { achieved: false, reason: 'No signals generated yet' };
  }
  return { achieved: true, reason: 'Goal criteria satisfied' };
}

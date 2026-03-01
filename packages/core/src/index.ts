/**
 * Kael Core Package
 * Runtime, configuration, logging, and orchestration
 */

export * from './config/index.js';
export * from './logger/index.js';
export * from './errors/index.js';
export * from './policy.js';
export * from './orchestrator.js';
export * from './kael.js';
export * from './digest.js';

// NEW: Working Kael Agent (OpenClaw-based)
export { KaelAgent, runKaelAgent } from './kael-agent.js';

// Tools system
export * from './tools/index.js';
export * from './agent/toolsRegistry.js';
export * from './agent/kaelAgent.js';
export * from './agent/openclaw.js';
// Note: runtime.js has conflicts; use kael-agent.ts instead

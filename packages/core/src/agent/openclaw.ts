/**
 * OpenClaw-style Agent Runtime
 * Configurable LLM provider interface for Kael Agent
 */

import { z } from 'zod';
import { logger } from '../logger/index.js';

/**
 * LLM Provider Configuration
 */
export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'kimi' | 'custom';
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Message format for LLM conversations
 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * LLM Response
 */
export interface LLMResponse {
  content: string | null;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Tool definition for LLM
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: z.ZodTypeAny;
  };
}

/**
 * Load LLM configuration from environment
 */
export function loadLLMConfig(): LLMConfig {
  const provider = (process.env.MODEL_PROVIDER || 'openai') as LLMConfig['provider'];
  const model = process.env.MODEL_NAME || 'gpt-4';
  const apiKey = process.env.API_KEY || '';
  const baseUrl = process.env.MODEL_BASE_URL;
  const temperature = parseFloat(process.env.MODEL_TEMPERATURE || '0.7');
  const maxTokens = parseInt(process.env.MODEL_MAX_TOKENS || '2000', 10);

  if (!apiKey) {
    logger.warn('No API_KEY provided, LLM calls will fail');
  }

  return {
    provider,
    model,
    apiKey,
    baseUrl,
    temperature,
    maxTokens,
  };
}

/**
 * OpenClaw-style LLM Client
 * Supports multiple providers through unified interface
 */
export class OpenClaw {
  private config: LLMConfig;

  constructor(config?: Partial<LLMConfig>) {
    this.config = { ...loadLLMConfig(), ...config };
  }

  /**
   * Complete a chat with the LLM
   */
  async complete(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    logger.debug('LLM complete', {
      provider: this.config.provider,
      model: this.config.model,
      messageCount: messages.length,
      toolCount: tools?.length,
    });

    try {
      switch (this.config.provider) {
        case 'openai':
          return await this.callOpenAI(messages, tools);
        case 'anthropic':
          return await this.callAnthropic(messages, tools);
        case 'kimi':
          return await this.callKimi(messages, tools);
        case 'custom':
          return await this.callCustom(messages, tools);
        default:
          throw new Error(`Unsupported provider: ${this.config.provider}`);
      }
    } catch (error) {
      logger.error('LLM call failed', { error });
      throw error;
    }
  }

  private async callOpenAI(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const { OpenAI } = await import('openai');
    const client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
    });

    const response = await client.chat.completions.create({
      model: this.config.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        tool_calls: m.tool_calls,
        tool_call_id: m.tool_call_id,
      })),
      tools: tools?.map(t => ({
        type: 'function',
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: zodToJsonSchema(t.function.parameters),
        },
      })),
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    });

    const choice = response.choices[0];

    return {
      content: choice.message.content,
      toolCalls: choice.message.tool_calls?.map(tc => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }

  private async callAnthropic(_messages: Message[], _tools?: ToolDefinition[]): Promise<LLMResponse> {
    logger.warn('Anthropic provider not yet implemented');
    return {
      content: 'Anthropic provider not yet implemented. Please use OpenAI or configure a custom provider.',
    };
  }

  private async callKimi(_messages: Message[], _tools?: ToolDefinition[]): Promise<LLMResponse> {
    logger.warn('Kimi provider not yet implemented');
    return {
      content: 'Kimi provider not yet implemented. Please use OpenAI or configure a custom provider.',
    };
  }

  private async callCustom(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    if (!this.config.baseUrl) {
      throw new Error('Custom provider requires MODEL_BASE_URL');
    }

    const response = await fetch(this.config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        tools,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`Custom provider error: ${response.status}`);
    }

    const data = await response.json();

    return {
      content: data.choices?.[0]?.message?.content || null,
      toolCalls: data.choices?.[0]?.message?.tool_calls,
      usage: data.usage,
    };
  }

  getConfig(): Readonly<LLMConfig> {
    return { ...this.config };
  }
}

/**
 * Convert Zod schema to JSON Schema
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodTypeToJsonType(value);
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  return { type: 'object', properties: {} };
}

function zodTypeToJsonType(zodType: z.ZodTypeAny): Record<string, unknown> {
  if (zodType instanceof z.ZodString) return { type: 'string' };
  if (zodType instanceof z.ZodNumber) return { type: 'number' };
  if (zodType instanceof z.ZodBoolean) return { type: 'boolean' };
  if (zodType instanceof z.ZodArray) {
    return { type: 'array', items: zodTypeToJsonType(zodType.element) };
  }
  if (zodType instanceof z.ZodOptional) return zodTypeToJsonType(zodType.unwrap());
  if (zodType instanceof z.ZodEnum) return { type: 'string', enum: zodType.options };
  return { type: 'string' };
}

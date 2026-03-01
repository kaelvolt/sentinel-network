import { z } from 'zod';

const configSchema = z.object({
  telegram: z.object({
    token: z.string().optional(),
    chatId: z.string().optional(),
  }),
});

export type NotifierConfig = z.infer<typeof configSchema>;

/**
 * Load notifier configuration from environment variables.
 * Uses zod for validation and type safety.
 */
export function getConfig(): NotifierConfig {
  const config = {
    telegram: {
      token: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
    },
  };

  return configSchema.parse(config);
}

/**
 * Check if Telegram configuration is complete
 */
export function hasTelegramConfig(config: NotifierConfig): boolean {
  return !!config.telegram.token && !!config.telegram.chatId;
}

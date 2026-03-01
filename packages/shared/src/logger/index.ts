import { config } from '../config/index.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    if (levels.indexOf(level) < levels.indexOf(this.level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(context && Object.keys(context).length > 0 && { context }),
    };

    if (config.isDev) {
      const color = this.getColor(level);
      // eslint-disable-next-line no-console
      console.log(
        `${color}[${timestamp}] ${level.toUpperCase()}:${' '.repeat(5 - level.length)}${message}`,
        context ? JSON.stringify(context, null, 2) : ''
      );
    } else {
      // In production, output JSON for structured logging
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(logEntry));
    }
  }

  private getColor(level: LogLevel): string {
    switch (level) {
      case 'debug':
        return '\x1b[36m'; // Cyan
      case 'info':
        return '\x1b[32m'; // Green
      case 'warn':
        return '\x1b[33m'; // Yellow
      case 'error':
        return '\x1b[31m'; // Red
      default:
        return '';
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  child(context: LogContext): Logger {
    const childLogger = new Logger(this.level);
    const originalLog = this.log.bind(this);
    childLogger.log = (level: LogLevel, message: string, childContext?: LogContext) => {
      originalLog(level, message, { ...context, ...childContext });
    };
    return childLogger;
  }
}

export const logger = new Logger(config.isDev ? 'debug' : 'info');

export function createLogger(name: string): Logger {
  return logger.child({ logger: name });
}

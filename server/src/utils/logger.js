import { env } from '../config/env.js';

/**
 * Structured logger for production observability without paid external vendors.
 * Outputs JSON in production, clean readable text in development.
 */
class Logger {
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    if (env.isProduction) {
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...meta,
      });
    }
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }

  info(message, meta) {
    console.log(this.formatMessage('info', message, meta));
  }

  warn(message, meta) {
    console.warn(this.formatMessage('warn', message, meta));
  }

  error(message, meta) {
    console.error(this.formatMessage('error', message, meta));
  }

  debug(message, meta) {
    if (!env.isProduction) {
      console.debug(this.formatMessage('debug', message, meta));
    }
  }
}

export const logger = new Logger();

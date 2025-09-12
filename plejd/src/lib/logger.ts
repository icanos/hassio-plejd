import winston from 'winston';
import type { AddonConfiguration } from '@/types';

class Logger {
  private static instance: Logger;
  private readonly loggers = new Map<string, winston.Logger>();
  private logLevel: AddonConfiguration['logLevel'] = 'info';

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLogLevel(level: AddonConfiguration['logLevel']): void {
    this.logLevel = level;
    // Update existing loggers
    for (const logger of this.loggers.values()) {
      logger.level = level;
    }
  }

  public getLogger(name: string): winston.Logger {
    if (!this.loggers.has(name)) {
      const logger = winston.createLogger({
        level: this.logLevel,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${level.toUpperCase()}] [${name}] ${message}${metaStr}`;
          })
        ),
        transports: [
          new winston.transports.Console({
            handleExceptions: true,
            handleRejections: true
          })
        ]
      });

      this.loggers.set(name, logger);
    }

    return this.loggers.get(name)!;
  }

  public shouldLog(level: AddonConfiguration['logLevel']): boolean {
    const levels = ['error', 'warn', 'info', 'debug', 'verbose', 'silly'];
    const currentIndex = levels.indexOf(this.logLevel);
    const targetIndex = levels.indexOf(level);
    return targetIndex <= currentIndex;
  }
}

export const logger = Logger.getInstance();
export const getLogger = (name: string): winston.Logger => logger.getLogger(name);
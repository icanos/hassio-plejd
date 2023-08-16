const winston = require('winston');

const { colorize, combine, label, printf, timestamp } = winston.format;

const Configuration = require('./Configuration');

const LEVELS = ['error', 'warn', 'info', 'debug', 'verbose', 'silly'];
const LEVELS_LOOKUP = {
  error: 'ERR',
  warn: 'WRN',
  info: 'INF',
  debug: 'DBG',
  verbose: 'VRB',
  silly: 'SLY',
};

const logFormat = printf((info) => {
  if (info.stack) {
    return `${info.timestamp} ${info.level} [${info.label}] ${info.message}\n${info.stack}`;
  }
  return `${info.timestamp} ${info.level} [${info.label}] ${info.message}`;
});

/** Winston-based logger */
class Logger {
  static shouldLogLookup = {};

  constructor() {
    throw new Error('Please call createLogger instead');
  }

  static getLogLevel() {
    const config = Configuration.getOptions();
    // eslint-disable-next-line max-len
    const level =
      (config.logLevel && LEVELS.find((l) => l.startsWith(config.logLevel[0].toLowerCase()))) ||
      'info';
    return level;
  }

  static shouldLog(logLevel) {
    if (!Logger.shouldLogLookup[logLevel]) {
      // eslint-disable-next-line max-len
      Logger.shouldLogLookup[logLevel] =
        Logger.logLevels().levels[logLevel] <= Logger.logLevels().levels[Logger.getLogLevel()];
    }
    return Logger.shouldLogLookup[logLevel];
  }

  /** Created logger will follow Winston createLogger, but
   *  - add module name to logger
   *  - swap debug/verbose levels and omit http to mimic HA standard
   * Levels (in order): error, warn, info, debug, verbose, silly
   * */
  static getLogger(moduleName) {
    const level = Logger.getLogLevel();

    const logger = winston.createLogger({
      format: combine(
        winston.format((info) => {
          info.level = LEVELS_LOOKUP[info.level] || '???';
          return info;
        })(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        label({ label: moduleName }),
        colorize(),
        logFormat,
      ),
      level,
      levels: Logger.logLevels().levels,
      transports: [new winston.transports.Console()],
    });
    winston.addColors(Logger.logLevels().colors);

    if (moduleName === 'plejd-main') {
      logger.log(level, `Log level set to ${level}`);
    }

    return logger;
  }

  static logLevels() {
    // Default (npm) levels
    // levels = {
    //     error: 0,
    //     warn: 1,
    //     info: 2,
    //     http: 3,
    //     verbose: 4,
    //     debug: 5,
    //     silly: 6
    // }
    // colors = {
    //     error: 'red',
    //     warn: 'yellow',
    //     info: 'green',
    //     http: 'green',
    //     verbose: 'cyan',
    //     debug: 'blue',
    //     silly: 'magenta'
    //   };

    // Mimic HA standard below
    // Debug/verbose swapped compared to npm levels, http omitted
    return {
      levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3,
        verbose: 4,
        silly: 6,
      },
      colors: {
        error: 'red',
        warn: 'yellow',
        info: 'green',
        debug: 'cyan',
        verbose: 'blue',
        silly: 'magenta',
      },
    };
  }
}

module.exports = Logger;

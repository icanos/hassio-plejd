const winston = require("winston");
const { colorize, combine, label, printf, timestamp } = winston.format;

const Configuration = require("./Configuration");

const LEVELS = ["error", "warn", "info", "debug", "verbose", "silly"];

const logFormat = printf(info => {
    if(info.stack) {
        return `${info.timestamp} ${info.level} [${info.label}] ${info.message}\n${info.stack}`;
    }
    return `${info.timestamp} ${info.level} [${info.label}] ${info.message}`;
});

/** Winston-based logger */
class Logger {
    constructor () {
        throw new Error("Please call createLogger instead");
    }

    /** Created logger will follow Winston createLogger, but
     *  - add module name to logger
     *  - swap debug/verbose levels and omit http to mimic HA standard 
     * Levels (in order): error, warn, info, debug, verbose, silly
     * */
    static getLogger(moduleName) {
        const config = Configuration.getConfiguration();
        const level = (config.logLevel && LEVELS.find(l => l.startsWith(config.logLevel[0].toLowerCase()))) || "info";

        const logger = winston.createLogger({
            format: combine(
                winston.format(info => {
                    switch (info.level) {
                        case "warning":
                            info.level = "WRN";
                            break;
                        case "verbose":
                            info.level = "VRB";
                            break;
                        case "debug":
                            info.level = "DBG";
                            break;
                        default:
                            info.level = info.level.substring(0,3).toUpperCase()
                    }
                        
                    return info;
                })(),
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                label({ label: moduleName}),
                colorize(),
                logFormat,
            ),
            level: level,
            levels: Logger.logLevels().levels,
            transports: [
                new winston.transports.Console(),
            ]
        });
        winston.addColors(Logger.logLevels().colors);

        
        if (moduleName === "plejd-main") {
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
            silly: 6 
          },
          colors: {
            error: 'red',
            warn: 'yellow',
            info: 'green',
            debug: 'cyan',
            verbose: 'blue',
            silly: 'magenta'
          }
        };
    }
}

module.exports = Logger;

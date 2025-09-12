import { getAddonInfo, getOptions } from '@/lib/configuration';
import { getLogger, logger } from '@/lib/logger';
import { PlejdAddon } from '@/lib/plejd-addon';

const mainLogger = getLogger('plejd-main');

async function main(): Promise<void> {
  try {
    console.log('Starting Plejd addon and reading configuration...');

    const addonInfo = getAddonInfo();
    const config = getOptions();
    
    // Set log level from configuration
    logger.setLogLevel(config.logLevel);

    mainLogger.info(`Plejd add-on, version ${addonInfo.version}`);
    mainLogger.debug(`Addon info: ${JSON.stringify(addonInfo)}`);

    const addon = new PlejdAddon();
    await addon.init();

    mainLogger.info('Main initialization completed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Catastrophic error. Resetting entire addon in 1 minute', errorMessage);
    
    setTimeout(() => {
      void main();
    }, 60000);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  mainLogger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  mainLogger.error('Uncaught Exception:', error);
  process.exit(1);
});

void main();
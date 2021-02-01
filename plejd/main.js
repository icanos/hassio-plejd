const Logger = require('./Logger');
const PlejdAddon = require('./PlejdAddon');

const logger = Logger.getLogger('plejd-main');

const version = '0.5.1';

async function main() {
  try {
    logger.info(`Starting Plejd add-on v. ${version}`);

    const addon = new PlejdAddon();

    await addon.init();

    logger.info('main() finished');
  } catch (err) {
    logger.error('Catastrophic error. Resetting entire addon in 1 minute', err);
    setTimeout(() => main(), 60000);
  }
}

main();

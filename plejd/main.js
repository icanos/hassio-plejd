const Configuration = require('./Configuration');
const Logger = require('./Logger');
const PlejdAddon = require('./PlejdAddon');

async function main() {
  try {
    // eslint-disable-next-line no-console
    console.log('Starting Plejd addon and reading configuration...');

    const addonInfo = Configuration.getAddonInfo();
    const logger = Logger.getLogger('plejd-main');

    logger.info(`Plejd add-on, version ${addonInfo.version}`);
    logger.verbose(`Addon info: ${JSON.stringify(addonInfo)}`);

    const addon = new PlejdAddon();

    await addon.init();

    logger.info('main() finished');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log('Catastrophic error. Resetting entire addon in 1 minute', err);
    setTimeout(() => main(), 60000);
  }
}

main();

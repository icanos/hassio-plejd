const PlejdApi = require('./PlejdApi');
const MqttClient = require('./MqttClient');

const Logger = require('./Logger');
const PlejdService = require('./PlejdService');
const SceneManager = require('./SceneManager');
const Configuration = require('./Configuration');

const logger = Logger.getLogger('plejd-main');

const version = '0.4.8';

async function main() {
  logger.info(`Starting Plejd add-on v. ${version}`);

  const config = Configuration.getConfiguration();

  if (!config.connectionTimeout) {
    config.connectionTimeout = 2;
  }

  const plejdApi = new PlejdApi(
    config.site,
    config.username,
    config.password,
    config.includeRoomsAsLights,
  );
  const client = new MqttClient(config.mqttBroker, config.mqttUsername, config.mqttPassword);

  plejdApi.login().then(() => {
    // load all sites and find the one that we want (from config)
    plejdApi.getSites().then((site) => {
      // load the site and retrieve the crypto key
      plejdApi.getSite(site.site.siteId).then((cryptoKey) => {
        // parse all devices from the API
        const devices = plejdApi.getDevices();

        client.on('connected', () => {
          logger.verbose('connected to mqtt.');
          client.discover(devices);
        });

        client.init();

        // init the BLE interface
        const sceneManager = new SceneManager(plejdApi.site, devices);
        const plejd = new PlejdService(
          cryptoKey,
          devices,
          sceneManager,
          config.connectionTimeout,
          config.writeQueueWaitTime,
        );
        plejd.on('connectFailed', () => {
          logger.verbose('Were unable to connect, will retry connection in 10 seconds.');
          setTimeout(() => {
            plejd.init();
          }, 10000);
        });

        plejd.init();

        plejd.on('authenticated', () => {
          logger.verbose('plejd: connected via bluetooth.');
        });

        // subscribe to changes from Plejd
        plejd.on('stateChanged', (deviceId, command) => {
          client.updateState(deviceId, command);
        });

        plejd.on('sceneTriggered', (deviceId, scene) => {
          client.sceneTriggered(scene);
        });

        // subscribe to changes from HA
        client.on('stateChanged', (device, command) => {
          const deviceId = device.id;

          if (device.typeName === 'Scene') {
            // we're triggering a scene, lets do that and jump out.
            // since scenes aren't "real" devices.
            plejd.triggerScene(device.id);
            return;
          }

          let state = 'OFF';
          let commandObj = {};

          if (typeof command === 'string') {
            // switch command
            state = command;
            commandObj = {
              state,
            };

            // since the switch doesn't get any updates on whether it's on or not,
            // we fake this by directly send the updateState back to HA in order for
            // it to change state.
            client.updateState(deviceId, {
              state: state === 'ON' ? 1 : 0,
            });
          } else {
            // eslint-disable-next-line prefer-destructuring
            state = command.state;
            commandObj = command;
          }

          if (state === 'ON') {
            plejd.turnOn(deviceId, commandObj);
          } else {
            plejd.turnOff(deviceId, commandObj);
          }
        });
      });
    });
  });
}

main();

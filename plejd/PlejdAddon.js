const EventEmitter = require('events');

const Configuration = require('./Configuration');
const Logger = require('./Logger');
const PlejdApi = require('./PlejdApi');
const PlejdDeviceCommunication = require('./PlejdDeviceCommunication');
const MqttClient = require('./MqttClient');
const SceneManager = require('./SceneManager');
const DeviceRegistry = require('./DeviceRegistry');

const logger = Logger.getLogger('plejd-main');

class PlejdAddon extends EventEmitter {
  bleInitTimeout;
  config;
  deviceRegistry;
  plejdApi;
  plejdDeviceCommunication;
  mqttClient;
  processCleanupFunc;
  sceneManager;

  constructor() {
    super();

    this.config = Configuration.getOptions();
    this.deviceRegistry = new DeviceRegistry();

    this.plejdApi = new PlejdApi(this.deviceRegistry);
    this.plejdDeviceCommunication = new PlejdDeviceCommunication(this.deviceRegistry);
    this.sceneManager = new SceneManager(this.deviceRegistry, this.plejdDeviceCommunication);
    this.mqttClient = new MqttClient(this.deviceRegistry);
  }

  cleanup() {
    this.mqttClient.cleanup();
    this.mqttClient.removeAllListeners();
    this.plejdDeviceCommunication.cleanup();
    this.plejdDeviceCommunication.removeAllListeners();
  }

  async init() {
    logger.info('Main Plejd addon init()...');

    await this.plejdApi.init();
    this.sceneManager.init();

    this.processCleanupFunc = () => {
      this.cleanup();
      this.processCleanupFunc = () => {};
      this.mqttClient.disconnect(() => process.exit(0));
    };

    ['SIGINT', 'SIGHUP', 'SIGTERM'].forEach((signal) => {
      process.on(signal, this.processCleanupFunc);
    });

    this.mqttClient.on(MqttClient.EVENTS.connected, () => {
      try {
        logger.verbose('connected to mqtt.');
        this.mqttClient.sendDiscoveryToHomeAssistant();
      } catch (err) {
        logger.error('Error in MqttClient.connected callback in main.js', err);
      }
    });

    // subscribe to changes from HA
    this.mqttClient.on(MqttClient.EVENTS.stateChanged, (device, command) => {
      try {
        const deviceId = device.id;

        if (device.typeName === 'Scene') {
          // we're triggering a scene, lets do that and jump out.
          // since scenes aren't "real" devices.
          this.sceneManager.executeScene(device.id);
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
          this.mqttClient.updateState(deviceId, {
            state: state === 'ON' ? 1 : 0,
          });
        } else {
          // eslint-disable-next-line prefer-destructuring
          state = command.state;
          commandObj = command;
        }

        if (state === 'ON') {
          this.plejdDeviceCommunication.turnOn(deviceId, commandObj);
        } else {
          this.plejdDeviceCommunication.turnOff(deviceId, commandObj);
        }
      } catch (err) {
        logger.error('Error in MqttClient.stateChanged callback in main.js', err);
      }
    });

    this.mqttClient.init();

    // subscribe to changes from Plejd
    this.plejdDeviceCommunication.on(
      PlejdDeviceCommunication.EVENTS.stateChanged,
      (deviceId, command) => {
        try {
          this.mqttClient.updateState(deviceId, command);
        } catch (err) {
          logger.error('Error in PlejdService.stateChanged callback in main.js', err);
        }
      },
    );

    this.plejdDeviceCommunication.on(
      PlejdDeviceCommunication.EVENTS.sceneTriggered,
      (deviceId, sceneId) => {
        try {
          this.mqttClient.sceneTriggered(sceneId);
        } catch (err) {
          logger.error('Error in PlejdService.sceneTriggered callback in main.js', err);
        }
      },
    );

    await this.plejdDeviceCommunication.init();
    logger.info('Main init done');
  }
}

module.exports = PlejdAddon;

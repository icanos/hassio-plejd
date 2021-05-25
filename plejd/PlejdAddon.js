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
    this.mqttClient.on(
      MqttClient.EVENTS.stateChanged,
      /** @param device {import('./types/DeviceRegistry').OutputDevice} */
      (device, command) => {
        try {
          const { uniqueId } = device;

          if (device.typeName === 'Scene') {
            // we're triggering a scene, lets do that and jump out.
            // since scenes aren't "real" devices.
            this.sceneManager.executeScene(uniqueId);

            // since the scene doesn't get any updates on whether it's executed or not,
            // we fake this by directly send the sceneTriggered back to HA in order for
            // it continue to acto on the scene (for non-plejd devices).
            try {
              this.mqttClient.sceneTriggered(uniqueId);
            } catch (err) {
              logger.error('Error in PlejdService.sceneTriggered callback', err);
            }
            return;
          }

          let state = false;
          let commandObj = {};

          if (typeof command === 'string') {
            // switch command
            state = command === 'ON';
            commandObj = {
              state,
            };

            // since the switch doesn't get any updates on whether it's on or not,
            // we fake this by directly send the updateState back to HA in order for
            // it to change state.
            this.mqttClient.updateOutputState(uniqueId, {
              state,
            });
          } else {
            // eslint-disable-next-line prefer-destructuring
            state = command.state === 'ON';
            commandObj = command;
          }

          if (state) {
            this.plejdDeviceCommunication.turnOn(uniqueId, commandObj);
          } else {
            this.plejdDeviceCommunication.turnOff(uniqueId, commandObj);
          }
        } catch (err) {
          logger.error('Error in MqttClient.stateChanged callback', err);
        }
      },
    );

    this.mqttClient.init();

    // subscribe to changes from Plejd
    this.plejdDeviceCommunication.on(
      PlejdDeviceCommunication.EVENTS.stateChanged,
      (uniqueOutputId, command) => {
        try {
          this.mqttClient.updateOutputState(uniqueOutputId, command);
        } catch (err) {
          logger.error('Error in PlejdService.stateChanged callback', err);
        }
      },
    );

    this.plejdDeviceCommunication.on(
      PlejdDeviceCommunication.EVENTS.buttonPressed,
      (deviceId, deviceInput) => {
        try {
          this.mqttClient.buttonPressed(deviceId, deviceInput);
        } catch (err) {
          logger.error('Error in PlejdService.buttonPressed callback', err);
        }
      },
    );

    this.plejdDeviceCommunication.on(PlejdDeviceCommunication.EVENTS.sceneTriggered, (sceneId) => {
      try {
        this.mqttClient.sceneTriggered(sceneId);
      } catch (err) {
        logger.error('Error in PlejdService.sceneTriggered callback', err);
      }
    });

    await this.plejdDeviceCommunication.init();
    logger.info('Main init done');
  }
}

module.exports = PlejdAddon;

const EventEmitter = require('events');
const mqtt = require('mqtt');

const Configuration = require('./Configuration');
const Logger = require('./Logger');

const startTopics = ['hass/status', 'homeassistant/status'];

const logger = Logger.getLogger('plejd-mqtt');

// #region discovery

const discoveryPrefix = 'homeassistant';
const nodeId = 'plejd';

const getMqttUniqueId = (/** @type {string} */ uniqueId) => `${nodeId}.${uniqueId}`;

const getSubscribePath = () => `${discoveryPrefix}/+/${nodeId}/#`;
const getBaseTopic = (/** @type {{ uniqueId: string; type: string; }} */ plug) => `${discoveryPrefix}/${plug.type}/${nodeId}/${getMqttUniqueId(plug.uniqueId)}`;

const getTopicName = (
  /** @type {{ uniqueId: string; type: string; }} */ plug,
  /** @type {'config' | 'state' | 'availability' | 'set'} */ topicType,
) => `${getBaseTopic(plug)}/${topicType}`;

const TOPICS = {
  CONFIG: 'config',
  STATE: 'state',
  AVAILABILITY: 'availability',
  COMMAND: 'set',
};
const getSceneEventTopic = () => 'plejd/event/scene';

const decodeTopicRegexp = new RegExp(
  /(?<prefix>[^[]+)\/(?<type>.+)\/plejd\/(?<id>.+)\/(?<command>config|state|availability|set|scene)/,
);

const decodeTopic = (topic) => {
  const matches = decodeTopicRegexp.exec(topic);
  if (!matches) {
    return null;
  }
  return matches.groups;
};

const getLightDiscoveryPayload = (
  /** @type {import('./types/DeviceRegistry').OutputDevice} */ device,
) => ({
  schema: 'json',
  name: device.name,
  unique_id: getMqttUniqueId(device.uniqueId),
  '~': getBaseTopic(device),
  state_topic: `~/${TOPICS.STATE}`,
  command_topic: `~/${TOPICS.COMMAND}`,
  availability_topic: `~/${TOPICS.AVAILABILITY}`,
  optimistic: false,
  qos: 1,
  retain: true,
  brightness: device.dimmable,
  device: {
    identifiers: `${device.deviceId}`,
    manufacturer: 'Plejd',
    model: device.typeName,
    name: device.name,
    sw_version: device.version,
  },
});

const getScenehDiscoveryPayload = (
  /** @type {import('./types/DeviceRegistry').OutputDevice} */ sceneDevice,
) => ({
  name: sceneDevice.name,
  '~': getBaseTopic(sceneDevice),
  state_topic: `~/${TOPICS.STATE}`,
  command_topic: `~/${TOPICS.COMMAND}`,
  optimistic: false,
  qos: 1,
  retain: true,
  device: {
    identifiers: `${sceneDevice.uniqueId}`,
    manufacturer: 'Plejd',
    model: sceneDevice.typeName,
    name: sceneDevice.name,
    sw_version: sceneDevice.version,
  },
});

// #endregion

const getMqttStateString = (/** @type {boolean} */ state) => (state ? 'ON' : 'OFF');
const AVAILABLILITY = { ONLINE: 'online', OFFLINE: 'offline' };

class MqttClient extends EventEmitter {
  /** @type {import('DeviceRegistry')} */
  deviceRegistry;

  static EVENTS = {
    connected: 'connected',
    stateChanged: 'stateChanged',
  };

  constructor(deviceRegistry) {
    super();

    this.config = Configuration.getOptions();
    this.deviceRegistry = deviceRegistry;
  }

  init() {
    logger.info('Initializing MQTT connection for Plejd addon');

    this.client = mqtt.connect(this.config.mqttBroker, {
      username: this.config.mqttUsername,
      password: this.config.mqttPassword,
    });

    this.client.on('error', (err) => {
      logger.warn('Error emitted from mqtt client', err);
    });

    this.client.on('connect', () => {
      logger.info('Connected to MQTT.');

      this.client.subscribe(startTopics, (err) => {
        if (err) {
          logger.error('Unable to subscribe to status topics', err);
        }

        this.emit(MqttClient.EVENTS.connected);
      });

      this.client.subscribe(getSubscribePath(), (err) => {
        if (err) {
          logger.error('Unable to subscribe to control topics');
        }
      });
    });

    this.client.on('close', () => {
      logger.verbose('Warning: mqtt channel closed event, reconnecting...');
      this.reconnect();
    });

    this.client.on('message', (topic, message) => {
      try {
        if (startTopics.includes(topic)) {
          logger.info('Home Assistant has started. lets do discovery.');
          this.emit(MqttClient.EVENTS.connected);
        } else {
          const decodedTopic = decodeTopic(topic);
          if (decodedTopic) {
            let device = this.deviceRegistry.getOutputDevice(decodedTopic.id);

            const messageString = message.toString();
            const isJsonMessage = messageString.startsWith('{');
            const command = isJsonMessage ? JSON.parse(messageString) : messageString;

            if (
              !isJsonMessage
              && messageString === 'ON'
              && this.deviceRegistry.getScene(decodedTopic.id)
            ) {
              // Guess that id that got state command without dim value belongs to Scene, not Device
              // This guess could very well be wrong depending on the installation...
              logger.warn(
                `Device id ${decodedTopic.id} belongs to both scene and device, guessing Scene is what should be set to ON. `
                  + 'OFF commands still sent to device.',
              );
              device = this.deviceRegistry.getScene(decodedTopic.id);
            }

            const deviceName = device ? device.name : '';

            switch (decodedTopic.command) {
              case 'set':
                logger.verbose(
                  `Got mqtt SET command for ${decodedTopic.type}, ${deviceName} (${decodedTopic.id}): ${messageString}`,
                );

                if (device) {
                  this.emit(MqttClient.EVENTS.stateChanged, device, command);
                } else {
                  logger.warn(
                    `Device for topic ${topic} not found! Can happen if HA calls previously existing devices.`,
                  );
                }
                break;
              case 'state':
              case 'config':
              case 'availability':
                logger.verbose(
                  `Sent mqtt ${decodedTopic.command} command for ${
                    decodedTopic.type
                  }, ${deviceName} (${decodedTopic.id}). ${
                    decodedTopic.command === 'availability' ? messageString : ''
                  }`,
                );
                break;
              default:
                logger.verbose(`Warning: Unknown command ${decodedTopic.command} in decoded topic`);
            }
          } else {
            logger.verbose(
              `Warning: Got unrecognized mqtt command on '${topic}': ${message.toString()}`,
            );
          }
        }
      } catch (err) {
        logger.error(`Error processing mqtt message on topic ${topic}`, err);
      }
    });
  }

  reconnect() {
    this.client.reconnect();
  }

  cleanup() {
    this.client.removeAllListeners();
  }

  disconnect(callback) {
    this.deviceRegistry.getAllOutputDevices().forEach((outputDevice) => {
      this.client.publish(getTopicName(outputDevice, 'availability'), AVAILABLILITY.OFFLINE);
    });
    this.client.end(callback);
  }

  sendDiscoveryToHomeAssistant() {
    const allOutputDevices = this.deviceRegistry.getAllOutputDevices();
    logger.info(`Sending discovery for ${allOutputDevices.length} Plejd output devices`);
    allOutputDevices.forEach((outputDevice) => {
      logger.debug(`Sending discovery for ${outputDevice.name}`);

      const configPayload = getLightDiscoveryPayload(outputDevice);
      logger.info(
        `Discovered ${outputDevice.typeName} (${outputDevice.type}) named ${outputDevice.name} (${outputDevice.bleOutputAddress} : ${outputDevice.uniqueId}).`,
      );

      this.client.publish(getTopicName(outputDevice, 'config'), JSON.stringify(configPayload));
      setTimeout(() => {
        this.client.publish(getTopicName(outputDevice, 'availability'), AVAILABLILITY.ONLINE);
      }, 2000);
    });

    const allSceneDevices = this.deviceRegistry.getAllSceneDevices();
    logger.info(`Sending discovery for ${allSceneDevices.length} Plejd scene devices`);
    allSceneDevices.forEach((sceneDevice) => {
      logger.debug(`Sending discovery for ${sceneDevice.name}`);

      const configPayload = getScenehDiscoveryPayload(sceneDevice);
      logger.info(
        `Discovered ${sceneDevice.typeName} (${sceneDevice.type}) named ${sceneDevice.name} (${sceneDevice.bleOutputAddress} : ${sceneDevice.uniqueId}).`,
      );

      this.client.publish(getTopicName(sceneDevice, 'config'), JSON.stringify(configPayload));
      setTimeout(() => {
        this.client.publish(getTopicName(sceneDevice, 'availability'), AVAILABLILITY.ONLINE);
      }, 2000);
    });
  }

  /**
   * @param {string} uniqueOutputId
   * @param {{ state: boolean; brightness?: number; }} data
   */
  updateOutputState(uniqueOutputId, data) {
    const device = this.deviceRegistry.getOutputDevice(uniqueOutputId);

    if (!device) {
      logger.warn(`Unknown output id ${uniqueOutputId} - not handled by us.`);
      return;
    }

    logger.verbose(
      `Updating state for ${device.name}: ${data.state}${
        data.brightness ? `, dim: ${data.brightness}` : ''
      }`,
    );
    let payload = null;

    if (device.type === 'switch') {
      payload = getMqttStateString(data.state);
    } else {
      if (device.dimmable) {
        payload = {
          state: getMqttStateString(data.state),
          brightness: data.brightness,
        };
      } else {
        payload = {
          state: getMqttStateString(data.state),
        };
      }

      payload = JSON.stringify(payload);
    }

    this.client.publish(getTopicName(device, 'state'), payload);
    this.client.publish(getTopicName(device, 'availability'), AVAILABLILITY.ONLINE);
  }

  /**
   * @param {string} sceneId
   */
  sceneTriggered(sceneId) {
    logger.verbose(`Scene triggered: ${sceneId}`);
    this.client.publish(getSceneEventTopic(), JSON.stringify({ scene: sceneId }));
  }
}

module.exports = MqttClient;

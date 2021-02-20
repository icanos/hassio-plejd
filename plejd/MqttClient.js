const EventEmitter = require('events');
const mqtt = require('mqtt');

const Configuration = require('./Configuration');
const Logger = require('./Logger');

const startTopics = ['hass/status', 'homeassistant/status'];

const logger = Logger.getLogger('plejd-mqtt');

// #region discovery

const discoveryPrefix = 'homeassistant';
const nodeId = 'plejd';

const getSubscribePath = () => `${discoveryPrefix}/+/${nodeId}/#`;
const getPath = ({ id, type }) => `${discoveryPrefix}/${type}/${nodeId}/${id}`;
const getConfigPath = (plug) => `${getPath(plug)}/config`;
const getStateTopic = (plug) => `${getPath(plug)}/state`;
const getAvailabilityTopic = (plug) => `${getPath(plug)}/availability`;
const getCommandTopic = (plug) => `${getPath(plug)}/set`;
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

const getDiscoveryPayload = (device) => ({
  schema: 'json',
  name: device.name,
  unique_id: `light.plejd.${device.name.toLowerCase().replace(/ /g, '')}`,
  state_topic: getStateTopic(device),
  command_topic: getCommandTopic(device),
  availability_topic: getAvailabilityTopic(device),
  optimistic: false,
  brightness: `${device.dimmable}`,
  device: {
    identifiers: `${device.serialNumber}_${device.id}`,
    manufacturer: 'Plejd',
    model: device.typeName,
    name: device.name,
    sw_version: device.version,
  },
});

const getSwitchPayload = (device) => ({
  name: device.name,
  state_topic: getStateTopic(device),
  command_topic: getCommandTopic(device),
  optimistic: false,
  device: {
    identifiers: `${device.serialNumber}_${device.id}`,
    manufacturer: 'Plejd',
    model: device.typeName,
    name: device.name,
    sw_version: device.version,
  },
});

// #endregion

class MqttClient extends EventEmitter {
  deviceRegistry;

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
          logger.error('Unable to subscribe to status topics');
        }

        this.emit('connected');
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
      if (startTopics.includes(topic)) {
        logger.info('Home Assistant has started. lets do discovery.');
        this.emit('connected');
      } else {
        const decodedTopic = decodeTopic(topic);
        if (decodedTopic) {
          let device = this.deviceRegistry.getDevice(decodedTopic.id);

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
                this.emit('stateChanged', device, command);
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
    });
  }

  reconnect() {
    this.client.reconnect();
  }

  disconnect(callback) {
    this.deviceRegistry.allDevices.forEach((device) => {
      this.client.publish(getAvailabilityTopic(device), 'offline');
    });
    this.client.end(callback);
  }

  sendDiscoveryToHomeAssistant() {
    logger.debug(`Sending discovery of ${this.deviceRegistry.allDevices.length} device(s).`);

    this.deviceRegistry.allDevices.forEach((device) => {
      logger.debug(`Sending discovery for ${device.name}`);

      const payload = device.type === 'switch' ? getSwitchPayload(device) : getDiscoveryPayload(device);
      logger.info(
        `Discovered ${device.type} (${device.typeName}) named ${device.name} with PID ${device.id}.`,
      );

      this.client.publish(getConfigPath(device), JSON.stringify(payload));
      setTimeout(() => {
        this.client.publish(getAvailabilityTopic(device), 'online');
      }, 2000);
    });
  }

  updateState(deviceId, data) {
    const device = this.deviceRegistry.getDevice(deviceId);

    if (!device) {
      logger.warn(`Unknown device id ${deviceId} - not handled by us.`);
      return;
    }

    logger.verbose(
      `Updating state for ${device.name}: ${data.state}${
        data.brightness ? `, dim: ${data.brightness}` : ''
      }`,
    );
    let payload = null;

    if (device.type === 'switch') {
      payload = data.state === 1 ? 'ON' : 'OFF';
    } else {
      if (device.dimmable) {
        payload = {
          state: data.state === 1 ? 'ON' : 'OFF',
          brightness: data.brightness,
        };
      } else {
        payload = {
          state: data.state === 1 ? 'ON' : 'OFF',
        };
      }

      payload = JSON.stringify(payload);
    }

    this.client.publish(getStateTopic(device), payload);
    this.client.publish(getAvailabilityTopic(device), 'online');
  }

  sceneTriggered(sceneId) {
    logger.verbose(`Scene triggered: ${sceneId}`);
    this.client.publish(getSceneEventTopic(), JSON.stringify({ scene: sceneId }));
  }
}

module.exports = MqttClient;

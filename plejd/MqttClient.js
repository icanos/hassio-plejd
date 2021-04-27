const EventEmitter = require('events');
const mqtt = require('mqtt');

const Configuration = require('./Configuration');
const Logger = require('./Logger');

const startTopics = ['hass/status', 'homeassistant/status'];

const logger = Logger.getLogger('plejd-mqtt');

// #region discovery

const discoveryPrefix = 'homeassistant';
const nodeId = 'plejd';

const MQTT_TYPES = {
  LIGHT: 'light',
  SCENE: 'scene', // A bit problematic. Will assume scene if length === guid
  SWITCH: 'switch',
};

const TOPICS = {
  CONFIG: 'config',
  STATE: 'state',
  AVAILABILITY: 'availability',
  COMMAND: 'set',
};

const getMqttType = (/** @type {{ uniqueId: string; type: string; }} */ plug) => (plug.type === 'switch' ? MQTT_TYPES.LIGHT : plug.type);

const getBaseTopic = (/** @type {{ uniqueId: string; type: string; }} */ plug) => `${discoveryPrefix}/${getMqttType(plug)}/${nodeId}/${plug.uniqueId}`;

const getTopicName = (
  /** @type {{ uniqueId: string; type: string; }} */ plug,
  /** @type {'config' | 'state' | 'availability' | 'set'} */ topicType,
) => `${getBaseTopic(plug)}/${topicType}`;

const getSceneEventTopic = (sceneId) => `${getTopicName({ uniqueId: `${sceneId}_trigger`, type: 'device_automation' }, 'state')}`;
const getSubscribePath = () => `${discoveryPrefix}/+/${nodeId}/#`;

// Very loosely check if string is a GUID/UUID
const isGuid = (s) => /^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(s);

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
  unique_id: device.uniqueId,
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

const getSceneDiscoveryPayload = (
  /** @type {import('./types/DeviceRegistry').OutputDevice} */ sceneDevice,
) => ({
  name: sceneDevice.name,
  unique_id: sceneDevice.uniqueId,
  '~': getBaseTopic(sceneDevice),
  command_topic: `~/${TOPICS.COMMAND}`,
  availability_topic: `~/${TOPICS.AVAILABILITY}`,
  payload_on: 'ON',
  qos: 1,
  retain: false,
});

const getSceneDeviceTriggerhDiscoveryPayload = (
  /** @type {import('./types/DeviceRegistry').OutputDevice} */ sceneDevice,
) => ({
  automation_type: 'trigger',
  '~': getBaseTopic({
    uniqueId: sceneDevice.uniqueId,
    type: 'device_automation',
  }),
  qos: 1,
  topic: `~/${TOPICS.STATE}`,
  type: 'scene',
  subtype: 'trigger',
  device: {
    identifiers: `${sceneDevice.uniqueId}`,
    manufacturer: 'Plejd',
    model: sceneDevice.typeName,
    name: sceneDevice.name,
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

  /**
   * @param {import("DeviceRegistry")} deviceRegistry
   */
  constructor(deviceRegistry) {
    super();

    this.config = Configuration.getOptions();
    this.deviceRegistry = deviceRegistry;
  }

  init() {
    logger.info('Initializing MQTT connection for Plejd addon');

    this.client = mqtt.connect(this.config.mqttBroker, {
      clientId: `hassio-plejd_${Math.random().toString(16).substr(2, 8)}`,
      password: this.config.mqttPassword,
      protocolVersion: 4, // v5 not supported by HassIO Mosquitto
      queueQoSZero: true,
      username: this.config.mqttUsername,
    });

    this.client.on('error', (err) => {
      logger.warn('Error emitted from mqtt client', err);
    });

    this.client.on('connect', () => {
      logger.info('Connected to MQTT.');

      this.client.subscribe(
        startTopics,
        // Add below when mqtt v5 is supported in Mosquitto 1.6 or 2.0 and forward
        // {
        //   qos: 1,
        //   nl: true,  // don't echo back messages sent
        //   rap: true, // retain as published - don't force retain = 0
        // },
        (err) => {
          if (err) {
            logger.error('Unable to subscribe to status topics', err);
          }

          this.emit(MqttClient.EVENTS.connected);
        },
      );

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
          logger.verbose(`Received mqtt message on ${topic}`);
          const decodedTopic = decodeTopic(topic);
          if (decodedTopic) {
            /** @type {import('types/DeviceRegistry').OutputDevice} */
            let device;

            if (decodedTopic.type === MQTT_TYPES.SCENE && isGuid(decodedTopic.id)) {
              // UUID device id => It's a scene
              logger.verbose(`Getting scene ${decodedTopic.id} from registry`);
              device = this.deviceRegistry.getScene(decodedTopic.id);
            } else {
              logger.verbose(`Getting device ${decodedTopic.id} from registry`);
              device = this.deviceRegistry.getOutputDevice(decodedTopic.id);
            }

            const messageString = message.toString();
            const isJsonMessage = messageString.startsWith('{');
            const command = isJsonMessage ? JSON.parse(messageString) : messageString;

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
      this.client.publish(getTopicName(outputDevice, 'availability'), AVAILABLILITY.OFFLINE, {
        retain: true,
        qos: 1,
      });
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

      this.client.publish(getTopicName(outputDevice, 'config'), JSON.stringify(configPayload), {
        retain: true,
        qos: 1,
      });
      setTimeout(() => {
        this.client.publish(getTopicName(outputDevice, 'availability'), AVAILABLILITY.ONLINE, {
          retain: true,
          qos: 1,
        });
      }, 2000);
    });

    const allSceneDevices = this.deviceRegistry.getAllSceneDevices();
    logger.info(`Sending discovery for ${allSceneDevices.length} Plejd scene devices`);
    allSceneDevices.forEach((sceneDevice) => {
      logger.debug(`Sending discovery for ${sceneDevice.name}`);

      const sceneConfigPayload = getSceneDiscoveryPayload(sceneDevice);
      logger.info(
        `Discovered ${sceneDevice.typeName} (${sceneDevice.type}) named ${sceneDevice.name} (${sceneDevice.bleOutputAddress} : ${sceneDevice.uniqueId}).`,
      );

      this.client.publish(getTopicName(sceneDevice, 'config'), JSON.stringify(sceneConfigPayload), {
        retain: true,
        qos: 1,
      });

      const sceneTriggerConfigPayload = getSceneDeviceTriggerhDiscoveryPayload(sceneDevice);

      this.client.publish(
        getTopicName(
          {
            ...sceneDevice,
            uniqueId: `${sceneDevice.uniqueId}_trigger`,
            type: 'device_automation',
          },
          'config',
        ),
        JSON.stringify(sceneTriggerConfigPayload),
        {
          retain: true,
          qos: 1,
        },
      );

      setTimeout(() => {
        this.client.publish(getTopicName(sceneDevice, 'availability'), AVAILABLILITY.ONLINE, {
          retain: true,
          qos: 1,
        });
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

    this.client.publish(getTopicName(device, 'state'), payload, { retain: true, qos: 1 });
    this.client.publish(getTopicName(device, 'availability'), AVAILABLILITY.ONLINE, {
      retain: true,
      qos: 1,
    });
  }

  /**
   * @param {string} sceneId
   */
  sceneTriggered(sceneId) {
    logger.verbose(`Scene triggered: ${sceneId}`);
    this.client.publish(getSceneEventTopic(sceneId), '', { qos: 1 });
  }
}

module.exports = MqttClient;

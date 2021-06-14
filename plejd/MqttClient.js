const EventEmitter = require('events');
const mqtt = require('mqtt');

const Configuration = require('./Configuration');
const Logger = require('./Logger');

const startTopics = ['hass/status', 'homeassistant/status'];

const logger = Logger.getLogger('plejd-mqtt');

const discoveryPrefix = 'homeassistant';
const nodeId = 'plejd';

/** @type {import('./types/Mqtt').MQTT_TYPES} */
const MQTT_TYPES = {
  LIGHT: 'light',
  SCENE: 'scene',
  SWITCH: 'switch',
  DEVICE_AUTOMATION: 'device_automation',
};

/** @type {import('./types/Mqtt').TOPIC_TYPES} */
const TOPIC_TYPES = {
  CONFIG: 'config',
  STATE: 'state',
  AVAILABILITY: 'availability',
  COMMAND: 'set',
};

const getBaseTopic = (/** @type { string } */ uniqueId, /** @type { string } */ mqttDeviceType) => `${discoveryPrefix}/${mqttDeviceType}/${nodeId}/${uniqueId}`;

const getTopicName = (
  /** @type { string } */ uniqueId,
  /** @type { import('./types/Mqtt').MqttType } */ mqttDeviceType,
  /** @type { import('./types/Mqtt').TopicType } */ topicType,
) => `${getBaseTopic(uniqueId, mqttDeviceType)}/${topicType}`;

const getButtonEventTopic = (/** @type {string} */ deviceId) => `${getTopicName(deviceId, MQTT_TYPES.DEVICE_AUTOMATION, TOPIC_TYPES.STATE)}`;
const getTriggerUniqueId = (/** @type { string } */ uniqueId) => `${uniqueId}_trig`;
const getSceneEventTopic = (/** @type {string} */ sceneId) => `${getTopicName(getTriggerUniqueId(sceneId), MQTT_TYPES.DEVICE_AUTOMATION, TOPIC_TYPES.STATE)}`;
const getSubscribePath = () => `${discoveryPrefix}/+/${nodeId}/#`;

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

const getOutputDeviceDiscoveryPayload = (
  /** @type {import('./types/DeviceRegistry').OutputDevice} */ device,
) => ({
  name: device.name,
  unique_id: device.uniqueId,
  '~': getBaseTopic(device.uniqueId, device.type),
  state_topic: `~/${TOPIC_TYPES.STATE}`,
  command_topic: `~/${TOPIC_TYPES.COMMAND}`,
  availability_topic: `~/${TOPIC_TYPES.AVAILABILITY}`,
  optimistic: false,
  qos: 1,
  retain: true,
  device: {
    identifiers: `${device.uniqueId}`,
    manufacturer: 'Plejd',
    model: device.typeName,
    name: device.name,
    ...(device.roomName !== undefined ? { suggested_area: device.roomName } : {}),
    sw_version: device.version,
  },
  ...(device.type === MQTT_TYPES.LIGHT ? { brightness: device.dimmable, schema: 'json' } : {}),
});

const getSceneDiscoveryPayload = (
  /** @type {import('./types/DeviceRegistry').OutputDevice} */ sceneDevice,
) => ({
  name: sceneDevice.name,
  unique_id: sceneDevice.uniqueId,
  '~': getBaseTopic(sceneDevice.uniqueId, MQTT_TYPES.SCENE),
  command_topic: `~/${TOPIC_TYPES.COMMAND}`,
  availability_topic: `~/${TOPIC_TYPES.AVAILABILITY}`,
  payload_on: 'ON',
  qos: 1,
  retain: false,
});

const getInputDeviceTriggerDiscoveryPayload = (
  /** @type {import('./types/DeviceRegistry').InputDevice} */ inputDevice,
) => ({
  automation_type: 'trigger',
  payload: `${inputDevice.input}`,
  '~': getBaseTopic(inputDevice.deviceId, MQTT_TYPES.DEVICE_AUTOMATION),
  qos: 1,
  topic: `~/${TOPIC_TYPES.STATE}`,
  type: 'button_short_press',
  subtype: `button_${inputDevice.input + 1}`,
  device: {
    identifiers: `${inputDevice.deviceId}`,
    manufacturer: 'Plejd',
    model: inputDevice.typeName,
    name: inputDevice.name,
  },
});

const getSceneDeviceTriggerhDiscoveryPayload = (
  /** @type {import('./types/DeviceRegistry').OutputDevice} */ sceneDevice,
) => ({
  automation_type: 'trigger',
  '~': getBaseTopic(`${sceneDevice.uniqueId}_trig`, MQTT_TYPES.DEVICE_AUTOMATION),
  qos: 1,
  topic: `~/${TOPIC_TYPES.STATE}`,
  type: 'scene',
  subtype: 'trigger',
  device: {
    identifiers: `${sceneDevice.uniqueId}_trigger`,
    manufacturer: 'Plejd',
    model: sceneDevice.typeName,
    name: sceneDevice.name,
  },
});

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

            if (decodedTopic.type === MQTT_TYPES.SCENE) {
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
    logger.info('Mqtt disconnect requested. Setting all devices as unavailable in HA...');
    this.deviceRegistry.getAllOutputDevices().forEach((outputDevice) => {
      const mqttType = outputDevice.type === 'switch' ? MQTT_TYPES.SWITCH : MQTT_TYPES.LIGHT;
      this.client.publish(
        getTopicName(outputDevice.uniqueId, mqttType, 'availability'),
        AVAILABLILITY.OFFLINE,
        {
          retain: true,
          qos: 1,
        },
      );
    });

    const allSceneDevices = this.deviceRegistry.getAllSceneDevices();
    allSceneDevices.forEach((sceneDevice) => {
      this.client.publish(
        getTopicName(sceneDevice.uniqueId, MQTT_TYPES.SCENE, TOPIC_TYPES.AVAILABILITY),
        AVAILABLILITY.OFFLINE,
        {
          retain: true,
          qos: 1,
        },
      );
    });
    this.client.end(callback);
  }

  sendDiscoveryToHomeAssistant() {
    const allOutputDevices = this.deviceRegistry.getAllOutputDevices();
    logger.info(`Sending discovery for ${allOutputDevices.length} Plejd output devices`);
    allOutputDevices.forEach((outputDevice) => {
      logger.debug(`Sending discovery for ${outputDevice.name}`);

      const configPayload = getOutputDeviceDiscoveryPayload(outputDevice);
      logger.info(
        `Discovered ${outputDevice.typeName} (${outputDevice.type}) named ${outputDevice.name} (${outputDevice.bleOutputAddress} : ${outputDevice.uniqueId}).`,
      );

      const mqttType = outputDevice.type === 'switch' ? MQTT_TYPES.SWITCH : MQTT_TYPES.LIGHT;
      this.client.publish(
        getTopicName(outputDevice.uniqueId, mqttType, TOPIC_TYPES.CONFIG),
        JSON.stringify(configPayload),
        {
          retain: true,
          qos: 1,
        },
      );
      setTimeout(() => {
        this.client.publish(
          getTopicName(outputDevice.uniqueId, mqttType, TOPIC_TYPES.AVAILABILITY),
          AVAILABLILITY.ONLINE,
          {
            retain: true,
            qos: 1,
          },
        );
      }, 2000);
    });

    const allInputDevices = this.deviceRegistry.getAllInputDevices();
    logger.info(`Sending discovery for ${allInputDevices.length} Plejd input devices`);
    allInputDevices.forEach((inputDevice) => {
      logger.debug(`Sending discovery for ${inputDevice.name}`);
      const inputInputPayload = getInputDeviceTriggerDiscoveryPayload(inputDevice);
      logger.info(
        `Discovered ${inputDevice.typeName} (${inputDevice.type}) named ${inputDevice.name} (${inputDevice.bleInputAddress} : ${inputDevice.uniqueId}).`,
      );
      logger.verbose(
        `Publishing  ${getTopicName(
          inputDevice.uniqueId,
          MQTT_TYPES.DEVICE_AUTOMATION,
          TOPIC_TYPES.CONFIG,
        )} with payload ${JSON.stringify(inputInputPayload)}`,
      );

      this.client.publish(
        getTopicName(inputDevice.uniqueId, MQTT_TYPES.DEVICE_AUTOMATION, TOPIC_TYPES.CONFIG),
        JSON.stringify(inputInputPayload),
        {
          retain: true,
          qos: 1,
        },
      );
    });

    const allSceneDevices = this.deviceRegistry.getAllSceneDevices();
    logger.info(`Sending discovery for ${allSceneDevices.length} Plejd scene devices`);
    allSceneDevices.forEach((sceneDevice) => {
      logger.debug(`Sending discovery for ${sceneDevice.name}`);

      const sceneConfigPayload = getSceneDiscoveryPayload(sceneDevice);
      logger.info(
        `Discovered ${sceneDevice.typeName} (${sceneDevice.type}) named ${sceneDevice.name} (${sceneDevice.bleOutputAddress} : ${sceneDevice.uniqueId}).`,
      );

      this.client.publish(
        getTopicName(sceneDevice.uniqueId, MQTT_TYPES.SCENE, TOPIC_TYPES.CONFIG),
        JSON.stringify(sceneConfigPayload),
        {
          retain: true,
          qos: 1,
        },
      );

      const sceneTriggerConfigPayload = getSceneDeviceTriggerhDiscoveryPayload(sceneDevice);

      this.client.publish(
        getTopicName(
          getTriggerUniqueId(sceneDevice.uniqueId),
          MQTT_TYPES.DEVICE_AUTOMATION,
          TOPIC_TYPES.CONFIG,
        ),
        JSON.stringify(sceneTriggerConfigPayload),
        {
          retain: true,
          qos: 1,
        },
      );

      setTimeout(() => {
        this.client.publish(
          getTopicName(sceneDevice.uniqueId, MQTT_TYPES.SCENE, TOPIC_TYPES.AVAILABILITY),
          AVAILABLILITY.ONLINE,
          {
            retain: true,
            qos: 1,
          },
        );
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

    const mqttType = device.type === 'switch' ? MQTT_TYPES.SWITCH : MQTT_TYPES.LIGHT;
    this.client.publish(getTopicName(device.uniqueId, mqttType, TOPIC_TYPES.STATE), payload, {
      retain: true,
      qos: 1,
    });
    // this.client.publish(
    //   getTopicName(device.uniqueId, mqttType, TOPIC_TYPES.AVAILABILITY),
    //   AVAILABLILITY.ONLINE,
    //   { retain: true, qos: 1 },
    // );
  }

  /**
   * @param {string} deviceId
   * @param {string} deviceInput
   */
  buttonPressed(deviceId, deviceInput) {
    logger.verbose(`Button ${deviceInput} pressed for deviceId ${deviceId}`);
    this.client.publish(getButtonEventTopic(deviceId), `${deviceInput}`, { qos: 1 });
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

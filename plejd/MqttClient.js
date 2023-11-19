const EventEmitter = require('events');
const mqtt = require('mqtt');

const Configuration = require('./Configuration');
const Logger = require('./Logger');

// const startTopics = ['hass/status', 'homeassistant/status'];

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
  SET: 'set',
};

const getBaseTopic = (/** @type { string } */ uniqueId, /** @type { string } */ mqttDeviceType) =>
  `${discoveryPrefix}/${mqttDeviceType}/${nodeId}/${uniqueId}`;

const getTopicName = (
  /** @type { string } */ uniqueId,
  /** @type { import('./types/Mqtt').MqttType } */ mqttDeviceType,
  /** @type { import('./types/Mqtt').TopicType } */ topicType,
) => `${getBaseTopic(uniqueId, mqttDeviceType)}/${topicType}`;

const getButtonEventTopic = (/** @type {string} */ deviceId) =>
  `${getTopicName(deviceId, MQTT_TYPES.DEVICE_AUTOMATION, TOPIC_TYPES.STATE)}`;
const getTriggerUniqueId = (/** @type { string } */ uniqueId) => `${uniqueId}_trig`;
const getSceneEventTopic = (/** @type {string} */ sceneId) =>
  `${getTopicName(getTriggerUniqueId(sceneId), MQTT_TYPES.DEVICE_AUTOMATION, TOPIC_TYPES.STATE)}`;
const getSubscribePath = () => `${discoveryPrefix}/+/${nodeId}/#`;

const decodeTopicRegexp =
  /(?<prefix>[^[]+)\/(?<type>.+)\/plejd\/(?<id>.+)\/(?<command>config|state|availability|set|scene)/;

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
  name: null,
  unique_id: device.uniqueId,
  '~': getBaseTopic(device.uniqueId, device.type),
  state_topic: `~/${TOPIC_TYPES.STATE}`,
  command_topic: `~/${TOPIC_TYPES.SET}`,
  availability_topic: `~/${TOPIC_TYPES.AVAILABILITY}`,
  optimistic: false,
  qos: 1,
  retain: false, // State update messages from HA should not be retained
  device: {
    identifiers: `${device.uniqueId}`,
    manufacturer: 'Plejd',
    model: device.typeName,
    name: device.name,
    ...(device.roomName !== undefined ? { suggested_area: device.roomName } : {}),
    sw_version: device.version,
  },
  ...(device.type === MQTT_TYPES.LIGHT ? { brightness: device.dimmable, schema: 'json' } : {}),
  ...(device.type === MQTT_TYPES.LIGHT && device.colorTempSettings?.behavior === 'adjustable'
    ? {
        color_mode: true,
        min_mireds: 1000000 / device.colorTempSettings.minTemperatureLimit,
        max_mireds: 1000000 / device.colorTempSettings.maxTemperatureLimit,
        supported_color_modes: ['color_temp'],
      }
    : {}),
});

const getSceneDiscoveryPayload = (
  /** @type {import('./types/DeviceRegistry').OutputDevice} */ sceneDevice,
) => ({
  name: sceneDevice.name,
  unique_id: sceneDevice.uniqueId,
  '~': getBaseTopic(sceneDevice.uniqueId, MQTT_TYPES.SCENE),
  command_topic: `~/${TOPIC_TYPES.SET}`,
  availability_topic: `~/${TOPIC_TYPES.AVAILABILITY}`,
  payload_on: 'ON',
  qos: 1,
  retain: false, // State update messages from HA should not be retained
});

const getInputDeviceTriggerDiscoveryPayload = (
  /** @type {import('./types/DeviceRegistry').InputDevice} */ inputDevice,
) => ({
  automation_type: 'trigger',
  payload: `${inputDevice.input}`,
  '~': getBaseTopic(inputDevice.deviceId, MQTT_TYPES.DEVICE_AUTOMATION),
  qos: 1,
  retain: true, // Discovery messages should be retained to account for HA restarts
  subtype: `button_${inputDevice.input + 1}`,
  topic: `~/${TOPIC_TYPES.STATE}`,
  type: 'button_short_press',
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
  retain: true, // Discovery messages should be retained to account for HA restarts
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
const AVAILABLITY = { ONLINE: 'online', OFFLINE: 'offline' };

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
      clean: true, // We're moving to not saving mqtt messages
      clientId: `hassio-plejd_${Math.random().toString(16).substr(2, 8)}`,
      password: this.config.mqttPassword,
      properties: {
        sessionExpiryInterval: 120, // 2 minutes sessions for the QoS, after that old messages are discarded
      },
      protocolVersion: 5,
      queueQoSZero: true,
      username: this.config.mqttUsername,
    });

    this.client.on('error', (err) => {
      logger.warn('Error emitted from mqtt client', err);
    });

    this.client.on('connect', () => {
      logger.info('Connected to MQTT.');

      this.emit(MqttClient.EVENTS.connected);

      // Testing to skip listening to HA birth messages all together
      // this.client.subscribe(
      //   startTopics,
      //   {
      //     qos: 1,
      //     nl: true, // don't echo back messages sent
      //     rap: true, // retain as published - don't force retain = 0
      //     rh: 0, // Retain handling 0 presumably ignores retained messages
      //   },
      //   (err) => {
      //     if (err) {
      //       logger.error('Unable to subscribe to status topics', err);
      //     }

      //     this.emit(MqttClient.EVENTS.connected);
      //   },
      // );
    });

    this.client.on('close', () => {
      logger.verbose('Warning: mqtt channel closed event, reconnecting...');
      this.reconnect();
    });

    this.client.on('message', (topic, message) => {
      try {
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
        // }
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
        AVAILABLITY.OFFLINE,
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
        AVAILABLITY.OFFLINE,
        {
          retain: true,
          qos: 1,
        },
      );
    });
    this.client.end(callback);
  }

  sendDiscoveryToHomeAssistant() {
    // -------- DISCOVERY FOR OUTPUT DEVICES -------------

    const allOutputDevices = this.deviceRegistry.getAllOutputDevices();
    logger.info(`Sending discovery for ${allOutputDevices.length} Plejd output devices`);
    allOutputDevices.forEach((outputDevice) => {
      logger.debug(`Sending discovery for ${outputDevice.name}`);

      const configPayload = getOutputDeviceDiscoveryPayload(outputDevice);
      // Publish mqtt CONFIG message which will create the device in Home Assistant
      const mqttType = outputDevice.type === 'switch' ? MQTT_TYPES.SWITCH : MQTT_TYPES.LIGHT;
      this.client.publish(
        getTopicName(outputDevice.uniqueId, mqttType, TOPIC_TYPES.CONFIG),
        JSON.stringify(configPayload),
        {
          retain: true, // Discovery messages should be retained to account for HA and MQTT broker restarts
          qos: 1,
        },
      );

      logger.info(
        `Sent discovery message for ${outputDevice.typeName} (${outputDevice.type}) named ${outputDevice.name} (${outputDevice.bleOutputAddress} : ${outputDevice.uniqueId}).`,
      );

      // -------- CLEANUP RETAINED MESSAGES FOR OUTPUT DEVICES -------------

      logger.debug(
        `Forcefully removing any retained SET, STATE, and AVAILABILITY messages for ${outputDevice.name}`,
      );

      // Forcefully remove retained (from Home Assistant) SET messages (wanted state from HA)
      this.client.publish(getTopicName(outputDevice.uniqueId, mqttType, TOPIC_TYPES.SET), null, {
        retain: true, // Retain true to remove previously retained message
        qos: 1,
      });

      // Forcefully remove retained (from us, v0.11 and before) STATE messages
      this.client.publish(getTopicName(outputDevice.uniqueId, mqttType, TOPIC_TYPES.STATE), null, {
        retain: true, // Retain true to remove previously retained message
        qos: 1,
      });

      // Forcefully remove retained (from us, v0.11 and before) AVAILABILITY messages
      this.client.publish(
        getTopicName(outputDevice.uniqueId, mqttType, TOPIC_TYPES.AVAILABLILITY),
        null,
        {
          retain: true, // Retain true to remove previously retained message
          qos: 1,
        },
      );

      logger.debug(`Removal messages sent for ${outputDevice.name}`);

      logger.debug(`Setting device as AVAILABILITY = ONLINE: ${outputDevice.name}`);

      this.client.publish(
        getTopicName(outputDevice.uniqueId, mqttType, TOPIC_TYPES.AVAILABILITY),
        AVAILABLITY.ONLINE,
        {
          retain: false, // Availability messages should NOT be retained
          qos: 1,
        },
      );
    });

    // -------- DISCOVERY FOR INPUT DEVICES -------------

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
          retain: true, // Discovery messages should be retained to account for HA restarts
          qos: 1,
        },
      );
    });

    // -------- DISCOVERY FOR SCENE DEVICES -------------

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
          retain: true, // Discovery messages should be retained to account for HA restarts
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
          retain: true, // Discovery messages should be retained to account for HA restarts
          qos: 1,
        },
      );

      // setTimeout(() => {
      this.client.publish(
        getTopicName(sceneDevice.uniqueId, MQTT_TYPES.SCENE, TOPIC_TYPES.AVAILABILITY),
        AVAILABLITY.ONLINE,
        {
          retain: true, // Discovery messages should be retained to account for HA restarts
          qos: 1,
        },
      );
      // }, 2000);
    });

    // -------- SUBSCRIBE TO INCOMING MESSAGES -------------

    this.client.subscribe(
      getSubscribePath(),
      {
        qos: 1,
        nl: true, // don't echo back messages sent
        rap: true, // retain as published - don't force retain = 0
        rh: 0, // Retain handling 0 presumably ignores retained messages
      },
      (err) => {
        if (err) {
          logger.error('Unable to subscribe to control topics');
        }
      },
    );
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
      retain: false,
      qos: 1,
    });
    // this.client.publish(
    //   getTopicName(device.uniqueId, mqttType, TOPIC_TYPES.AVAILABILITY),
    //   AVAILABILITY.ONLINE,
    //   { retain: false, qos: 1 },
    // );
  }

  /**
   * @param {string} deviceId
   * @param {string} deviceInput
   */
  buttonPressed(deviceId, deviceInput) {
    logger.verbose(`Button ${deviceInput} pressed for deviceId ${deviceId}`);
    this.client.publish(getButtonEventTopic(deviceId), `${deviceInput}`, {
      retain: false,
      qos: 1,
    });
  }

  /**
   * @param {string} sceneId
   */
  sceneTriggered(sceneId) {
    logger.verbose(`Scene triggered: ${sceneId}`);
    this.client.publish(getSceneEventTopic(sceneId), '', {
      qos: 1,
      retain: false,
    });
  }
}

module.exports = MqttClient;

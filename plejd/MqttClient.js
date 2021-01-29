const EventEmitter = require('events');
const mqtt = require('mqtt');
const Logger = require('./Logger');

const startTopic = 'hass/status';

const logger = Logger.getLogger('plejd-mqtt');

// #region discovery

const discoveryPrefix = 'homeassistant';
const nodeId = 'plejd';

const getSubscribePath = () => `${discoveryPrefix}/+/${nodeId}/#`;
const getPath = ({ id, type }) => `${discoveryPrefix}/${type}/${nodeId}/${id}`;
const getConfigPath = (plug) => `${getPath(plug)}/config`;
const getStateTopic = (plug) => `${getPath(plug)}/state`;
const getAvailabilityTopic = plug => `${getPath(plug)}/availability`;
const getCommandTopic = (plug) => `${getPath(plug)}/set`;
const getSceneEventTopic = () => 'plejd/event/scene';

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
  constructor(mqttBroker, username, password) {
    super();

    this.mqttBroker = mqttBroker;
    this.username = username;
    this.password = password;
    this.deviceMap = {};
    this.devices = [];
  }

  init() {
    logger.info('Initializing MQTT connection for Plejd addon');
    const self = this;

    this.client = mqtt.connect(this.mqttBroker, {
      username: this.username,
      password: this.password,
    });

    this.client.on('connect', () => {
      logger.info('Connected to MQTT.');

      this.client.subscribe(startTopic, (err) => {
        if (err) {
          logger.error(`Unable to subscribe to ${startTopic}`);
        }

        self.emit('connected');
      });

      this.client.subscribe(getSubscribePath(), (err) => {
        if (err) {
          logger.error('Unable to subscribe to control topics');
        }
      });
    });

    this.client.on('close', () => {
      logger.verbose('Warning: mqtt channel closed event, reconnecting...');
      self.reconnect();
    });

    this.client.on('message', (topic, message) => {
      // const command = message.toString();
      const command = message.toString().substring(0, 1) === '{'
        ? JSON.parse(message.toString())
        : message.toString();

      if (topic === startTopic) {
        logger.info('Home Assistant has started. lets do discovery.');
        self.emit('connected');
      } else if (topic.includes('set')) {
        logger.verbose(`Got mqtt command on ${topic} - ${message}`);
        const device = self.devices.find((x) => getCommandTopic(x) === topic);
        if (device) {
          self.emit('stateChanged', device, command);
        } else {
          logger.warn(
            `Device for topic ${topic} not found! Can happen if HA calls previously existing devices.`,
          );
        }
      } else if (topic.includes('state')) {
        logger.verbose(`State update sent over mqtt to HA ${topic} - ${message}`);
      } else {
        logger.verbose(`Warning: Got unrecognized mqtt command on ${topic} - ${message}`);
      }
    });
  }

  reconnect() {
    this.client.reconnect();
  }

  disconnect(callback) {
    this.devices.forEach((device) => {
      this.client.publish(
        getAvailabilityTopic(device),
        "offline"
      );
    });
    this.client.end(callback);
  }

  discover(devices) {
    this.devices = devices;

    const self = this;
    logger.debug(`Sending discovery of ${devices.length} device(s).`);

    devices.forEach((device) => {
      logger.debug(`Sending discovery for ${device.name}`);

      const payload = device.type === 'switch' ? getSwitchPayload(device) : getDiscoveryPayload(device);
      logger.info(
        `Discovered ${device.type} (${device.typeName}) named ${device.name} with PID ${device.id}.`,
      );

      self.deviceMap[device.id] = payload.unique_id;

      self.client.publish(getConfigPath(device), JSON.stringify(payload));
      setTimeout(() => {
        self.client.publish(getAvailabilityTopic(device), "online");
      }, 2000);
    });
  }

  updateState(deviceId, data) {
    const device = this.devices.find((x) => x.id === deviceId);

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
    this.client.publish(getAvailabilityTopic(device), "online");
  }

  sceneTriggered(scene) {
    logger.verbose(`Scene triggered: ${scene}`);
    this.client.publish(getSceneEventTopic(), JSON.stringify({ scene }));
  }
}

module.exports = MqttClient;

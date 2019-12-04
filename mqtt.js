const EventEmitter = require('events');
const mqtt = require('mqtt');
const _ = require('lodash');

const startTopic = 'hass/status';

// #region logging
const debug = '';

const getLogger = () => {
  const consoleLogger = msg => console.log('plejd-mqtt', msg);
  if (debug === 'console') {
    return consoleLogger;
  }
  return _.noop;
};

const logger = getLogger();
// #endregion

// #region discovery

const discoveryPrefix = 'homeassistant';
const nodeId = 'plejd';

const getSubscribePath = () => `${discoveryPrefix}/+/${nodeId}/#`;
const getPath = ({ id, type }) =>
  `${discoveryPrefix}/${type}/${nodeId}/${id}`;
const getConfigPath = plug => `${getPath(plug)}/config`;
const getAvailabilityTopic = plug => `${getPath(plug)}/availability`;
const getStateTopic = plug => `${getPath(plug)}/state`;
const getBrightnessCommandTopic = plug => `${getPath(plug)}/setBrightness`;
const getBrightnessTopic = plug => `${getPath(plug)}/brightness`;
const getCommandTopic = plug => `${getPath(plug)}/set`;

const getDiscoveryPayload = device => ({
  name: device.name,
  unique_id: `light.plejd.${device.name.toLowerCase().replace(/ /g, '')}`,
  state_topic: getStateTopic(device),
  command_topic: getCommandTopic(device),
  brightness_command_topic: getBrightnessCommandTopic(device),
  brightness_state_topic: getBrightnessTopic(device),
  payload_on: 1,
  payload_off: 0,
  optimistic: false
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
    const self = this;

    this.client = mqtt.connect(this.mqttBroker, {
      username: this.username,
      password: this.password
    });

    this.client.on('connect', () => {
      logger('connected to MQTT.');

      this.client.subscribe(startTopic, (err) => {
        if (err) {
          logger('error: unable to subscribe to ' + startTopic);
        }

        self.emit('connected');
      });

      this.client.subscribe(getSubscribePath(), (err) => {
        if (err) {
          logger('error: unable to subscribe to control topics');
        }
      });
    });

    this.client.on('close', () => {
      self.reconnect();
    });

    this.client.on('message', (topic, message) => {
      const command = message.toString();

      if (topic === startTopic) {
        logger('home assistant has started. lets do discovery.');
        self.emit('connected');
      }

      if (_.includes(topic, 'setBrightness')) {
        const device = self.devices.find(x => getBrightnessCommandTopic(x) === topic);
        logger('got brightness update for ' + device.name + ' with brightness: ' + command);

        self.emit('brightnessChanged', device.id, parseInt(command));
      }
      else if (_.includes(topic, 'set') && _.includes(['0', '1'], command)) {
        const device = self.devices.find(x => getCommandTopic(x) === topic);
        logger('got state update for ' + device.name + ' with state: ' + command);

        self.emit('stateChanged', device.id, parseInt(command));
      }
    });
  }

  reconnect() {
    this.client.reconnect();
  }

  discover(devices) {
    this.devices = devices;

    const self = this;
    logger('sending discovery of ' + devices.length + ' device(s).');

    devices.forEach((device) => {
      logger(`sending discovery for ${device.name}`);

      const payload = getDiscoveryPayload(device);
      self.deviceMap[device.id] = payload.unique_id;

      self.client.publish(
        getConfigPath(device),
        JSON.stringify(payload)
      );
    });
  }

  updateState(deviceId, state) {
    const device = this.devices.find(x => x.id === deviceId);

    if (!device) {
      logger('error: ' + deviceId + ' is not handled by us.');
      return;
    }

    logger('updating state for ' + device.name + ': ' + state);

    this.client.publish(
      getStateTopic(device),
      state.toString()
    );
  }

  updateBrightness(deviceId, brightness) {
    const device = this.devices.find(x => x.id === deviceId);

    if (!device) {
      logger('error: ' + deviceId + ' is not handled by us.');
      return;
    }

    logger('updating brightness for ' + device.name + ': ' + brightness);

    this.client.publish(
      getBrightnessTopic(device),
      brightness.toString()
    );
  }
}

module.exports = { MqttClient };
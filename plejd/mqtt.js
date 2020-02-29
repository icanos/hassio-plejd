const EventEmitter = require('events');
const mqtt = require('mqtt');
const _ = require('lodash');

const startTopic = 'hass/status';

// #region logging
let debug = '';

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
const getStateTopic = plug => `${getPath(plug)}/state`;
const getCommandTopic = plug => `${getPath(plug)}/set`;
const getSceneEventTopic = () => `plejd/event/scene`;
const getSettingsTopic = () => `plejd/settings`;

const getDiscoveryPayload = device => ({
  schema: 'json',
  name: device.name,
  unique_id: `light.plejd.${device.name.toLowerCase().replace(/ /g, '')}`,
  state_topic: getStateTopic(device),
  command_topic: getCommandTopic(device),
  optimistic: false,
  brightness: `${device.dimmable}`,
  device: {
    identifiers: device.serialNumber + '_' + device.id,
    manufacturer: 'Plejd',
    model: device.typeName,
    name: device.name,
    sw_version: device.version
  }
});

const getSwitchPayload = device => ({
  name: device.name,
  state_topic: getStateTopic(device),
  command_topic: getCommandTopic(device),
  optimistic: false,
  device: {
    identifiers: device.serialNumber + '_' + device.id,
    manufacturer: 'Plejd',
    model: device.typeName,
    name: device.name,
    sw_version: device.version
  }
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

      this.client.subscribe(getSettingsTopic(), (err) => {
        if (err) {
          console.log('error: could not subscribe to settings topic');
        }
      });
    });

    this.client.on('close', () => {
      self.reconnect();
    });

    this.client.on('message', (topic, message) => {
      //const command = message.toString();
      const command = message.toString().substring(0, 1) === '{' 
        ? JSON.parse(message.toString())
        : message.toString();

      if (topic === startTopic) {
        logger('home assistant has started. lets do discovery.');
        self.emit('connected');
      }
      else if (topic === getSettingsTopic()) {
        self.emit('settingsChanged', command);
      }

      if (_.includes(topic, 'set')) {
        const device = self.devices.find(x => getCommandTopic(x) === topic);
        self.emit('stateChanged', device, command);
      }
    });
  }

  updateSettings(settings) {
    if (settings.debug) {
      debug = 'console';
    }
    else {
      debug = '';
    }
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

      let payload = device.type === 'switch' ? getSwitchPayload(device) : getDiscoveryPayload(device);
      console.log(`plejd-mqtt: discovered ${device.type} (${device.typeName}) named ${device.name} with PID ${device.id}.`);

      self.deviceMap[device.id] = payload.unique_id;

      self.client.publish(
        getConfigPath(device),
        JSON.stringify(payload)
      );
    });
  }

  updateState(deviceId, data) {
    const device = this.devices.find(x => x.id === deviceId);

    if (!device) {
      logger('error: ' + deviceId + ' is not handled by us.');
      return;
    }

    logger('updating state for ' + device.name + ': ' + data.state);
    let payload = null;

    if (device.type === 'switch') {
      payload = data.state === 1 ? 'ON' : 'OFF';
    }
    else {
      if (device.dimmable) {
        payload = {
          state: data.state === 1 ? 'ON' : 'OFF',
          brightness: data.brightness
        }
      }
      else {
        payload = {
          state: data.state === 1 ? 'ON' : 'OFF'
        }
      }

      payload = JSON.stringify(payload);
    }

    this.client.publish(
      getStateTopic(device),
      payload
    );
  }

  sceneTriggered(scene) {
    this.client.publish(
      getSceneEventTopic(),
      JSON.stringify({ scene: scene })
    );
  }
}

module.exports = { MqttClient };
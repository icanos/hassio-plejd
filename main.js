const plejd = require('./plejd');
const api = require('./api');
const mqtt = require('./mqtt');
const fs = require('fs');

async function main() {
  const rawData = fs.readFileSync('/data/plejd.json');
  const config = JSON.parse(rawData);

  const plejdApi = new api.PlejdApi(config.site, config.username, config.password);
  const client = new mqtt.MqttClient(config.mqttBroker, config.mqttUsername, config.mqttPassword);

  plejdApi.once('loggedIn', () => {
    plejdApi.getCryptoKey((cryptoKey) => {
      const devices = plejdApi.getDevices();

      client.once('connected', () => {
        console.log('plejd-mqtt: connected to mqtt.');
        client.discover(devices);
      });

      client.init();

      // init the BLE interface
      const controller = new plejd.Controller(cryptoKey, true);
      controller.on('scanComplete', async (peripherals) => {
        await controller.connect();
      });

      controller.on('connected', () => {
        console.log('plejd: connected via bluetooth.');
      });

      // subscribe to changes from Plejd
      controller.on('stateChanged', (deviceId, state) => {
        client.updateState(deviceId, state);
      });
      controller.on('dimChanged', (deviceId, state, dim) => {
        client.updateState(deviceId, state);
        client.updateBrightness(deviceId, dim);
      });

      // subscribe to changes from HA
      client.on('stateChanged', (deviceId, state) => {
        if (state) {
          controller.turnOn(deviceId);
        }
        else {
          controller.turnOff(deviceId);
        }
      });
      client.on('brightnessChanged', (deviceId, brightness) => {
        if (brightness > 0) {
          controller.turnOn(deviceId, brightness);
        }
        else {
          controller.turnOff(deviceId);
        }
      });

      controller.init();
    });
  });

  plejdApi.login();
}

main();
const api = require('./api');
const mqtt = require('./mqtt');
const fs = require('fs');
const PlejdService = require('./ble');

const version = "0.2.8";

async function main() {
  console.log('starting Plejd add-on v. ' + version);

  const rawData = fs.readFileSync('/data/plejd.json');
  const config = JSON.parse(rawData);

  const plejdApi = new api.PlejdApi(config.site, config.username, config.password);
  const client = new mqtt.MqttClient(config.mqttBroker, config.mqttUsername, config.mqttPassword);

  plejdApi.once('loggedIn', () => {
    plejdApi.getCryptoKey((cryptoKey) => {
      const devices = plejdApi.getDevices();

      client.on('connected', () => {
        console.log('plejd-mqtt: connected to mqtt.');
        client.discover(devices);
      });

      client.init();

      // init the BLE interface
      const plejd = new PlejdService(cryptoKey, true);
      plejd.on('authenticated', () => {
        console.log('plejd: connected via bluetooth.');
      });

      // subscribe to changes from Plejd
      plejd.on('stateChanged', (deviceId, command) => {
        client.updateState(deviceId, command);
      });

      plejd.on('sceneTriggered', (deviceId, scene) => {
        client.sceneTriggered(scene);
      });

      // subscribe to changes from HA
      client.on('stateChanged', (deviceId, command) => {
        if (command.state === 'ON') {
          plejd.turnOn(deviceId, command);
        }
        else {
          plejd.turnOff(deviceId, command);
        }
      });

      client.on('settingsChanged', (settings) => {
        if (settings.module === 'mqtt') {
          client.updateSettings(settings);
        }
        else if (settings.module === 'ble') {
          plejd.updateSettings(settings);
        }
        else if (settings.module === 'api') {
          plejdApi.updateSettings(settings);
        }
      });
    });
  });

  plejdApi.login();
}

main();
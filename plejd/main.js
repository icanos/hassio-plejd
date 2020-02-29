const api = require('./api');
const mqtt = require('./mqtt');
const fs = require('fs');
const PlejdService = require('./ble.bluez');
const SceneManager = require('./scene.manager');

const version = "0.4.0";

async function main() {
  console.log('starting Plejd add-on v. ' + version);

  const rawData = fs.readFileSync('/data/plejd.json');
  const config = JSON.parse(rawData);

  if (!config.connectionTimeout) {
    config.connectionTimeout = 2;
  }

  const plejdApi = new api.PlejdApi(config.site, config.username, config.password);
  const client = new mqtt.MqttClient(config.mqttBroker, config.mqttUsername, config.mqttPassword);

  plejdApi.once('loggedIn', () => {
    plejdApi.on('ready', (cryptoKey, site) => {
      const devices = plejdApi.getDevices();

      client.on('connected', () => {
        console.log('plejd-mqtt: connected to mqtt.');
        client.discover(devices);
      });

      client.init();

      // init the BLE interface
      const sceneManager = new SceneManager(site, devices);
      const plejd = new PlejdService(cryptoKey, devices, sceneManager, config.connectionTimeout, true);
      plejd.on('connectFailed', () => {
        console.log('plejd-ble: were unable to connect, will retry connection in 10 seconds.');
        setTimeout(() => {
          plejd.init();
        }, 10000);
      });

      plejd.init();

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
      client.on('stateChanged', (device, command) => {
        const deviceId = device.id;

        if (device.typeName === 'Scene') {
          // we're triggering a scene, lets do that and jump out.
          // since scenes aren't "real" devices.
          plejd.triggerScene(device.id);
          return;
        }

        let state = 'OFF';
        let commandObj = {};

        if (typeof command === 'string') {
          // switch command
          state = command;
          commandObj = { state: state };

          // since the switch doesn't get any updates on whether it's on or not,
          // we fake this by directly send the updateState back to HA in order for
          // it to change state.
          client.updateState(deviceId, { state: state === 'ON' ? 1 : 0 });
        }
        else {
          state = command.state;
          commandObj = command;
        }

        if (state === 'ON') {
          plejd.turnOn(deviceId, commandObj);
        }
        else {
          plejd.turnOff(deviceId, commandObj);
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

    plejdApi.getCryptoKey();
  });

  plejdApi.login();
}

main();
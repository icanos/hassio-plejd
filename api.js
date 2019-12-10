const axios = require('axios');
const EventEmitter = require('events');
const _ = require('lodash');

API_APP_ID = 'zHtVqXt8k4yFyk2QGmgp48D9xZr2G94xWYnF4dak';
API_BASE_URL = 'https://cloud.plejd.com/parse/';
API_LOGIN_URL = 'login';
API_SITES_URL = 'functions/getSites';

// #region logging
const debug = '';

const getLogger = () => {
  const consoleLogger = msg => console.log('plejd-api', msg);
  if (debug === 'console') {
    return consoleLogger;
  }
  return _.noop;
};

const logger = getLogger();
// #endregion

class PlejdApi extends EventEmitter {
  constructor(siteName, username, password) {
    super();

    this.siteName = siteName;
    this.username = username;
    this.password = password;

    this.sessionToken = '';
    this.site = null;
  }

  login() {
    const self = this;

    const instance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'X-Parse-Application-Id': API_APP_ID,
        'Content-Type': 'application/json'
      }
    });

    instance.post(
      API_LOGIN_URL,
      {
        'username': this.username,
        'password': this.password
      })
      .then((response) => {
        self.sessionToken = response.data.sessionToken;
        self.emit('loggedIn');
      });
  }

  getCryptoKey(callback) {
    const self = this;

    const instance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'X-Parse-Application-Id': API_APP_ID,
        'X-Parse-Session-Token': this.sessionToken,
        'Content-Type': 'application/json'
      }
    });

    instance.post(API_SITES_URL)
      .then((response) => {
        self.site = response.data.result.find(x => x.site.title == self.siteName);
        self.cryptoKey = self.site.plejdMesh.cryptoKey;

        callback(self.cryptoKey);
      })
      .catch((error) => {
        logger('unable to retrieve the crypto key. error: ' + error);
        return Promise.reject('unable to retrieve the crypto key. error: ' + error);
      });
  }

  getDevices() {
    let devices = [];

    // Just log the devices if debug logging enabled
    if (debug) {
      logger(JSON.stringify(this.site));
    }

    for (let i = 0; i < this.site.devices.length; i++) {
      const device = this.site.devices[i];
      const deviceId = device.deviceId;

      const settings = this.site.outputSettings.find(x => x.deviceParseId == device.objectId);
      let deviceNum = this.site.deviceAddress[deviceId];

      if (settings) {
        const outputs = this.site.outputAddress[deviceId];
        deviceNum = outputs[settings.output];
      }

      // check if device is dimmable
      let dimmable = false;
      if (device.hardware) {
        dimmable = device.hardware.name == 'DIM-01';
      }

      if (settings) {
        dimmable = settings.dimCurve != 'NonDimmable';
      }

      const newDevice = {
        id: deviceNum,
        name: device.title,
        type: 'light',
        supportsDim: dimmable
      };

      logger(JSON.stringify(newDevice));

      devices.push(newDevice);
    }

    return devices;
  }
}

module.exports = { PlejdApi };
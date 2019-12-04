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

    for (let i = 0; i < this.site.devices.length; i++) {
      let device = this.site.devices[i];
      let deviceId = device.deviceId;

      devices.push({
        id: this.site.deviceAddress[deviceId],
        name: device.title,
        type: 'light'
      });
    }

    return devices;
  }
}

module.exports = { PlejdApi };
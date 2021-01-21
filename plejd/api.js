const axios = require('axios');
const EventEmitter = require('events');
const Logger = require('./Logger');

API_APP_ID = 'zHtVqXt8k4yFyk2QGmgp48D9xZr2G94xWYnF4dak';
API_BASE_URL = 'https://cloud.plejd.com/parse/';
API_LOGIN_URL = 'login';
API_SITE_LIST_URL = 'functions/getSiteList';
API_SITE_DETAILS_URL = 'functions/getSiteById';

const logger = Logger.getLogger("plejd-api");

class PlejdApi extends EventEmitter {
  constructor(siteName, username, password, includeRoomsAsLights) {
    super();

    this.includeRoomsAsLights = includeRoomsAsLights;
    this.siteName = siteName;
    this.username = username;
    this.password = password;

    this.sessionToken = '';
    this.site = null;
  }

  login() {
    logger.info('login()');
    logger.info('logging into ' + this.siteName);
    const self = this;

    const instance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'X-Parse-Application-Id': API_APP_ID,
        'Content-Type': 'application/json'
      }
    });

    return new Promise((resolve, reject) => {
      logger.debug('sending POST to ' + API_BASE_URL + API_LOGIN_URL);

      instance.post(
        API_LOGIN_URL,
        {
          'username': this.username,
          'password': this.password
        })
        .then((response) => {
          logger.info('got session token response');
          self.sessionToken = response.data.sessionToken;

          if (!self.sessionToken) {
            logger.error('No session token received');
            reject('no session token received.');
          }

          resolve();
        })
        .catch((error) => {
          if (error.response.status === 400) {
            logger.error('Server returned status 400. probably invalid credentials, please verify.');
          }
          else {
            logger.error('Unable to retrieve session token response: ', error);
          }

          reject('unable to retrieve session token response: ' + error);
        });
    });
  }

  getSites() {
    logger.info('Get all Plejd sites for account...');
    const self = this;

    const instance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'X-Parse-Application-Id': API_APP_ID,
        'X-Parse-Session-Token': this.sessionToken,
        'Content-Type': 'application/json'
      }
    });

    return new Promise((resolve, reject) => {
      logger.debug('sending POST to ' + API_BASE_URL + API_SITE_LIST_URL);

      instance.post(API_SITE_LIST_URL)
        .then((response) => {
          logger.info('got site list response');
          const site = response.data.result.find(x => x.site.title == self.siteName);

          if (!site) {
            logger.error('error: failed to find a site named ' + self.siteName);
            reject('failed to find a site named ' + self.siteName);
            return;
          }

          resolve(site);
        })
        .catch((error) => {
          logger.error('error: unable to retrieve list of sites. error: ', error);
          return reject('plejd-api: unable to retrieve list of sites. error: ' + error);
        });
    });
  }

  getSite(siteId) {
    logger.info(`Get site details...`);
    const self = this;

    const instance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'X-Parse-Application-Id': API_APP_ID,
        'X-Parse-Session-Token': this.sessionToken,
        'Content-Type': 'application/json'
      }
    });

    return new Promise((resolve, reject) => {
      logger.debug('sending POST to ' + API_BASE_URL + API_SITE_DETAILS_URL);

      instance.post(API_SITE_DETAILS_URL, { siteId: siteId })
        .then((response) => {
          logger.info('got site details response');
          if (response.data.result.length === 0) {
            const msg = 'no site with ID ' + siteId + ' was found.';
            logger.error('error: ' + msg);
            reject(msg);
            return;
          }

          self.site = response.data.result[0];
          self.cryptoKey = self.site.plejdMesh.cryptoKey;

          resolve(self.cryptoKey);
        })
        .catch((error) => {
          logger.error('error: unable to retrieve the crypto key. error: ', error);
          return reject('plejd-api: unable to retrieve the crypto key. error: ' + error);
        });
    });
  }

  getDevices() {
    let devices = [];

    logger.verbose(JSON.stringify(this.site));

    const roomDevices = {};

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
      const plejdDevice = this.site.plejdDevices.find(x => x.deviceId == deviceId);
      let { name, type, dimmable } = this._getDeviceType(plejdDevice.hardwareId);

      if (settings) {
        dimmable = settings.dimCurve != 'NonDimmable';
      }

      const newDevice = {
        id: deviceNum,
        name: device.title,
        type: type,
        typeName: name,
        dimmable: dimmable,
        version: plejdDevice.firmware.version,
        serialNumber: plejdDevice.deviceId
      };

      if (newDevice.typeName === 'WPH-01') {
        // WPH-01 is special, it has two buttons which needs to be
        // registered separately.
        const inputs = this.site.inputAddress[deviceId];
        const first = inputs[0];
        const second = inputs[1];

        let switchDevice = {
          id: first,
          name: device.title + ' knapp vä',
          type: type,
          typeName: name,
          dimmable: dimmable,
          version: plejdDevice.firmware.version,
          serialNumber: plejdDevice.deviceId
        };

        if (roomDevices[device.roomId]) {
          roomDevices[device.roomId].push(switchDevice);
        }
        else {
          roomDevices[device.roomId] = [switchDevice];
        }
        devices.push(switchDevice);

        switchDevice = {
          id: second,
          name: device.title + ' knapp hö',
          type: type,
          typeName: name,
          dimmable: dimmable,
          version: plejdDevice.firmware.version,
          serialNumber: plejdDevice.deviceId
        };

        if (roomDevices[device.roomId]) {
          roomDevices[device.roomId].push(switchDevice);
        }
        else {
          roomDevices[device.roomId] = [switchDevice];
        }
        devices.push(switchDevice);
      }
      else {
        if (roomDevices[device.roomId]) {
          roomDevices[device.roomId].push(newDevice);
        }
        else {
          roomDevices[device.roomId] = [newDevice];
        }

        devices.push(newDevice);
      }
    }

    if (this.includeRoomsAsLights) {
      logger.debug('includeRoomsAsLights is set to true, adding rooms too.');
      for (let i = 0; i < this.site.rooms.length; i++) {
        const room = this.site.rooms[i];
        const roomId = room.roomId;
        const roomAddress = this.site.roomAddress[roomId];

        const newDevice = {
          id: roomAddress,
          name: room.title,
          type: 'light',
          typeName: 'Room',
          dimmable: roomDevices[roomId].filter(x => x.dimmable).length > 0
        };

        devices.push(newDevice);
      }
      logger.debug('includeRoomsAsLights done.');
    }

    // add scenes as switches
    const scenes = this.site.scenes.filter(x => x.hiddenFromSceneList == false);

    for (const scene of scenes) {
      const sceneNum = this.site.sceneIndex[scene.sceneId];
      const newScene = {
        id: sceneNum,
        name: scene.title,
        type: 'switch',
        typeName: 'Scene',
        dimmable: false,
        version: '1.0',
        serialNumber: scene.objectId
      };

      devices.push(newScene);
    }

    return devices;
  }

  _getDeviceType(hardwareId) {
    switch (parseInt(hardwareId)) {
      case 1:
      case 11:
        return { name: "DIM-01", type: 'light', dimmable: true };
      case 2:
        return { name: "DIM-02", type: 'light', dimmable: true };
      case 3:
        return { name: "CTR-01", type: 'light', dimmable: false };
      case 4:
        return { name: "GWY-01", type: 'sensor', dimmable: false };
      case 5:
        return { name: "LED-10", type: 'light', dimmable: true };
      case 6:
        return { name: "WPH-01", type: 'switch', dimmable: false };
      case 7:
        return { name: "REL-01", type: 'switch', dimmable: false };
      case 8:
      case 9:
        // Unknown
        return { name: "-unknown-", type: 'light', dimmable: false };
      case 10:
        return { name: "-unknown-", type: 'light', dimmable: false };
      case 12:
        // Unknown
        return { name: "-unknown-", type: 'light', dimmable: false };
      case 13:
        return { name: "Generic", type: 'light', dimmable: false };
      case 14:
      case 15:
      case 16:
        // Unknown
        return { name: "-unknown-", type: 'light', dimmable: false };
      case 17:
        return { name: "REL-01", type: 'switch', dimmable: false };
      case 18:
        return { name: "REL-02", type: 'switch', dimmable: false };
      case 19:
        // Unknown
        return { name: "-unknown-", type: 'light', dimmable: false };
      case 20:
        return { name: "SPR-01", type: 'switch', dimmable: false };
    }
  }
}

module.exports = { PlejdApi };
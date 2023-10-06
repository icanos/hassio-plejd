const axios = require('axios').default;
const fs = require('fs');

const Configuration = require('./Configuration');
const Logger = require('./Logger');

const API_APP_ID = 'zHtVqXt8k4yFyk2QGmgp48D9xZr2G94xWYnF4dak';
const API_BASE_URL = 'https://cloud.plejd.com/parse/';
const API_LOGIN_URL = 'login';
const API_SITE_LIST_URL = 'functions/getSiteList';
const API_SITE_DETAILS_URL = 'functions/getSiteById';

const TRAITS = {
  NO_LOAD: 0,
  NON_DIMMABLE: 9,
  DIMMABLE: 11,
};

const logger = Logger.getLogger('plejd-api');

class PlejdApi {
  /** @private @type {import('types/Configuration').Options} */
  config;

  /** @private @type {import('DeviceRegistry')} */
  deviceRegistry;

  /** @private @type {string} */
  sessionToken;

  /** @private @type {string} */
  siteId;

  /** @private @type {import('types/ApiSite').ApiSite} */
  siteDetails;

  /**
   * @param {import("./DeviceRegistry")} deviceRegistry
   */
  constructor(deviceRegistry) {
    this.config = Configuration.getOptions();
    this.deviceRegistry = deviceRegistry;
  }

  async init() {
    logger.info('init()');
    const cache = await this.getCachedCopy();
    const cacheExists = cache && cache.siteId && cache.siteDetails && cache.sessionToken;

    logger.debug(`Prefer cache? ${this.config.preferCachedApiResponse}`);
    logger.debug(`Cache exists? ${cacheExists ? `Yes, created ${cache.dtCache}` : 'No'}`);

    if (this.config.preferCachedApiResponse && cacheExists) {
      logger.info(
        `Cache preferred. Skipping api requests and setting api data to response from ${cache.dtCache}`,
      );
      logger.silly(`Cached response: ${JSON.stringify(cache, null, 2)}`);
      this.siteId = cache.siteId;
      this.siteDetails = cache.siteDetails;
      this.sessionToken = cache.sessionToken;
    } else {
      try {
        await this.login();
        await this.getSites();
        await this.getSiteDetails();
        this.saveCachedCopy();
      } catch (err) {
        if (cacheExists) {
          logger.warn('Failed to get api response, using cached copy instead');
          this.siteId = cache.siteId;
          this.siteDetails = cache.siteDetails;
          this.sessionToken = cache.sessionToken;
        } else {
          logger.error('Api request failed, no cached fallback available', err);
          throw err;
        }
      }
    }

    this.deviceRegistry.setApiSite(this.siteDetails);
    this.getDevices();
  }

  /** @returns {Promise<import('types/ApiSite').CachedSite>} */
  // eslint-disable-next-line class-methods-use-this
  async getCachedCopy() {
    logger.info('Getting cached api response from disk');

    try {
      const rawData = await fs.promises.readFile('/data/cachedApiResponse.json');
      const cachedCopy = JSON.parse(rawData.toString());

      return cachedCopy;
    } catch (err) {
      logger.warn('No cached api response could be read. This is normal on the first run', err);
      return null;
    }
  }

  async saveCachedCopy() {
    logger.info('Saving cached copy');
    try {
      /** @type {import('types/ApiSite').CachedSite} */
      const cachedSite = {
        siteId: this.siteId,
        siteDetails: this.siteDetails,
        sessionToken: this.sessionToken,
        dtCache: new Date().toISOString(),
      };
      const rawData = JSON.stringify(cachedSite);
      await fs.promises.writeFile('/data/cachedApiResponse.json', rawData);
    } catch (err) {
      logger.error('Failed to save cache of api response', err);
    }
  }

  async login() {
    logger.info('login()');
    logger.info(`logging into ${this.config.site}`);

    logger.debug(`sending POST to ${API_BASE_URL}${API_LOGIN_URL}`);

    try {
      const response = await this._getAxiosInstance().post(API_LOGIN_URL, {
        username: this.config.username,
        password: this.config.password,
      });

      logger.info('got session token response');
      this.sessionToken = response.data.sessionToken;

      if (!this.sessionToken) {
        logger.error('No session token received');
        throw new Error('API: No session token received.');
      }
    } catch (error) {
      if (error.response.status === 400) {
        logger.error('Server returned status 400. probably invalid credentials, please verify.');
      } else if (error.response.status === 403) {
        logger.error(
          'Server returned status 403, forbidden. Plejd service does this sometimes, despite correct credentials. Possibly throttling logins. Waiting a long time often fixes this.',
        );
      } else {
        logger.error('Unable to retrieve session token response: ', error);
      }
      logger.verbose(`Error details: ${JSON.stringify(error.response, null, 2)}`);

      throw new Error(`API: Unable to retrieve session token response: ${error}`);
    }
  }

  async getSites() {
    logger.info('Get all Plejd sites for account...');

    logger.debug(`sending POST to ${API_BASE_URL}${API_SITE_LIST_URL}`);

    try {
      const response = await this._getAxiosInstance().post(API_SITE_LIST_URL);

      const sites = response.data.result;
      logger.info(
        `Got site list response with ${sites.length}: ${sites.map((s) => s.site.title).join(', ')}`,
      );
      logger.silly('All sites found:');
      logger.silly(JSON.stringify(sites, null, 2));

      const site = sites.find((x) => x.site.title === this.config.site);

      if (!site) {
        logger.error(`Failed to find a site named ${this.config.site}`);
        throw new Error(`API: Failed to find a site named ${this.config.site}`);
      }

      logger.info(`Site found matching configuration name ${this.config.site}`);
      logger.silly(JSON.stringify(site, null, 2));
      this.siteId = site.site.siteId;
    } catch (error) {
      logger.error('error: unable to retrieve list of sites. error: ', error);
      throw new Error(`API: unable to retrieve list of sites. error: ${error}`);
    }
  }

  async getSiteDetails() {
    logger.info(`Get site details for ${this.siteId}...`);

    logger.debug(`sending POST to ${API_BASE_URL}${API_SITE_DETAILS_URL}`);

    try {
      const response = await this._getAxiosInstance().post(API_SITE_DETAILS_URL, {
        siteId: this.siteId,
      });

      logger.info('got site details response');

      if (response.data.result.length === 0) {
        logger.error(`No site with ID ${this.siteId} was found.`);
        throw new Error(`API: No site with ID ${this.siteId} was found.`);
      }

      this.siteDetails = response.data.result[0];

      logger.info(`Site details for site id ${this.siteId} found`);
      logger.silly(JSON.stringify(this.siteDetails, null, 2));

      if (!this.siteDetails.plejdMesh.cryptoKey) {
        throw new Error('API: No crypto key set for site');
      }
    } catch (error) {
      logger.error(`Unable to retrieve site details for ${this.siteId}. error: `, error);
      throw new Error(`API: Unable to retrieve site details. error: ${error}`);
    }
  }

  getDevices() {
    logger.info('Getting devices from site details response...');

    if (this.siteDetails.gateways && this.siteDetails.gateways.length) {
      this.siteDetails.gateways.forEach((gwy) => {
        logger.info(`Plejd gateway '${gwy.title}' found on site`);
      });
    } else {
      logger.info('No Plejd gateway found on site');
    }

    this._getPlejdDevices();
    this._getRoomDevices();
    this._getSceneDevices();
  }

  _getAxiosInstance() {
    const headers = {
      'X-Parse-Application-Id': API_APP_ID,
      'Content-Type': 'application/json',
    };

    if (this.sessionToken) {
      headers['X-Parse-Session-Token'] = this.sessionToken;
    }

    return axios.create({
      baseURL: API_BASE_URL,
      headers,
    });
  }

  // eslint-disable-next-line class-methods-use-this
  _getDeviceType(plejdDevice) {
    // Type name is also sometimes available in device.hardware.name
    // (maybe only when GWY-01 is present?)

    switch (parseInt(plejdDevice.hardwareId, 10)) {
      case 1:
        return {
          name: 'DIM-01',
          description: '1-channel dimmer LED, 300 VA',
          type: 'light',
          dimmable: true,
          broadcastClicks: false,
        };
      case 2:
        return {
          name: 'DIM-02',
          description: '2-channel dimmer LED, 2*100 VA',
          type: 'light',
          dimmable: true,
          broadcastClicks: false,
        };
      case 3:
        return {
          name: 'CTR-01',
          description: '1-channel relay with 0-10V output, 3500 VA',
          type: 'light',
          dimmable: false,
          broadcastClicks: false,
        };
      // Gateway doesn't show up in devices list in API response
      // case 4:
      //   return {
      //     name: 'GWY-01',
      //     description: 'Gateway to enable control via internet and integrations',
      //     type: 'sensor',
      //     dimmable: false,
      //     broadcastClicks: false,
      //   };
      case 5:
        return {
          name: 'LED-10',
          description: '1-channel LED dimmer/driver, 10 W',
          type: 'light',
          dimmable: true,
          broadcastClicks: false,
        };
      case 6:
        return {
          name: 'WPH-01',
          description:
            'Wireless push button, 4 buttons. 2 channels, on and off buttons for each channel',
          type: 'device_automation',
          dimmable: false,
          broadcastClicks: true,
        };
      case 7:
        // Unknown, pre-release (?) version, kept for backwards compatibility. See https://github.com/icanos/hassio-plejd/issues/250
        return {
          name: 'REL-01',
          description: '1 channel relay, 3500 VA',
          type: 'switch',
          dimmable: false,
          broadcastClicks: false,
        };
      case 8:
        return {
          name: 'SPR-01',
          description: 'Smart plug on/off with relay, 3500 VA',
          type: 'switch',
          dimmable: false,
          broadcastClicks: false,
        };
      case 10:
        return {
          name: 'WRT-01',
          description: 'Wireless rotary button',
          type: 'device_automation',
          dimmable: false,
          broadcastClicks: true,
        };
      case 11:
        return {
          name: 'DIM-01-2P',
          description: '1-channel dimmer LED with 2-pole breaking, 300 VA',
          type: 'light',
          dimmable: true,
          broadcastClicks: false,
        };
      case 12:
        return {
          name: 'DAL-01',
          description: 'Dali broadcast with dimmer and tuneable white support',
          type: 'light',
          dimmable: true,
          broadcastClicks: false,
        };
      case 14:
        return {
          name: 'DIM-01',
          description: '1-channel dimmer LED, 300 VA ("LC" hardware/chip version)',
          type: 'light',
          dimmable: true,
          broadcastClicks: false,
        };
      case 15:
        return {
          name: 'DIM-02',
          description: '2-channel dimmer LED, 2*100 VA ("LC" hardware/chip version)',
          type: 'light',
          dimmable: true,
          broadcastClicks: false,
        };
      case 17:
        return {
          name: 'REL-01-2P',
          description: '1-channel relay with 2-pole 3500 VA',
          type: 'switch',
          dimmable: false,
          broadcastClicks: false,
        };
      case 18:
        return {
          name: 'REL-02',
          description: '2-channel relay with combined 3500 VA',
          type: 'switch',
          dimmable: false,
          broadcastClicks: false,
        };
      case 20:
        return {
          // Unknown, pre-release (?) version, kept for backwards compatibility. See https://github.com/icanos/hassio-plejd/issues/250
          name: 'SPR-01',
          description: 'Smart plug on/off with relay, 3500 VA',
          type: 'device_automation',
          dimmable: false,
          broadcastClicks: false,
        };
      case 36:
        return {
          name: 'LED-75',
          description: '1-channel LED dimmer/driver with tuneable white, 10 W',
          type: 'light',
          dimmable: true,
          broadcastClicks: false,
        };
      case 167:
        return {
          name: 'DWN-01',
          description: 'Smart tunable downlight with a built-in dimmer function, 8W',
          type: 'light',
          dimmable: true,
          broadcastClicks: false,
        };
      // PLEASE CREATE AN ISSUE WITH THE HARDWARE ID if you own one of these devices!
      // case
      //   return {
      //     name: 'DWN-02',
      //     description: 'Smart tunable downlight with a built-in dimmer function, 8W',
      //     type: 'light',
      //     dimmable: true,
      //     broadcastClicks: false,
      //   };
      // case
      //   return {
      //     name: 'OUT-01',
      //     description: 'Outdoor wall light with built-in LED, 2x5W',
      //     type: 'light',
      //     dimmable: true,
      //     broadcastClicks: false,
      //   };
      default:
        throw new Error(
          `Unknown device type with hardware id ${plejdDevice.hardwareId}. --- PLEASE POST THIS AND THE NEXT LOG ROWS to https://github.com/icanos/hassio-plejd/issues/ --- `,
        );
    }
  }

  /**
   * Plejd API properties parsed
   *
   * * `devices` - physical Plejd devices, duplicated for devices with multiple outputs
   *   devices: [{deviceId, title, objectId, ...}, {...}]
   * * `deviceAddress` - BLE address of each physical device
   *   deviceAddress: {[deviceId]: bleDeviceAddress}
   * * `outputSettings` - lots of info about load settings, also links devices to output index
   *   outputSettings: [{deviceId, output, deviceParseId, ...}]  //deviceParseId === objectId above
   * * `outputAddress`: BLE address of [0] main output and [n] other output (loads)
   *   outputAddress: {[deviceId]: {[output]: bleDeviceAddress}}
   * * `inputSettings` - detailed settings for inputs (buttons, RTR-01, ...), scenes triggered, ...
   *   inputSettings: [{deviceId, input, ...}]  //deviceParseId === objectId above
   * * `inputAddress` - Links inputs to what BLE device they control, or 255 for unassigned/scene
   *   inputAddress: {[deviceId]: {[input]: bleDeviceAddress}}
   */
  _getPlejdDevices() {
    this.deviceRegistry.clearPlejdDevices();

    this.siteDetails.devices.forEach((device) => {
      this.deviceRegistry.addPhysicalDevice(device);

      const outputSettings = this.siteDetails.outputSettings.find(
        (x) => x.deviceParseId === device.objectId,
      );

      if (!outputSettings) {
        logger.verbose(
          `No outputSettings found for ${device.title} (${device.deviceId}), assuming output 0`,
        );
      }
      const deviceOutput = outputSettings ? outputSettings.output : 0;
      const outputAddress = this.siteDetails.outputAddress[device.deviceId];

      if (outputAddress) {
        const bleOutputAddress = outputAddress[deviceOutput];

        if (device.traits === TRAITS.NO_LOAD) {
          logger.warn(
            `Device ${device.title} (${device.deviceId}) has no load configured and will be excluded`,
          );
        } else {
          const uniqueOutputId = this.deviceRegistry.getUniqueOutputId(
            device.deviceId,
            deviceOutput,
          );

          const plejdDevice = this.siteDetails.plejdDevices.find(
            (x) => x.deviceId === device.deviceId,
          );

          const dimmable = device.traits === TRAITS.DIMMABLE;
          // dimmable = settings.dimCurve !== 'NonDimmable';

          try {
            const decodedDeviceType = this._getDeviceType(plejdDevice);

            let loadType = decodedDeviceType.type;
            if (device.outputType === 'RELAY') {
              loadType = 'switch';
            } else if (device.outputType === 'LIGHT') {
              loadType = 'light';
            }

            const room = this.siteDetails.rooms.find((x) => x.roomId === device.roomId);
            const roomTitle = room ? room.title : undefined;

            /** @type {import('types/DeviceRegistry').OutputDevice} */
            const outputDevice = {
              bleOutputAddress,
              deviceId: device.deviceId,
              dimmable,
              name: device.title,
              output: deviceOutput,
              roomId: device.roomId,
              roomName: roomTitle,
              state: undefined,
              type: loadType,
              typeDescription: decodedDeviceType.description,
              typeName: decodedDeviceType.name,
              version: plejdDevice.firmware.version,
              uniqueId: uniqueOutputId,
            };

            this.deviceRegistry.addOutputDevice(outputDevice);
          } catch (error) {
            logger.error(`Error trying to create output device: ${error}`);
            logger.warn(
              `device (from API response) when error happened: ${JSON.stringify(device, null, 2)}`,
            );
            logger.warn(
              `plejdDevice (from API response) when error happened: ${JSON.stringify(
                plejdDevice,
                null,
                2,
              )}`,
            );
          }
        }
      } else {
        // The device does not have an output. It can be assumed to be a WPH-01 or a WRT-01
        // Filter inputSettings for available buttons
        const inputSettings = this.siteDetails.inputSettings.filter(
          (x) => x.deviceId === device.deviceId,
        );

        // For each found button, register the device as an inputDevice
        inputSettings.forEach((input) => {
          const bleInputAddress = this.siteDetails.deviceAddress[input.deviceId];
          logger.verbose(
            `Found input device (${input.deviceId}), with input ${input.input} having BLE address (${bleInputAddress})`,
          );

          const plejdDevice = this.siteDetails.plejdDevices.find(
            (x) => x.deviceId === device.deviceId,
          );

          const uniqueInputId = this.deviceRegistry.getUniqueInputId(device.deviceId, input.input);

          try {
            const decodedDeviceType = this._getDeviceType(plejdDevice);

            if (decodedDeviceType.broadcastClicks) {
              /** @type {import('types/DeviceRegistry').InputDevice} */
              const inputDevice = {
                bleInputAddress,
                deviceId: device.deviceId,
                name: device.title,
                input: input.input,
                roomId: device.roomId,
                type: decodedDeviceType.type,
                typeDescription: decodedDeviceType.description,
                typeName: decodedDeviceType.name,
                version: plejdDevice.firmware.version,
                uniqueId: uniqueInputId,
              };
              this.deviceRegistry.addInputDevice(inputDevice);
            }
          } catch (error) {
            logger.error(`Error trying to create input device: ${error}`);
            logger.warn(
              `device (from API response) when error happened: ${JSON.stringify(device, null, 2)}`,
            );
            logger.warn(
              `plejdDevice (from API response) when error happened: ${JSON.stringify(
                plejdDevice,
                null,
                2,
              )}`,
            );
          }
        });
      }
    });
  }

  _getRoomDevices() {
    if (this.config.includeRoomsAsLights) {
      logger.debug('includeRoomsAsLights is set to true, adding rooms too.');
      this.siteDetails.rooms.forEach((room) => {
        const { roomId } = room;
        const roomAddress = this.siteDetails.roomAddress[roomId];

        const deviceIdsByRoom = this.deviceRegistry.getOutputDeviceIdsByRoomId(roomId);

        const dimmable =
          deviceIdsByRoom &&
          deviceIdsByRoom.some(
            (deviceId) => this.deviceRegistry.getOutputDevice(deviceId).dimmable,
          );

        /** @type {import('types/DeviceRegistry').OutputDevice} */
        const newDevice = {
          bleOutputAddress: roomAddress,
          deviceId: null,
          dimmable,
          name: room.title,
          output: undefined,
          roomId: undefined,
          roomName: undefined,
          state: undefined,
          type: 'light',
          typeDescription: 'A Plejd room',
          typeName: 'Room',
          uniqueId: roomId,
          version: undefined,
        };

        this.deviceRegistry.addOutputDevice(newDevice);
      });
      logger.debug('includeRoomsAsLights done.');
    }
  }

  _getSceneDevices() {
    this.deviceRegistry.clearSceneDevices();
    // add scenes as switches
    const scenes = [...this.siteDetails.scenes];

    scenes.forEach((scene) => {
      const sceneNum = this.siteDetails.sceneIndex[scene.sceneId];
      /** @type {import('types/DeviceRegistry').OutputDevice} */
      const newScene = {
        bleOutputAddress: sceneNum,
        deviceId: undefined,
        dimmable: false,
        name: scene.title,
        output: undefined,
        roomId: undefined,
        roomName: undefined,
        state: false,
        type: 'scene',
        typeDescription: 'A Plejd scene',
        typeName: 'Scene',
        version: undefined,
        uniqueId: scene.sceneId,
      };

      this.deviceRegistry.addScene(newScene);
    });
  }
}

module.exports = PlejdApi;

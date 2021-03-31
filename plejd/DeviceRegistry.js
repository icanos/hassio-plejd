const Logger = require('./Logger');

const logger = Logger.getLogger('device-registry');
class DeviceRegistry {
  /** @type {string} */
  cryptoKey = null;

  /** @private @type {Object.<string, import('types/ApiSite').Device>} */
  devices = {};
  /** @private */
  outputDeviceUniqueIdsByRoomId = {};
  /** @private */
  outputUniqueIdByBleOutputAddress = {};

  /** @private @type {import('./types/ApiSite').ApiSite} */
  apiSite;

  // Dictionaries of [id]: device per type
  /** @private @type {import('types/DeviceRegistry').OutputDevices} */
  outputDevices = {};
  /** @private @type {import('types/DeviceRegistry').OutputDevices} */
  sceneDevices = {};

  /** @param device {import('./types/ApiSite').Device} */
  addPhysicalDevice(device) {
    this.devices[device.deviceId] = device;
  }

  /** @param outputDevice {import('types/DeviceRegistry').OutputDevice} */
  addOutputDevice(outputDevice) {
    this.outputDevices = {
      ...this.outputDevices,
      [outputDevice.uniqueId]: outputDevice,
    };

    logger.verbose(
      `Added/updated output device: ${JSON.stringify(outputDevice)}. ${
        Object.keys(this.outputDevices).length
      } output devices in total.`,
    );

    this.outputUniqueIdByBleOutputAddress[outputDevice.bleOutputAddress] = outputDevice.uniqueId;

    if (!this.outputDeviceUniqueIdsByRoomId[outputDevice.roomId]) {
      this.outputDeviceUniqueIdsByRoomId[outputDevice.roomId] = [];
    }
    if (
      outputDevice.roomId !== outputDevice.uniqueId &&
      !this.outputDeviceUniqueIdsByRoomId[outputDevice.roomId].includes(outputDevice.uniqueId)
    ) {
      this.outputDeviceUniqueIdsByRoomId[outputDevice.roomId].push(outputDevice.uniqueId);
      logger.verbose(
        `Added device to room ${outputDevice.roomId}: ${JSON.stringify(
          this.outputDeviceUniqueIdsByRoomId[outputDevice.roomId],
        )}`,
      );
    }

    if (outputDevice.hiddenFromIntegrations || outputDevice.hiddenFromRoomList) {
      logger.verbose(`Device is hidden and should possibly not be included. 
          Hidden from room list: ${outputDevice.hiddenFromRoomList}
          Hidden from integrations: ${outputDevice.hiddenFromIntegrations}`);
    }
  }

  /** @param scene {import('types/DeviceRegistry').OutputDevice} */
  addScene(scene) {
    this.sceneDevices = {
      ...this.sceneDevices,
      [scene.uniqueId]: scene,
    };
    logger.verbose(
      `Added/updated scene: ${JSON.stringify(scene)}. ${
        Object.keys(this.sceneDevices).length
      } scenes in total.`,
    );
  }

  clearPlejdDevices() {
    this.devices = {};
    this.outputDevices = {};
    this.outputDeviceUniqueIdsByRoomId = {};
    this.outputUniqueIdByBleOutputAddress = {};
  }

  clearSceneDevices() {
    this.sceneDevices = {};
  }

  /**
   * @returns {import('./types/DeviceRegistry').OutputDevice[]}
   */
  getAllOutputDevices() {
    return Object.values(this.outputDevices);
  }

  /**
   * @returns {import('./types/DeviceRegistry').OutputDevice[]}
   */
  getAllSceneDevices() {
    return Object.values(this.sceneDevices);
  }

  /** @returns {import('./types/ApiSite').ApiSite} */
  getApiSite() {
    return this.apiSite;
  }

  /**
   * @param {string} uniqueOutputId
   */
  getOutputDevice(uniqueOutputId) {
    return this.outputDevices[uniqueOutputId];
  }

  /** @returns {import('./types/DeviceRegistry').OutputDevice} */
  getOutputDeviceByBleOutputAddress(bleOutputAddress) {
    return this.outputDevices[this.outputUniqueIdByBleOutputAddress[bleOutputAddress]];
  }

  /** @returns {string[]} */
  getOutputDeviceIdsByRoomId(roomId) {
    return this.outputDeviceUniqueIdsByRoomId[roomId];
  }

  getOutputDeviceName(uniqueOutputId) {
    return (this.outputDevices[uniqueOutputId] || {}).name;
  }

  /**
   * @param {string } deviceId The physical device serial number
   * @return {import('./types/ApiSite').Device}
   */
  getPhysicalDevice(deviceId) {
    return this.devices[deviceId];
  }

  getScene(sceneId) {
    return this.sceneDevices[sceneId];
  }

  getSceneName(sceneId) {
    return (this.sceneDevices[sceneId] || {}).name;
  }

  // eslint-disable-next-line class-methods-use-this
  getUniqueOutputId(deviceId, outputIndex) {
    return `${deviceId}_${outputIndex}`;
  }

  /** @param apiSite {import('./types/ApiSite').ApiSite} */
  setApiSite(apiSite) {
    this.apiSite = apiSite;
    this.cryptoKey = apiSite.plejdMesh.cryptoKey;
  }

  /**
   * @param {string} uniqueOutputId
   * @param {boolean} state
   * @param {number?} [dim]
   */
  setOutputState(uniqueOutputId, state, dim) {
    const device = this.getOutputDevice(uniqueOutputId);
    if (!device) {
      logger.warn(
        `Trying to set state for ${uniqueOutputId} which is not in the list of known outputs.`,
      );
      return;
    }

    device.state = state;
    if (dim && device.dimmable) {
      device.dim = dim;
    }
    if (Logger.shouldLog('silly')) {
      logger.silly(`Updated state: ${JSON.stringify(device)}`);
    }
  }
}

module.exports = DeviceRegistry;

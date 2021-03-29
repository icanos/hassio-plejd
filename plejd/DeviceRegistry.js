const Logger = require('./Logger');

const logger = Logger.getLogger('device-registry');
class DeviceRegistry {
  /** @type {string} */
  cryptoKey = null;

  outputDeviceIdByRoomId = {};
  outputDeviceIdByBLEIndex = {};

  // Dictionaries of [id]: device per type
  /** @type {import('types/DeviceRegistry').OutputDevices} */
  outputDevices = {};
  /** @type {import('types/DeviceRegistry').OutputDevices} */
  sceneDevices = {};

  // eslint-disable-next-line class-methods-use-this
  getUniqueOutputId(deviceId, outputIndex) {
    return `${deviceId}_${outputIndex}`;
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

    this.outputDeviceIdByBLEIndex[outputDevice.bleDeviceIndex] = outputDevice.uniqueId;

    if (!this.outputDeviceIdByRoomId[outputDevice.roomId]) {
      this.outputDeviceIdByRoomId[outputDevice.roomId] = [];
    }
    if (
      outputDevice.roomId !== outputDevice.uniqueId
      && !this.outputDeviceIdByRoomId[outputDevice.roomId].includes(outputDevice.roomId)
    ) {
      this.outputDeviceIdByRoomId[outputDevice.roomId].push(outputDevice.roomId);
      logger.verbose(
        `Added device to room ${outputDevice.roomId}: ${JSON.stringify(
          this.outputDeviceIdByRoomId[outputDevice.roomId],
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
    this.outputDevices = {};
    this.outputDeviceIdByRoomId = {};
    this.deviceIdsBySerial = {};
  }

  clearSceneDevices() {
    this.sceneDevices = {};
  }

  getOutputDevice(uniqueOutputId) {
    return this.outputDevices[uniqueOutputId];
  }

  /** @returns {string[]} */
  getOutputDeviceIdsByRoomId(roomId) {
    return this.outputDeviceIdByRoomId[roomId];
  }

  getOutputDeviceName(uniqueOutputId) {
    return (this.outputDevices[uniqueOutputId] || {}).name;
  }

  getScene(sceneId) {
    return this.sceneDevices[sceneId];
  }

  getSceneName(sceneId) {
    return (this.sceneDevices[sceneId] || {}).name;
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

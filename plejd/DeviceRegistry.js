const Logger = require('./Logger');

const logger = Logger.getLogger('device-registry');
class DeviceRegistry {
  /** @type {string} */
  cryptoKey = null;

  /** @private @type {Object.<string, import('types/ApiSite').Device>} */
  devices = {};
  /** @private @type {Object.<string, string[]>} */
  outputDeviceUniqueIdsByRoomId = {};
  /** @private @type {Object.<number, string>} */
  outputUniqueIdByBleOutputAddress = {};
  /** @private @type {Object.<number, string>} */
  sceneUniqueIdByBleOutputAddress = {};

  /** @private @type {import('./types/ApiSite').ApiSite} */
  apiSite;

  // Dictionaries of [id]: device per type
  /** @private @type {import('types/DeviceRegistry').OutputDevices} */
  outputDevices = {};
  /** @private @type {import('types/DeviceRegistry').OutputDevices} */
  sceneDevices = {};
  /** @private @type {import('types/DeviceRegistry').InputDevices} */
  inputDevices = {};

  /** @param device {import('./types/ApiSite').Device} */
  addPhysicalDevice(device) {
    this.devices[device.deviceId] = device;
  }

  /** @param inputDevice {import('types/DeviceRegistry').InputDevice} */
  addInputDevice(inputDevice) {
    this.inputDevices = {
      ...this.inputDevices,
      [inputDevice.uniqueId]: inputDevice,
    };

    logger.verbose(
      `Added/updated input device: ${JSON.stringify(inputDevice)}. ${
        Object.keys(this.inputDevices).length
      } output devices in total.`,
    );
    this.outputUniqueIdByBleOutputAddress[
      this.getUniqueBLEId(inputDevice.bleInputAddress, inputDevice.input)
    ] = inputDevice.uniqueId;
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
  }

  /** @param scene {import('types/DeviceRegistry').OutputDevice} */
  addScene(scene) {
    this.sceneDevices = {
      ...this.sceneDevices,
      [scene.uniqueId]: scene,
    };
    this.sceneUniqueIdByBleOutputAddress[scene.bleOutputAddress] = scene.uniqueId;

    logger.verbose(
      `Added/updated scene: ${JSON.stringify(scene)}. ${
        Object.keys(this.sceneDevices).length
      } scenes in total.`,
    );
  }

  clearPlejdDevices() {
    this.devices = {};
    this.outputDevices = {};
    this.inputDevices = {};
    this.outputDeviceUniqueIdsByRoomId = {};
    this.outputUniqueIdByBleOutputAddress = {};
  }

  clearSceneDevices() {
    this.sceneDevices = {};
    this.sceneUniqueIdByBleOutputAddress = {};
  }

  /**
   * @returns {import('./types/DeviceRegistry').OutputDevice[]}
   */
  getAllOutputDevices() {
    return Object.values(this.outputDevices);
  }

  /**
   * @returns {import('./types/DeviceRegistry').InputDevice[]}
   */
  getAllInputDevices() {
    return Object.values(this.inputDevices);
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

  /**
   * @param {string} uniqueInputId
   */
  getInputDevice(uniqueInputId) {
    return this.inputDevices[uniqueInputId];
  }

  /** @returns {import('./types/DeviceRegistry').OutputDevice} */
  getOutputDeviceByBleOutputAddress(bleOutputAddress) {
    return this.outputDevices[this.outputUniqueIdByBleOutputAddress[bleOutputAddress]];
  }

  /** @returns {import('./types/DeviceRegistry').InputDevice} */
  getInputDeviceByBleInputAddress(bleInputAddress, inputButton) {
    return this.inputDevices[
      this.outputUniqueIdByBleOutputAddress[this.getUniqueBLEId(bleInputAddress, inputButton)]
    ];
  }

  /** @returns {string[]} */
  getOutputDeviceIdsByRoomId(roomId) {
    return this.outputDeviceUniqueIdsByRoomId[roomId];
  }

  getOutputDeviceName(uniqueOutputId) {
    return (this.outputDevices[uniqueOutputId] || {}).name;
  }

  getInputDeviceName(uniqueInputId) {
    return (this.inputDevices[uniqueInputId] || {}).name;
  }

  /**
   * @param {string } deviceId The physical device serial number
   * @return {import('./types/ApiSite').Device}
   */
  getPhysicalDevice(deviceId) {
    return this.devices[deviceId];
  }

  /**
   * @param {string} sceneUniqueId
   */
  getScene(sceneUniqueId) {
    return this.sceneDevices[sceneUniqueId];
  }

  /**
   * @param {number} sceneBleAddress
   */
  getSceneByBleAddress(sceneBleAddress) {
    const sceneUniqueId = this.sceneUniqueIdByBleOutputAddress[sceneBleAddress];
    if (!sceneUniqueId) {
      return null;
    }
    return this.sceneDevices[sceneUniqueId];
  }

  /**
   * @param {string} sceneUniqueId
   */
  getSceneName(sceneUniqueId) {
    return (this.sceneDevices[sceneUniqueId] || {}).name;
  }

  // eslint-disable-next-line class-methods-use-this
  getUniqueOutputId(deviceId, outputIndex) {
    return `${deviceId}_${outputIndex}`;
  }

  // eslint-disable-next-line class-methods-use-this
  getUniqueInputId(deviceId, inputIndex) {
    return `${deviceId}_I_${inputIndex}`;
  }

  // eslint-disable-next-line class-methods-use-this
  getUniqueBLEId(bleAdress, inputIndex) {
    return `${bleAdress}_${inputIndex}`;
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

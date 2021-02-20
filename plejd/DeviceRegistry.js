const Logger = require('./Logger');

const logger = Logger.getLogger('device-registry');
class DeviceRegistry {
  apiSite;
  cryptoKey = null;

  deviceIdsByRoom = {};
  deviceIdsBySerial = {};

  // Dictionaries of [id]: device per type
  plejdDevices = {};
  roomDevices = {};
  sceneDevices = {};

  get allDevices() {
    return [
      ...Object.values(this.plejdDevices),
      ...Object.values(this.roomDevices),
      ...Object.values(this.sceneDevices),
    ];
  }

  addPlejdDevice(device) {
    const added = {
      ...this.plejdDevices[device.id],
      ...device,
    };

    this.plejdDevices = {
      ...this.plejdDevices,
      [added.id]: added,
    };

    this.deviceIdsBySerial[added.serialNumber] = added.id;

    logger.verbose(`Added/updated device: ${JSON.stringify(added)}`);

    if (added.roomId) {
      this.deviceIdsByRoom[added.roomId] = [
        ...(this.deviceIdsByRoom[added.roomId] || []),
        added.id,
      ];
      logger.verbose(`Added to room: ${JSON.stringify(this.deviceIdsByRoom[added.roomId])}`);
    }

    return added;
  }

  addRoomDevice(device) {
    const added = {
      ...this.roomDevices[device.id],
      ...device,
    };
    this.roomDevices = {
      ...this.roomDevices,
      [device.id]: added,
    };

    logger.verbose(`Added/updated room device: ${JSON.stringify(added)}`);
    return added;
  }

  addScene(scene) {
    const added = {
      ...this.sceneDevices[scene.id],
      ...scene,
    };
    this.sceneDevices = {
      ...this.sceneDevices,
      added,
    };
    logger.verbose(`Added/updated scene: ${JSON.stringify(added)}`);
    return added;
  }

  clearPlejdDevices() {
    this.plejdDevices = {};
    this.deviceIdsByRoom = {};
    this.deviceIdsBySerial = {};
  }

  clearRoomDevices() {
    this.roomDevices = {};
  }

  clearSceneDevices() {
    this.sceneDevices = {};
  }

  getDevice(deviceId) {
    return this.plejdDevices[deviceId] || this.roomDevices[deviceId];
  }

  getDeviceIdsByRoom(roomId) {
    return this.deviceIdsByRoom[roomId];
  }

  getDeviceBySerialNumber(serialNumber) {
    return this.getDevice(this.deviceIdsBySerial[serialNumber]);
  }

  getDeviceName(deviceId) {
    return (this.plejdDevices[deviceId] || {}).name;
  }

  getScene(sceneId) {
    return this.sceneDevices[sceneId];
  }

  getSceneName(sceneId) {
    return (this.sceneDevices[sceneId] || {}).name;
  }

  getState(deviceId) {
    const device = this.getDevice(deviceId) || {};
    if (device.dimmable) {
      return {
        state: device.state,
        dim: device.dim,
      };
    }
    return {
      state: device.state,
    };
  }

  setApiSite(siteDetails) {
    this.apiSite = siteDetails;
  }

  setState(deviceId, state, dim) {
    const device = this.addPlejdDevice({ id: deviceId, state });
    if (dim && device.dimmable) {
      device.dim = dim;
    }
    if (Logger.shouldLog('silly')) {
      logger.silly(`Updated state: ${JSON.stringify(device)}`);
    }
  }
}

module.exports = DeviceRegistry;

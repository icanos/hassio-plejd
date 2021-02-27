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
    this.plejdDevices[device.id] = device;
    this.deviceIdsBySerial[device.serialNumber] = device.id;
    if (!this.deviceIdsByRoom[device.roomId]) {
      this.deviceIdsByRoom[device.roomId] = [];
    }
    this.deviceIdsByRoom[device.roomId].push(device.id);
  }

  addScene(scene) {
    this.sceneDevices[scene.id] = scene;
  }

  setApiSite(siteDetails) {
    this.apiSite = siteDetails;
  }

  clearPlejdDevices() {
    this.plejdDevices = {};
    this.deviceIdsByRoom = {};
    this.deviceIdsBySerial = {};
  }

  addRoomDevice(device) {
    this.roomDevices[device.id] = device;
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
    return this.plejdDevices[this.deviceIdsBySerial[serialNumber]];
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
}

module.exports = DeviceRegistry;

const Logger = require('./Logger');
const Scene = require('./Scene');

const logger = Logger.getLogger('scene-manager');
class SceneManager {
  /** @private @type {import('./DeviceRegistry')} */
  deviceRegistry;
  /** @private @type {import('./PlejdDeviceCommunication')} */
  plejdDeviceCommunication;
  /** @private @type {Object.<string,Scene>} */
  scenes;

  constructor(deviceRegistry, plejdDeviceCommunication) {
    this.deviceRegistry = deviceRegistry;
    this.plejdDeviceCommunication = plejdDeviceCommunication;
    this.scenes = {};
  }

  init() {
    const scenes = [...this.deviceRegistry.getApiSite().scenes];

    this.scenes = {};
    scenes.forEach((scene) => {
      const sceneBleAddress = this.deviceRegistry.getApiSite().sceneIndex[scene.sceneId];
      this.scenes[scene.sceneId] = new Scene(this.deviceRegistry, sceneBleAddress, scene);
    });
  }

  /**
   * @param {string} sceneUniqueId
   */
  executeScene(sceneUniqueId) {
    const scene = this.scenes[sceneUniqueId];
    if (!scene) {
      logger.info(`Scene with id ${sceneUniqueId} not found`);
      logger.verbose(`Scenes: ${JSON.stringify(this.scenes, null, 2)}`);
      return;
    }

    scene.steps.forEach((step) => {
      const uniqueId = this.deviceRegistry.getUniqueOutputId(step.deviceId, step.output);
      const device = this.deviceRegistry.getOutputDevice(uniqueId);
      if (device) {
        if (device.dimmable && step.state) {
          this.plejdDeviceCommunication.turnOn(uniqueId, { brightness: step.brightness });
        } else if (!device.dimmable && step.state) {
          this.plejdDeviceCommunication.turnOn(uniqueId, {});
        } else if (!step.state) {
          this.plejdDeviceCommunication.turnOff(uniqueId, {});
        }
      }
    });
  }
}

module.exports = SceneManager;

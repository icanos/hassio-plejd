const Logger = require('./Logger');
const Scene = require('./Scene');

const logger = Logger.getLogger('scene-manager');
class SceneManager {
  /** @private @type {import('./DeviceRegistry')} */
  deviceRegistry;
  /** @private @type {import('./PlejdDeviceCommunication')} */
  plejdDeviceCommunication;
  /** @private @type {Object.<number,Scene>} */
  scenes;

  constructor(deviceRegistry, plejdDeviceCommunication) {
    this.deviceRegistry = deviceRegistry;
    this.plejdDeviceCommunication = plejdDeviceCommunication;
    this.scenes = {};
  }

  init() {
    const scenes = this.deviceRegistry
      .getApiSite()
      .scenes.filter((x) => x.hiddenFromSceneList === false);

    this.scenes = {};
    scenes.forEach((scene) => {
      const idx = this.deviceRegistry.getApiSite().sceneIndex[scene.sceneId];
      this.scenes[idx] = new Scene(this.deviceRegistry, idx, scene);
    });
  }

  executeScene(sceneId) {
    const scene = this.scenes[sceneId];
    if (!scene) {
      logger.info(`Scene with id ${sceneId} not found`);
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

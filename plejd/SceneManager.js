const EventEmitter = require('events');
const Logger = require('./Logger');
const Scene = require('./Scene');

const logger = Logger.getLogger('scene-manager');
class SceneManager extends EventEmitter {
  deviceRegistry;
  plejdBle;
  scenes;

  constructor(deviceRegistry, plejdBle) {
    super();

    this.deviceRegistry = deviceRegistry;
    this.plejdBle = plejdBle;
    this.scenes = {};
  }

  init() {
    const scenes = this.deviceRegistry.apiSite.scenes.filter(
      (x) => x.hiddenFromSceneList === false,
    );

    this.scenes = {};
    scenes.forEach((scene) => {
      const idx = this.deviceRegistry.apiSite.sceneIndex[scene.sceneId];
      this.scenes[scene.id] = new Scene(idx, scene, this.deviceRegistry.apiSite.sceneSteps);
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
      const device = this.deviceRegistry.getDeviceBySerialNumber(step.deviceId);
      if (device) {
        if (device.dimmable && step.state) {
          this.plejdBle.turnOn(device.id, { brightness: step.brightness });
        } else if (!device.dimmable && step.state) {
          this.plejdBle.turnOn(device.id, {});
        } else if (!step.state) {
          this.plejdBle.turnOff(device.id, {});
        }
      }
    });
  }
}

module.exports = SceneManager;

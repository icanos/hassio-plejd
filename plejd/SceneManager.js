/* eslint-disable max-classes-per-file */
const EventEmitter = require('events');
const Scene = require('./Scene');

class SceneManager extends EventEmitter {
  constructor(site, devices) {
    super();

    this.site = site;
    this.scenes = [];
    this.devices = devices;

    this.init();
  }

  init() {
    const scenes = this.site.scenes.filter((x) => x.hiddenFromSceneList === false);
    // eslint-disable-next-line no-restricted-syntax
    for (const scene of scenes) {
      const idx = this.site.sceneIndex[scene.sceneId];
      this.scenes.push(new Scene(idx, scene, this.site.sceneSteps));
    }
  }

  executeScene(sceneIndex, ble) {
    const scene = this.scenes.find((x) => x.id === sceneIndex);
    if (!scene) {
      return;
    }

    // eslint-disable-next-line no-restricted-syntax
    for (const step of scene.steps) {
      const device = this.devices.find((x) => x.serialNumber === step.deviceId);
      if (device) {
        if (device.dimmable && step.state) {
          ble.turnOn(device.id, { brightness: step.brightness });
        } else if (!device.dimmable && step.state) {
          ble.turnOn(device.id, {});
        } else if (!step.state) {
          ble.turnOff(device.id, {});
        }
      }
    }
  }
}

module.exports = SceneManager;
/* eslint-disable */

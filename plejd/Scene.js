const SceneStep = require('./SceneStep');

class Scene {
  /**
   * @param {import('./DeviceRegistry')} deviceRegistry
   * @param {number} idx
   * @param {import("./types/ApiSite").Scene} scene
   */
  constructor(deviceRegistry, idx, scene) {
    this.id = idx;
    this.title = scene.title;
    this.sceneId = scene.sceneId;

    this.steps = deviceRegistry
      .getApiSite()
      .sceneSteps.filter((step) => step.sceneId === scene.sceneId)
      .map((step) => new SceneStep(step));
  }
}

module.exports = Scene;

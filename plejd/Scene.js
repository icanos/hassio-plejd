const SceneStep = require('./SceneStep');

class Scene {
  constructor(idx, scene, steps) {
    this.id = idx;
    this.title = scene.title;
    this.sceneId = scene.sceneId;

    const sceneSteps = steps.filter((x) => x.sceneId === scene.sceneId);
    this.steps = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const step of sceneSteps) {
      this.steps.push(new SceneStep(step));
    }
  }
}

module.exports = Scene;

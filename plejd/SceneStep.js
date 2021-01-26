class SceneStep {
  constructor(step) {
    this.sceneId = step.sceneId;
    this.deviceId = step.deviceId;
    this.state = step.state === 'On' ? 1 : 0;
    this.brightness = step.value;
  }
}

module.exports = SceneStep;

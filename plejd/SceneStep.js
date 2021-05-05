class SceneStep {
  /**
   * @param {import("./types/ApiSite").SceneStep} step
   */
  constructor(step) {
    this.sceneId = step.sceneId;
    this.deviceId = step.deviceId;
    this.output = step.output;
    this.state = step.state === 'On' ? 1 : 0;
    this.brightness = step.value;
  }
}

module.exports = SceneStep;

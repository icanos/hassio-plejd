const EventEmitter = require('events');
const _ = require('lodash');

class SceneManager extends EventEmitter {
    constructor(site, devices) {
        super();

        this.site = site;
        this.scenes = [];
        this.devices = devices;

        this.init();
    }

    init() {
        const scenes = this.site.scenes.filter(x => x.hiddenFromSceneList == false);
        for (const scene of scenes) {
            const idx = this.site.sceneIndex[scene.sceneId];
            this.scenes.push(new Scene(idx, scene, this.site.sceneSteps));
        }
    }

    executeScene(sceneIndex, ble) {
        const scene = this.scenes.find(x => x.id === sceneIndex);
        if (!scene) {
            return;
        }

        for (const step of scene.steps) {
            const device = this.devices.find(x => x.serialNumber === step.deviceId);
            if (!device) {
                continue;
            }

            if (device.dimmable && step.state) {
                ble.turnOn(device.id, { brightness: step.brightness });
            }
            else if (!device.dimmable && step.state) {
                ble.turnOn(device.id, {});
            }
            else if (!step.state) {
                ble.turnOff(device.id, {});
            }
        }
    }
}

class Scene {
    constructor(idx, scene, steps) {
        this.id = idx;
        this.title = scene.title;
        this.sceneId = scene.sceneId;

        const sceneSteps = steps.filter(x => x.sceneId === scene.sceneId);
        this.steps = [];

        for (const step of sceneSteps) {
            this.steps.push(new SceneStep(step));
        }
    }
}

class SceneStep {
    constructor(step) {
        this.sceneId = step.sceneId;
        this.deviceId = step.deviceId;
        this.state = step.state === 'On' ? 1 : 0;
        this.brightness = step.value;
    }
}

module.exports = SceneManager;
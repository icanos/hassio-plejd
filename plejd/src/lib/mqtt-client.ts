import { EventEmitter } from 'events';
import mqtt, { type MqttClient as MqttClientType } from 'mqtt';
import type { 
  AddonConfiguration, 
  OutputDevice, 
  CommandData
} from '@/types';
import { MqttState, DeviceTypeEnum } from '@/types';
import { getLogger } from '@/lib/logger';
import type { DeviceRegistry } from '@/lib/device-registry';

const logger = getLogger('mqtt-client');

export interface MqttClientEvents {
  connected: () => void;
  stateChanged: (device: OutputDevice, command: string | CommandData) => void;
}

export class MqttClient extends EventEmitter {
  private client: MqttClientType | null = null;
  private readonly topicPrefix = 'homeassistant';
  private readonly devicePrefix = 'plejd';

  constructor(
    private readonly deviceRegistry: DeviceRegistry,
    private readonly config: AddonConfiguration
  ) {
    super();
  }

  public async init(): Promise<void> {
    logger.info('Initializing MQTT connection');

    const options: mqtt.IClientOptions = {
      reconnectPeriod: 5000,
      connectTimeout: 30000
    };

    if (this.config.mqttUsername) {
      options.username = this.config.mqttUsername;
    }
    if (this.config.mqttPassword) {
      options.password = this.config.mqttPassword;
    }

    this.client = mqtt.connect(this.config.mqttBroker, options);

    this.client.on('connect', () => {
      logger.info('Connected to MQTT broker');
      this.subscribeToCommands();
      this.emit('connected');
    });

    this.client.on('error', (error) => {
      logger.error('MQTT connection error', error);
    });

    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message);
    });

    this.client.on('reconnect', () => {
      logger.info('Reconnecting to MQTT broker');
    });

    this.client.on('offline', () => {
      logger.warn('MQTT client offline');
    });
  }

  public sendDiscoveryToHomeAssistant(): void {
    logger.info('Sending device discovery to Home Assistant');

    // Send output devices
    for (const device of this.deviceRegistry.getAllOutputDevices()) {
      this.sendDeviceDiscovery(device);
    }

    // Send input devices
    for (const device of this.deviceRegistry.getAllInputDevices()) {
      this.sendInputDeviceDiscovery(device);
    }

    // Send scenes
    for (const scene of this.deviceRegistry.getAllScenes()) {
      this.sendSceneDiscovery(scene);
    }
  }

  public updateOutputState(uniqueId: string, command: CommandData): void {
    const device = this.deviceRegistry.getOutputDevice(uniqueId);
    if (!device) {
      logger.warn(`Device ${uniqueId} not found for state update`);
      return;
    }

    const stateTopic = this.getStateTopic(device);
    const payload: Record<string, unknown> = {};

    if (command.state !== undefined) {
      payload.state = command.state ? MqttState.ON : MqttState.OFF;
    }

    if (command.dim !== undefined && device.dimmable) {
      payload.brightness = Math.round((command.dim / 255) * 255);
    }

    if (command.color !== undefined && device.colorTempSettings) {
      payload.color_temp = command.color;
    }

    this.publish(stateTopic, JSON.stringify(payload), { retain: true });
  }

  public buttonPressed(deviceId: string, deviceInput: number): void {
    const topic = `${this.topicPrefix}/device_automation/${this.devicePrefix}/${deviceId}_${deviceInput}/action`;
    const payload = {
      action: 'button_press',
      device_id: deviceId,
      input: deviceInput
    };

    this.publish(topic, JSON.stringify(payload));
  }

  public sceneTriggered(sceneId: string): void {
    const scene = this.deviceRegistry.getAllScenes().find(s => s.uniqueId === sceneId);
    if (!scene) return;

    const stateTopic = this.getStateTopic(scene);
    this.publish(stateTopic, MqttState.ON, { retain: false });
    
    // Turn off after brief moment
    setTimeout(() => {
      this.publish(stateTopic, MqttState.OFF, { retain: false });
    }, 100);
  }

  public cleanup(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
    this.removeAllListeners();
  }

  public disconnect(callback?: () => void): void {
    if (this.client) {
      this.client.end(false, {}, callback);
    } else if (callback) {
      callback();
    }
  }

  public override on<K extends keyof MqttClientEvents>(
    event: K,
    listener: MqttClientEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public override emit<K extends keyof MqttClientEvents>(
    event: K,
    ...args: Parameters<MqttClientEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  private subscribeToCommands(): void {
    if (!this.client) return;

    // Subscribe to all device command topics
    for (const device of this.deviceRegistry.getAllOutputDevices()) {
      const commandTopic = this.getCommandTopic(device);
      this.client.subscribe(commandTopic);
      logger.debug(`Subscribed to ${commandTopic}`);
    }

    // Subscribe to scene command topics
    for (const scene of this.deviceRegistry.getAllScenes()) {
      const commandTopic = this.getCommandTopic(scene);
      this.client.subscribe(commandTopic);
      logger.debug(`Subscribed to ${commandTopic}`);
    }
  }

  private handleMessage(topic: string, message: Buffer): void {
    try {
      const device = this.findDeviceByCommandTopic(topic);
      if (!device) {
        logger.debug(`No device found for topic: ${topic}`);
        return;
      }

      const messageStr = message.toString();
      logger.debug(`Received command for ${device.uniqueId}: ${messageStr}`);

      if (device.type === DeviceTypeEnum.SCENE) {
        this.emit('stateChanged', device, messageStr);
        return;
      }

      // Parse command for lights/switches
      let command: string | CommandData;
      
      if (messageStr === MqttState.ON || messageStr === MqttState.OFF) {
        command = messageStr;
      } else {
        try {
          const parsed = JSON.parse(messageStr) as Record<string, unknown>;
          const commandData: CommandData = {
            state: parsed.state === MqttState.ON
          };
          if (typeof parsed.brightness === 'number') {
            commandData.dim = Math.round((parsed.brightness / 255) * 255);
          }
          if (typeof parsed.color_temp === 'number') {
            commandData.color = parsed.color_temp;
          }
          command = commandData;
        } catch {
          command = messageStr;
        }
      }

      this.emit('stateChanged', device, command);
    } catch (error) {
      logger.error('Error handling MQTT message', error);
    }
  }

  private findDeviceByCommandTopic(topic: string): OutputDevice | undefined {
    // Extract unique ID from topic
    const parts = topic.split('/');
    if (parts.length < 4) return undefined;

    const uniqueId = parts[3]!; // Assuming format: homeassistant/light/plejd/uniqueId/set
    
    const outputDevice = this.deviceRegistry.getOutputDevice(uniqueId);
    if (outputDevice) return outputDevice;
    
    const scene = this.deviceRegistry.getAllScenes().find(s => s.uniqueId === uniqueId);
    return scene as OutputDevice | undefined;
  }

  private sendDeviceDiscovery(device: OutputDevice): void {
    const deviceType = device.type === DeviceTypeEnum.SWITCH ? 'switch' : 'light';
    const configTopic = `${this.topicPrefix}/${deviceType}/${this.devicePrefix}/${device.uniqueId}/config`;
    
    const config: Record<string, unknown> = {
      name: device.name,
      unique_id: device.uniqueId,
      state_topic: this.getStateTopic(device),
      command_topic: this.getCommandTopic(device),
      availability_topic: `${this.topicPrefix}/${this.devicePrefix}/availability`,
      device: {
        identifiers: [device.deviceId ?? device.uniqueId],
        name: device.name,
        model: device.typeName,
        manufacturer: 'Plejd'
      }
    };

    if (device.dimmable && deviceType === 'light') {
      config.brightness_state_topic = this.getStateTopic(device);
      config.brightness_command_topic = this.getCommandTopic(device);
      config.brightness_scale = 255;
      config.schema = 'json';
    }

    if (device.colorTempSettings && deviceType === 'light') {
      config.color_temp_state_topic = this.getStateTopic(device);
      config.color_temp_command_topic = this.getCommandTopic(device);
    }

    this.publish(configTopic, JSON.stringify(config), { retain: true });
  }

  private sendInputDeviceDiscovery(device: { uniqueId: string; name: string; deviceId: string; typeName: string; type: string }): void {
    const configTopic = `${this.topicPrefix}/device_automation/${this.devicePrefix}/${device.uniqueId}/config`;
    
    const config = {
      automation_type: 'trigger',
      topic: `${this.topicPrefix}/device_automation/${this.devicePrefix}/${device.uniqueId}/action`,
      type: 'button_short_press',
      subtype: 'button_1',
      device: {
        identifiers: [device.deviceId],
        name: device.name,
        model: device.typeName,
        manufacturer: 'Plejd'
      }
    };

    this.publish(configTopic, JSON.stringify(config), { retain: true });
  }

  private sendSceneDiscovery(scene: { uniqueId: string; name: string; typeName: string; type: string }): void {
    const configTopic = `${this.topicPrefix}/switch/${this.devicePrefix}/${scene.uniqueId}/config`;
    
    const config = {
      name: scene.name,
      unique_id: scene.uniqueId,
      state_topic: this.getStateTopic(scene),
      command_topic: this.getCommandTopic(scene),
      availability_topic: `${this.topicPrefix}/${this.devicePrefix}/availability`,
      device: {
        identifiers: [scene.uniqueId],
        name: scene.name,
        model: scene.typeName,
        manufacturer: 'Plejd'
      }
    };

    this.publish(configTopic, JSON.stringify(config), { retain: true });
  }

  private getStateTopic(device: { uniqueId: string; type: string }): string {
    const deviceType = device.type === DeviceTypeEnum.SWITCH ? 'switch' : 
                      device.type === DeviceTypeEnum.SCENE ? 'switch' : 'light';
    return `${this.topicPrefix}/${deviceType}/${this.devicePrefix}/${device.uniqueId}/state`;
  }

  private getCommandTopic(device: { uniqueId: string; type: string }): string {
    const deviceType = device.type === DeviceTypeEnum.SWITCH ? 'switch' : 
                      device.type === DeviceTypeEnum.SCENE ? 'switch' : 'light';
    return `${this.topicPrefix}/${deviceType}/${this.devicePrefix}/${device.uniqueId}/set`;
  }

  private publish(topic: string, message: string, options: { retain?: boolean } = {}): void {
    if (!this.client) {
      logger.warn('MQTT client not connected, cannot publish');
      return;
    }

    this.client.publish(topic, message, options, (error) => {
      if (error) {
        logger.error(`Failed to publish to ${topic}`, error);
      } else {
        logger.debug(`Published to ${topic}: ${message}`);
      }
    });
  }
}
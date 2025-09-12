import { EventEmitter } from 'events';
import { getOptions } from '@/lib/configuration';
import { getLogger } from '@/lib/logger';
import { DeviceRegistry } from '@/lib/device-registry';
import { PlejdApi } from '@/lib/plejd-api';
import { MqttClient } from '@/lib/mqtt-client';
import { PlejdBleHandler } from '@/lib/plejd-ble-handler';
import { SceneManager } from '@/lib/scene-manager';
import type { AddonConfiguration, OutputDevice, CommandData } from '@/types';
import { Command, DeviceTypeEnum, MqttState } from '@/types';

const logger = getLogger('plejd-addon');

export class PlejdAddon extends EventEmitter {
  private readonly config: AddonConfiguration;
  private readonly deviceRegistry: DeviceRegistry;
  private readonly plejdApi: PlejdApi;
  private readonly mqttClient: MqttClient;
  private readonly bleHandler: PlejdBleHandler;
  private readonly sceneManager: SceneManager;
  private cleanupFunction: (() => void) | null = null;

  constructor() {
    super();

    this.config = getOptions();
    this.deviceRegistry = new DeviceRegistry();
    this.plejdApi = new PlejdApi(this.deviceRegistry, this.config);
    this.mqttClient = new MqttClient(this.deviceRegistry, this.config);
    this.bleHandler = new PlejdBleHandler(this.deviceRegistry, this.config);
    this.sceneManager = new SceneManager(this.deviceRegistry, this.bleHandler);
  }

  public async init(): Promise<void> {
    logger.info('Initializing Plejd addon');

    try {
      // Initialize API and get device information
      await this.plejdApi.init();
      
      // Initialize scene manager
      this.sceneManager.init();

      // Set up cleanup handler
      this.setupCleanupHandlers();

      // Initialize MQTT client
      await this.mqttClient.init();

      // Set up event handlers
      this.setupEventHandlers();

      // Send initial discovery
      this.mqttClient.sendDiscoveryToHomeAssistant();

      // Initialize BLE handler
      await this.bleHandler.init();

      logger.info('Plejd addon initialization completed');
    } catch (error) {
      logger.error('Failed to initialize Plejd addon', error);
      throw error;
    }
  }

  private setupCleanupHandlers(): void {
    this.cleanupFunction = (): void => {
      logger.info('Cleaning up Plejd addon');
      
      this.mqttClient.cleanup();
      this.bleHandler.cleanup();
      this.removeAllListeners();
      
      this.cleanupFunction = null;
      
      this.mqttClient.disconnect(() => {
        process.exit(0);
      });
    };

    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGHUP', 'SIGTERM'];
    signals.forEach(signal => {
      process.on(signal, () => {
        if (this.cleanupFunction) {
          this.cleanupFunction();
        }
      });
    });
  }

  private setupEventHandlers(): void {
    // MQTT connected event
    this.mqttClient.on('connected', () => {
      try {
        logger.debug('MQTT connected, sending discovery');
        this.mqttClient.sendDiscoveryToHomeAssistant();
      } catch (error) {
        logger.error('Error in MQTT connected handler', error);
      }
    });

    // MQTT state change event
    this.mqttClient.on('stateChanged', (device: OutputDevice, command: string | CommandData) => {
      try {
        this.handleMqttStateChange(device, command);
      } catch (error) {
        logger.error('Error in MQTT state change handler', error);
      }
    });

    // BLE state change event
    this.bleHandler.on('commandReceived', (uniqueOutputId: string, command: Command, data: CommandData) => {
      try {
        this.mqttClient.updateOutputState(uniqueOutputId, data);
      } catch (error) {
        logger.error('Error in BLE command received handler', error);
      }
    });

    // BLE button press event
    this.bleHandler.on('buttonPressed', (deviceId: string, deviceInput: number) => {
      try {
        this.mqttClient.buttonPressed(deviceId, deviceInput);
      } catch (error) {
        logger.error('Error in BLE button pressed handler', error);
      }
    });

    // BLE scene trigger event
    this.bleHandler.on('sceneTriggered', (sceneId: string) => {
      try {
        this.mqttClient.sceneTriggered(sceneId);
      } catch (error) {
        logger.error('Error in BLE scene triggered handler', error);
      }
    });

    // BLE reconnecting event
    this.bleHandler.on('reconnecting', () => {
      logger.info('BLE handler is reconnecting');
    });

    // BLE connected event
    this.bleHandler.on('connected', () => {
      logger.info('BLE handler connected');
    });
  }

  private handleMqttStateChange(device: OutputDevice, command: string | CommandData): void {
    const { uniqueId } = device;

    if (device.type === DeviceTypeEnum.SCENE) {
      this.sceneManager.executeScene(uniqueId);
      setTimeout(() => {
        this.mqttClient.sceneTriggered(uniqueId);
      }, 100);
      return;
    }

    let state = false;
    let commandObj: CommandData = {};

    if (typeof command === 'string') {
      state = command === MqttState.ON;
      commandObj = { state };
      this.mqttClient.updateOutputState(uniqueId, commandObj);
    } else {
      state = command.state === true;
      commandObj = command;
    }

    if (state) {
      void this.bleHandler.turnOn(uniqueId, commandObj);
    } else {
      void this.bleHandler.turnOff(uniqueId, commandObj);
    }
  }
}
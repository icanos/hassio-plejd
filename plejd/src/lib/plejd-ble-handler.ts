import { EventEmitter } from 'events';
import { randomBytes, createCipheriv } from 'crypto';
import dbus from 'dbus-next';
import type { 
  AddonConfiguration, 
  BleDevice, 
  PlejdService, 
  BleCharacteristics,
  CommandData,
  Command
} from '@/types';
import { Command as CommandEnum } from '@/types';
import { BLE, PLEJD_UUIDS, BLUEZ, DBUS, PAYLOAD_OFFSETS } from '@/lib/constants';
import { getLogger } from '@/lib/logger';
import type { DeviceRegistry } from '@/lib/device-registry';

const logger = getLogger('plejd-ble');

export interface PlejdBleHandlerEvents {
  connected: () => void;
  reconnecting: () => void;
  commandReceived: (uniqueOutputId: string, command: Command, data: CommandData) => void;
  buttonPressed: (deviceId: string, deviceInput: number) => void;
  sceneTriggered: (sceneId: string) => void;
}

export class PlejdBleHandler extends EventEmitter {
  private adapter: unknown = null;
  private adapterProperties: unknown = null;
  private bus: dbus.MessageBus | null = null;
  private objectManager: unknown = null;
  private bleDevices: BleDevice[] = [];
  private connectedDevice: unknown = null;
  // private connectedDeviceId: number | null = null;
  private plejdService: PlejdService | null = null;
  private characteristics: BleCharacteristics = {
    data: null,
    lastData: null,
    lastDataProperties: null,
    auth: null,
    ping: null
  };
  private cryptoKey: Buffer | null = null;
  private consecutiveWriteFails = 0;
  private consecutiveReconnectAttempts = 0;
  private reconnectInProgress = false;
  private discoveryTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private timeUpdateTimeout: NodeJS.Timeout | null = null;
  private emergencyReconnectTimeout: NodeJS.Timeout | null = null;

  constructor(
    private readonly deviceRegistry: DeviceRegistry,
    private readonly config: AddonConfiguration
  ) {
    super();
  }

  public async init(): Promise<void> {
    logger.info('Initializing Plejd BLE handler');

    this.bus = dbus.systemBus();
    this.setupBusEventHandlers();
    this.setupWriteEventHandlers();

    this.cryptoKey = Buffer.from(this.deviceRegistry.cryptoKey.replace(/-/g, ''), 'hex');
    
    await this.getBluetoothInterface();
    await this.startDeviceDiscovery();

    logger.info('BLE handler initialization completed');
  }

  public async turnOn(uniqueId: string, command: CommandData): Promise<void> {
    const device = this.deviceRegistry.getOutputDevice(uniqueId);
    if (!device) {
      logger.warn(`Device ${uniqueId} not found`);
      return;
    }

    if (command.dim !== undefined && device.dimmable) {
      await this.sendCommand(CommandEnum.DIM, device.bleOutputAddress, command.dim);
    } else if (command.color !== undefined && device.colorTempSettings) {
      await this.sendCommand(CommandEnum.COLOR, device.bleOutputAddress, undefined, command.color);
    } else {
      await this.sendCommand(CommandEnum.TURN_ON, device.bleOutputAddress);
    }
  }

  public async turnOff(uniqueId: string, _command: CommandData): Promise<void> {
    const device = this.deviceRegistry.getOutputDevice(uniqueId);
    if (!device) {
      logger.warn(`Device ${uniqueId} not found`);
      return;
    }

    await this.sendCommand(CommandEnum.TURN_OFF, device.bleOutputAddress);
  }

  public async triggerScene(sceneAddress: number): Promise<void> {
    const payload = this.createHexPayload(sceneAddress, BLE.COMMANDS.SCENE_TRIGGER, '01');
    await this.write(payload);
  }

  public override on<K extends keyof PlejdBleHandlerEvents>(
    event: K,
    listener: PlejdBleHandlerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public override emit<K extends keyof PlejdBleHandlerEvents>(
    event: K,
    ...args: Parameters<PlejdBleHandlerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  public cleanup(): void {
    logger.debug('Cleaning up BLE handler');

    this.clearTimeouts();
    this.removeAllListeners();
    this.cleanupBusHandlers();
  }

  private async sendCommand(
    command: Command, 
    bleOutputAddress: number, 
    brightness?: number, 
    colorTemp?: number
  ): Promise<void> {
    let payload: Buffer;

    switch (command) {
      case CommandEnum.TURN_ON:
        payload = this.createHexPayload(bleOutputAddress, BLE.COMMANDS.STATE_CHANGE, '01');
        break;
      case CommandEnum.TURN_OFF:
        payload = this.createHexPayload(bleOutputAddress, BLE.COMMANDS.STATE_CHANGE, '00');
        break;
      case CommandEnum.DIM:
        if (brightness === undefined) throw new Error('Brightness required for DIM command');
        const brightnessVal = (brightness << 8) | brightness;
        payload = this.createHexPayload(
          bleOutputAddress,
          BLE.COMMANDS.DIM2_CHANGE,
          `01${brightnessVal.toString(16).padStart(4, '0')}`
        );
        break;
      case CommandEnum.COLOR:
        if (colorTemp === undefined) throw new Error('Color temperature required for COLOR command');
        payload = this.createHexPayload(
          bleOutputAddress,
          BLE.COMMANDS.COLOR_CHANGE,
          `030111${colorTemp.toString(16).padStart(4, '0')}`
        );
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }

    await this.write(payload);

    // Color commands are not echoed back, so emit manually
    if (command === CommandEnum.COLOR) {
      const device = this.deviceRegistry.getOutputDeviceByBleOutputAddress(bleOutputAddress);
      if (device) {
        this.emit('commandReceived', device.uniqueId, command, {
          state: true,
          color: colorTemp!
        });
      }
    }
  }

  private async write(payload: Buffer): Promise<void> {
    if (!this.plejdService || !this.characteristics.data) {
      throw new Error('BLE service or characteristics not available');
    }

    try {
      logger.debug(`Sending ${payload.length} bytes: ${payload.toString('hex')}`);
      
      const encryptedData = this.encryptDecrypt(this.cryptoKey!, this.plejdService.addr, payload);
      
      // Cast to any to work with dbus interface
      const dataChar = this.characteristics.data as any;
      await dataChar.WriteValue([...encryptedData], {});

      this.onWriteSuccess();
    } catch (error) {
      await this.onWriteFailed(error as Error);
      throw error;
    }
  }

  private setupBusEventHandlers(): void {
    if (!this.bus) return;

    this.bus.on('error', (error) => {
      logger.debug(`D-Bus error: ${error.message}`);
    });

    this.bus.on('connect', () => {
      logger.debug('D-Bus connected');
    });
  }

  private setupWriteEventHandlers(): void {
    // Write event handlers are set up in the actual implementation
  }

  private cleanupBusHandlers(): void {
    if (this.bus) {
      this.bus.removeAllListeners();
    }
    if (this.characteristics.lastDataProperties) {
      (this.characteristics.lastDataProperties as any).removeAllListeners();
    }
    if (this.objectManager) {
      (this.objectManager as any).removeAllListeners();
    }
  }

  private clearTimeouts(): void {
    if (this.discoveryTimeout) {
      clearTimeout(this.discoveryTimeout);
      this.discoveryTimeout = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.timeUpdateTimeout) {
      clearTimeout(this.timeUpdateTimeout);
      this.timeUpdateTimeout = null;
    }
    if (this.emergencyReconnectTimeout) {
      clearTimeout(this.emergencyReconnectTimeout);
      this.emergencyReconnectTimeout = null;
    }
  }

  private async getBluetoothInterface(): Promise<void> {
    if (!this.bus) throw new Error('D-Bus not initialized');

    const bluez = await this.bus.getProxyObject(BLUEZ.SERVICE_NAME, '/');
    this.objectManager = await bluez.getInterface(DBUS.OM_INTERFACE);

    const managedObjects = await (this.objectManager as any).GetManagedObjects() as Record<string, any>;
    const managedPaths = Object.keys(managedObjects);

    for (const path of managedPaths) {
      const pathInterfaces = Object.keys(managedObjects[path]);
      if (pathInterfaces.includes(BLUEZ.ADAPTER_ID)) {
        logger.debug(`Found BLE adapter at ${path}`);
        
        const adapterObject = await this.bus.getProxyObject(BLUEZ.SERVICE_NAME, path);
        this.adapterProperties = await adapterObject.getInterface(DBUS.PROP_INTERFACE);
        await this.powerOnAdapter();
        this.adapter = await adapterObject.getInterface(BLUEZ.ADAPTER_ID);
        await this.cleanExistingConnections(managedObjects);
        
        logger.debug(`Got adapter: ${(this.adapter as any).path}`);
        return;
      }
    }

    throw new Error('No compatible Bluetooth adapter found');
  }

  private async powerOnAdapter(): Promise<void> {
    logger.debug('Powering on BLE adapter');
    await (this.adapterProperties as any).Set(
      BLUEZ.ADAPTER_ID, 
      'Powered', 
      new dbus.Variant('b', true)
    );
    await this.delay(5000);
  }

  private async cleanExistingConnections(managedObjects: Record<string, any>): Promise<void> {
    logger.debug('Cleaning existing BLE connections');

    for (const path of Object.keys(managedObjects)) {
      try {
        const interfaces = Object.keys(managedObjects[path]);
        
        if (interfaces.includes(BLUEZ.DEVICE_ID)) {
          const proxyObject = await this.bus!.getProxyObject(BLUEZ.SERVICE_NAME, path);
          const device = await proxyObject.getInterface(BLUEZ.DEVICE_ID);
          
          const connected = managedObjects[path][BLUEZ.DEVICE_ID].Connected.value;
          
          if (connected) {
            logger.info(`Disconnecting ${path}`);
            await device.Disconnect();
          }
          
          logger.debug(`Removing ${path} from adapter`);
          if (this.adapter) {
        await (this.adapter as any).RemoveDevice(path);
      }
        }
      } catch (error) {
        logger.error(`Error cleaning connection ${path}`, error);
      }
    }
  }

  private async startDeviceDiscovery(): Promise<void> {
    logger.info('Starting BLE device discovery');

    (this.objectManager as any).on('InterfacesAdded', (path: string, interfaces: any) => {
      void this.onInterfacesAdded(path, interfaces);
    });

    if (this.adapter) {
      await (this.adapter as any).SetDiscoveryFilter({
      UUIDs: new dbus.Variant('as', [PLEJD_UUIDS.PLEJD_SERVICE]),
      Transport: new dbus.Variant('s', 'le')
    });

      this.scheduleDiscoveryTimeout();
      await (this.adapter as any).StartDiscovery();
    }
    logger.debug('BLE discovery started');
  }

  private scheduleDiscoveryTimeout(): void {
    this.discoveryTimeout = setTimeout(() => {
      void this.processDiscoveredDevices();
    }, this.config.connectionTimeout * 1000);
  }

  private async onInterfacesAdded(path: string, interfaces: any): Promise<void> {
    const interfaceKeys = Object.keys(interfaces);
    
    if (interfaceKeys.includes(BLUEZ.DEVICE_ID)) {
      const uuids = interfaces[BLUEZ.DEVICE_ID].UUIDs?.value || [];
      if (uuids.includes(PLEJD_UUIDS.PLEJD_SERVICE)) {
        logger.debug(`Found Plejd device at ${path}`);
        (this.objectManager as any).removeAllListeners('InterfacesAdded');
        await this.initDiscoveredDevice(path);
      }
    }
  }

  private async initDiscoveredDevice(path: string): Promise<void> {
    try {
      const proxyObject = await this.bus!.getProxyObject(BLUEZ.SERVICE_NAME, path);
      const device = await proxyObject.getInterface(BLUEZ.DEVICE_ID);
      const properties = await proxyObject.getInterface(DBUS.PROP_INTERFACE);

      const rssi = (await properties.Get(BLUEZ.DEVICE_ID, 'RSSI')).value;
      const serialNumber = this.extractSerialFromPath(path);
      const physicalDevice = this.deviceRegistry.getPhysicalDevice(serialNumber);

      if (physicalDevice) {
        const bleDevice: BleDevice = {
          path,
          rssi,
          instance: device,
          device: physicalDevice
        };

        this.bleDevices.push(bleDevice);
        logger.debug(`Added BLE device: ${physicalDevice.title} (RSSI: ${rssi})`);
      } else {
        logger.warn(`Device registry does not contain device with serial ${serialNumber}`);
      }
    } catch (error) {
      logger.error(`Failed to initialize device ${path}`, error);
    }
  }

  private async processDiscoveredDevices(): Promise<void> {
    try {
      if (this.bleDevices.length === 0) {
        throw new Error('No devices found during discovery');
      }

      logger.info(`Found ${this.bleDevices.length} Plejd devices`);

      // Sort by signal strength (best first)
      const sortedDevices = this.bleDevices.sort((a, b) => b.rssi - a.rssi);

      for (const device of sortedDevices) {
        try {
          logger.info(`Connecting to ${device.path}`);
          await (device.instance as any).Connect();
          
          await this.delay(this.config.connectionTimeout * 1000);
          
          const connected = await this.onDeviceConnected(device);
          if (connected) break;
        } catch (error) {
          logger.warn(`Failed to connect to ${device.path}`, error);
        }
      }

      if (this.adapter) {
        await (this.adapter as any).StopDiscovery();
      }

      if (!this.connectedDevice) {
        throw new Error('Could not connect to any Plejd device');
      }

      this.startPing();
      this.setupDataNotifications();
      this.consecutiveReconnectAttempts = 0;
      this.emit('connected');

    } catch (error) {
      logger.error('Device discovery failed', error);
      void this.startReconnectLoop();
    }
  }

  private async onDeviceConnected(device: BleDevice): Promise<boolean> {
    // Implementation would handle device connection, authentication, etc.
    // This is a simplified version
    logger.info(`Connected to ${device.device.title}`);
    this.connectedDevice = device.device;
    // this.connectedDeviceId = this.deviceRegistry.getMainBleIdByDeviceId(device.device.deviceId);
    return true;
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      void this.ping();
    }, 3000);
  }

  private async ping(): Promise<void> {
    if (!this.characteristics.ping) return;

    try {
      const pingData = randomBytes(1);
      await (this.characteristics.ping as any).WriteValue([...pingData], {});
      const pong = await (this.characteristics.ping as any).ReadValue({}) as number[];
      
      if (((pingData[0]! + 1) & 0xff) !== pong[0]) {
        throw new Error('Ping failed - invalid pong response');
      }
      
      this.onWriteSuccess();
    } catch (error) {
      await this.onWriteFailed(error as Error);
    }
  }

  private setupDataNotifications(): void {
    if (!this.characteristics.lastDataProperties) return;

    (this.characteristics.lastDataProperties as any).on('PropertiesChanged', 
      (iface: string, properties: any) => {
        void this.onLastDataUpdated(iface, properties);
      }
    );

    (this.characteristics.lastData as any).StartNotify();
  }

  private async onLastDataUpdated(iface: string, properties: any): Promise<void> {
    if (iface !== BLUEZ.GATT_CHAR_ID) return;

    const value = properties.Value?.value;
    if (!value || !this.plejdService || !this.cryptoKey) return;

    const decoded = this.encryptDecrypt(this.cryptoKey, this.plejdService.addr, value);
    
    if (decoded.length < PAYLOAD_OFFSETS.POSITION) {
      logger.debug(`Ignoring short BLE event: ${decoded.toString('hex')}`);
      return;
    }

    const bleOutputAddress = decoded.readUInt8(0);
    const cmd = decoded.readUInt16BE(3);
    const state = decoded.length > PAYLOAD_OFFSETS.POSITION ? decoded.readUInt8(PAYLOAD_OFFSETS.POSITION) : 0;
    const dim = decoded.length > PAYLOAD_OFFSETS.DIM_LEVEL ? decoded.readUInt8(PAYLOAD_OFFSETS.DIM_LEVEL) : 0;

    const device = this.deviceRegistry.getOutputDeviceByBleOutputAddress(bleOutputAddress);
    const uniqueId = device?.uniqueId;

    logger.debug(`BLE event: device ${uniqueId}, cmd ${cmd.toString(16)}, state ${state}, dim ${dim}`);

    this.processCommand(cmd, uniqueId, state, dim, decoded);
  }

  private processCommand(cmd: number, uniqueId: string | undefined, state: number, dim: number, decoded: Buffer): void {
    if (!uniqueId) return;

    let command: Command;
    let data: CommandData = {};

    if (cmd === BLE.COMMANDS.STATE_CHANGE) {
      command = state ? CommandEnum.TURN_ON : CommandEnum.TURN_OFF;
      this.emit('commandReceived', uniqueId, command, data);
    } else if (cmd === BLE.COMMANDS.DIM_CHANGE || cmd === BLE.COMMANDS.DIM2_CHANGE) {
      command = CommandEnum.DIM;
      data = { state: Boolean(state), dim };
      this.emit('commandReceived', uniqueId, command, data);
    } else if (cmd === BLE.COMMANDS.SCENE_TRIGGER) {
      const sceneBleAddress = state;
      const scene = this.deviceRegistry.getSceneByBleAddress(sceneBleAddress);
      if (scene) {
        this.emit('sceneTriggered', scene.uniqueId);
      }
    } else if (cmd === BLE.COMMANDS.REMOTE_CLICK) {
      const inputBleAddress = state;
      const inputButton = decoded.length > 6 ? decoded.readUInt8(6)! : 0;
      const inputDevice = this.deviceRegistry.getInputDeviceByBleInputAddress(inputBleAddress, inputButton);
      if (inputDevice) {
        this.emit('buttonPressed', inputDevice.deviceId, inputDevice.input);
      }
    }
  }

  private onWriteSuccess(): void {
    this.consecutiveWriteFails = 0;
  }

  private async onWriteFailed(error: Error): Promise<void> {
    this.consecutiveWriteFails++;
    logger.debug(`Write failed #${this.consecutiveWriteFails}: ${error.message}`);

    const shouldReconnect = error.message.includes('Not connected') || 
                           error.message.includes('WriteValue') ||
                           this.consecutiveWriteFails >= 5;

    if (shouldReconnect) {
      logger.warn(`BLE disconnected (${this.consecutiveWriteFails} failures), reconnecting...`);
      void this.startReconnectLoop();
    }
  }

  private async startReconnectLoop(): Promise<void> {
    if (this.reconnectInProgress) return;

    this.reconnectInProgress = true;
    this.emit('reconnecting');

    while (true) {
      try {
        this.cleanup();
        this.consecutiveReconnectAttempts++;

        if (this.consecutiveReconnectAttempts % 10 === 0) {
          logger.warn(`Reconnect attempt ${this.consecutiveReconnectAttempts}, power cycling adapter`);
          await this.powerCycleAdapter();
        }

        await this.delay(5000);
        await this.init();
        break;
      } catch (error) {
        logger.warn('Reconnect failed, retrying...', error);
      }
    }

    this.reconnectInProgress = false;
  }

  private async powerCycleAdapter(): Promise<void> {
    if (!this.adapterProperties) return;

    logger.debug('Power cycling BLE adapter');
    await (this.adapterProperties as any).Set(BLUEZ.ADAPTER_ID, 'Powered', new dbus.Variant('b', false));
    await this.delay(30000);
    await (this.adapterProperties as any).Set(BLUEZ.ADAPTER_ID, 'Powered', new dbus.Variant('b', true));
    await this.delay(5000);
  }

  private createHexPayload(
    bleOutputAddress: number,
    command: number,
    hexDataString: string,
    requestType: number = BLE.REQUEST_NO_RESPONSE
  ): Buffer {
    const dataLength = Math.ceil(hexDataString.length / 2);
    const payload = Buffer.alloc(PAYLOAD_OFFSETS.POSITION + dataLength);
    
    payload.writeUInt8(bleOutputAddress, 0);
    payload.writeUInt16BE(requestType, 1);
    payload.writeUInt16BE(command, 3);
    payload.write(hexDataString, PAYLOAD_OFFSETS.POSITION, 'hex');
    
    return payload;
  }

  private encryptDecrypt(key: Buffer, addr: Buffer, data: Buffer | number[]): Buffer {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const buf = Buffer.concat([addr, addr, addr.subarray(0, 4)] as any);

    const cipher = createCipheriv('aes-128-ecb', key as any, null);
    cipher.setAutoPadding(false);

    let ct = cipher.update(buf as any).toString('hex');
    ct += cipher.final().toString('hex');
    const ctBuf = Buffer.from(ct, 'hex');

    const output = Buffer.alloc(dataBuffer.length);
    for (let i = 0; i < dataBuffer.length; i++) {
      output[i] = dataBuffer[i]! ^ ctBuf[i % 16]!;
    }

    return output;
  }

  private extractSerialFromPath(path: string): string {
    const segments = path.split('/');
    const deviceSegment = segments[segments.length - 1].replace('dev_', '');
    return deviceSegment.replace(/_/g, '').toLowerCase();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
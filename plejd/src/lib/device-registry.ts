import type { 
  ApiSite, 
  ApiDevice, 
  OutputDevice, 
  InputDevice, 
  SceneDevice 
} from '@/types';
import { getLogger } from '@/lib/logger';

const logger = getLogger('device-registry');

export class DeviceRegistry {
  private physicalDevices = new Map<string, ApiDevice>();
  private outputDevices = new Map<string, OutputDevice>();
  private inputDevices = new Map<string, InputDevice>();
  private sceneDevices = new Map<string, SceneDevice>();
  private apiSite: ApiSite | null = null;

  public get cryptoKey(): string {
    if (!this.apiSite?.plejdMesh.cryptoKey) {
      throw new Error('Crypto key not available - API site not set');
    }
    return this.apiSite.plejdMesh.cryptoKey;
  }

  public setApiSite(site: ApiSite): void {
    this.apiSite = site;
    logger.info(`API site set: ${site.title} with ${site.devices.length} devices`);
  }

  public addPhysicalDevice(device: ApiDevice): void {
    // Use device serial number as key (extracted from deviceId)
    const serialNumber = this.extractSerialNumber(device.deviceId);
    this.physicalDevices.set(serialNumber, device);
    logger.debug(`Added physical device: ${device.title} (${serialNumber})`);
  }

  public getPhysicalDevice(serialNumber: string): ApiDevice | undefined {
    return this.physicalDevices.get(serialNumber);
  }

  public addOutputDevice(device: OutputDevice): void {
    this.outputDevices.set(device.uniqueId, device);
    logger.debug(`Added output device: ${device.name} (${device.uniqueId})`);
  }

  public getOutputDevice(uniqueId: string): OutputDevice | undefined {
    return this.outputDevices.get(uniqueId);
  }

  public getOutputDeviceByBleOutputAddress(bleAddress: number): OutputDevice | undefined {
    return Array.from(this.outputDevices.values())
      .find(device => device.bleOutputAddress === bleAddress);
  }

  public addInputDevice(device: InputDevice): void {
    this.inputDevices.set(device.uniqueId, device);
    logger.debug(`Added input device: ${device.name} (${device.uniqueId})`);
  }

  public getInputDeviceByBleInputAddress(bleAddress: number, input: number): InputDevice | undefined {
    return Array.from(this.inputDevices.values())
      .find(device => device.bleInputAddress === bleAddress && device.input === input);
  }

  public addScene(scene: SceneDevice): void {
    this.sceneDevices.set(scene.uniqueId, scene);
    logger.debug(`Added scene: ${scene.name} (${scene.uniqueId})`);
  }

  public getSceneByBleAddress(bleAddress: number): SceneDevice | undefined {
    return Array.from(this.sceneDevices.values())
      .find(scene => scene.bleOutputAddress === bleAddress);
  }

  public getOutputDeviceIdsByRoomId(roomId: string): string[] {
    return Array.from(this.outputDevices.values())
      .filter(device => device.roomId === roomId)
      .map(device => device.uniqueId);
  }

  public getMainBleIdByDeviceId(deviceId: string): number | null {
    if (!this.apiSite) return null;
    return this.apiSite.deviceAddress[deviceId] ?? null;
  }

  public getUniqueOutputId(deviceId: string, output: number): string {
    return `${deviceId}_${output}`;
  }

  public getUniqueInputId(deviceId: string, input: number): string {
    return `${deviceId}_input_${input}`;
  }

  public getAllOutputDevices(): readonly OutputDevice[] {
    return Array.from(this.outputDevices.values());
  }

  public getAllInputDevices(): readonly InputDevice[] {
    return Array.from(this.inputDevices.values());
  }

  public getAllScenes(): readonly SceneDevice[] {
    return Array.from(this.sceneDevices.values());
  }

  public clearPlejdDevices(): void {
    this.outputDevices.clear();
    this.inputDevices.clear();
    logger.debug('Cleared all Plejd devices');
  }

  public clearSceneDevices(): void {
    this.sceneDevices.clear();
    logger.debug('Cleared all scene devices');
  }

  private extractSerialNumber(deviceId: string): string {
    // Extract serial number from device ID format
    return deviceId.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  }
}
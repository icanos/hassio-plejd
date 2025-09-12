export interface AddonConfiguration {
  readonly site: string;
  readonly username: string;
  readonly password: string;
  readonly mqttBroker: string;
  readonly mqttUsername: string;
  readonly mqttPassword: string;
  readonly includeRoomsAsLights: boolean;
  readonly preferCachedApiResponse: boolean;
  readonly updatePlejdClock: boolean;
  readonly logLevel: 'error' | 'warn' | 'info' | 'debug' | 'verbose' | 'silly';
  readonly connectionTimeout: number;
  readonly writeQueueWaitTime: number;
}

export interface AddonInfo {
  readonly version: string;
  readonly name: string;
  readonly slug: string;
}

export interface ApiSite {
  readonly siteId: string;
  readonly title: string;
  readonly devices: readonly ApiDevice[];
  readonly rooms: readonly ApiRoom[];
  readonly scenes: readonly ApiScene[];
  readonly plejdMesh: {
    readonly cryptoKey: string;
  };
  readonly outputSettings: readonly ApiOutputSetting[];
  readonly inputSettings: readonly ApiInputSetting[];
  readonly outputAddress: Record<string, Record<number, number>>;
  readonly deviceAddress: Record<string, number>;
  readonly roomAddress: Record<string, number>;
  readonly sceneIndex: Record<string, number>;
  readonly plejdDevices: readonly ApiPlejdDevice[];
  readonly gateways?: readonly ApiGateway[];
}

export interface ApiDevice {
  readonly objectId: string;
  readonly deviceId: string;
  readonly title: string;
  readonly roomId: string;
  readonly traits: number;
  readonly outputType: 'LIGHT' | 'RELAY';
}

export interface ApiRoom {
  readonly roomId: string;
  readonly title: string;
}

export interface ApiScene {
  readonly sceneId: string;
  readonly title: string;
}

export interface ApiOutputSetting {
  readonly deviceParseId: string;
  readonly output: number;
  readonly colorTemperature?: {
    readonly min: number;
    readonly max: number;
  };
}

export interface ApiInputSetting {
  readonly deviceId: string;
  readonly input: number;
}

export interface ApiPlejdDevice {
  readonly deviceId: string;
  readonly hardwareId: string;
  readonly firmware: {
    readonly version: string;
  };
}

export interface ApiGateway {
  readonly title: string;
}

export interface CachedSite {
  readonly siteId: string;
  readonly siteDetails: ApiSite;
  readonly sessionToken: string;
  readonly dtCache: string;
}

export interface DeviceType {
  readonly name: string;
  readonly description: string;
  readonly type: string;
  readonly dimmable: boolean;
  readonly colorTemp?: boolean;
  readonly broadcastClicks: boolean;
}

export interface OutputDevice {
  readonly uniqueId: string;
  readonly deviceId: string | null;
  readonly name: string;
  readonly type: string;
  readonly typeName: string;
  readonly typeDescription: string;
  readonly dimmable: boolean;
  readonly colorTemp: number | null;
  readonly colorTempSettings: ApiOutputSetting['colorTemperature'] | null;
  readonly bleOutputAddress: number;
  readonly output: number | undefined;
  readonly roomId: string | undefined;
  readonly roomName: string | undefined;
  readonly version: string | undefined;
  state: boolean | undefined;
}

export interface InputDevice {
  readonly uniqueId: string;
  readonly deviceId: string;
  readonly name: string;
  readonly type: string;
  readonly typeName: string;
  readonly typeDescription: string;
  readonly bleInputAddress: number;
  readonly input: number;
  readonly roomId: string;
  readonly version: string;
}

export interface SceneDevice extends Omit<OutputDevice, 'deviceId' | 'dimmable' | 'colorTemp' | 'output' | 'roomId' | 'roomName' | 'version'> {
  readonly deviceId: undefined;
  readonly dimmable: false;
  readonly colorTemp: null;
  readonly output: undefined;
  readonly roomId: undefined;
  readonly roomName: undefined;
  readonly version: undefined;
}

export const enum Command {
  TURN_ON = 'TURN_ON',
  TURN_OFF = 'TURN_OFF',
  DIM = 'DIM',
  COLOR = 'COLOR',
  TRIGGER_SCENE = 'TRIGGER_SCENE',
  BUTTON_CLICK = 'BUTTON_CLICK'
}

export const enum DeviceTypeEnum {
  LIGHT = 'light',
  SWITCH = 'switch',
  SCENE = 'scene',
  DEVICE_AUTOMATION = 'device_automation',
  EXTENDER = 'extender'
}

export const enum MqttState {
  ON = 'ON',
  OFF = 'OFF'
}

export interface CommandData {
  state?: boolean;
  dim?: number;
  color?: number;
  sceneId?: string;
  deviceId?: string;
  deviceInput?: number;
}

export interface BleDevice {
  readonly path: string;
  readonly rssi: number;
  readonly instance: unknown;
  readonly device: ApiDevice;
}

export interface PlejdService {
  readonly addr: Buffer;
}

export interface BleCharacteristics {
  data: unknown | null;
  lastData: unknown | null;
  lastDataProperties: unknown | null;
  auth: unknown | null;
  ping: unknown | null;
}
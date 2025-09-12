import { MqttType, TopicType } from './Mqtt';

export interface MqttTypes {
  LIGHT: MqttType;
  SCENE: MqttType;
  SWITCH: MqttType;
  DEVICE_AUTOMATION: MqttType;
  SENSOR: MqttType;
  EXTENDER: MqttType;
}

export interface TopicTypes {
  CONFIG: TopicType;
  STATE: TopicType;
  AVAILABILITY: TopicType;
  SET: TopicType;
}

export interface MqttState {
  ON: 'ON';
  OFF: 'OFF';
}

export interface DeviceTypes {
  SCENE: 'Scene';
  LIGHT: 'light';
  SWITCH: 'switch';
  SENSOR: 'sensor';
  EXTENDER: 'extender';
}

export interface OutputTypes {
  LIGHT: 'LIGHT';
}

export interface SceneStates {
  ON: 'On';
  OFF: 'Off';
}

export interface Availability {
  ONLINE: 'online';
  OFFLINE: 'offline';
}

export interface AutomationTypes {
  TRIGGER: 'trigger';
  BUTTON_SHORT_PRESS: 'button_short_press';
}

export interface BluezIds {
  SERVICE_NAME: 'org.bluez';
  ADAPTER_ID: 'org.bluez.Adapter1';
  DEVICE_ID: 'org.bluez.Device1';
  GATT_SERVICE_ID: 'org.bluez.GattService1';
  GATT_CHAR_ID: 'org.bluez.GattCharacteristic1';
}

export interface DbusInterface {
  OM_INTERFACE: 'org.freedesktop.DBus.ObjectManager';
  PROP_INTERFACE: 'org.freedesktop.DBus.Properties';
}

export interface ApiEndpoints {
  APP_ID: string;
  BASE_URL: string;
  LOGIN_URL: string;
  SITE_LIST_URL: string;
  SITE_DETAILS_URL: string;
}

export interface BleCommands {
  REMOTE_CLICK: number;
  TIME_UPDATE: number;
  SCENE_TRIGGER: number;
  STATE_CHANGE: number;
  DIM_CHANGE: number;
  COLOR_CHANGE: number;
}

export interface Ble {
  UUID_SUFFIX: string;
  COMMANDS: BleCommands;
  BROADCAST_DEVICE_ID: number;
}

export interface PlejdUuids {
  PLEJD_SERVICE: string;
  LIGHTLEVEL_UUID: string;
  DATA_UUID: string;
  LAST_DATA_UUID: string;
  AUTH_UUID: string;
  PING_UUID: string;
}

export interface Commands {
  TURN_ON: string;
  TURN_OFF: string;
  DIM: string;
  COLOR: string;
  TRIGGER_SCENE: string;
  BUTTON_CLICK: string;
}

export const MQTT_TYPES: MqttTypes;
export const TOPIC_TYPES: TopicTypes;
export const MQTT_STATE: MqttState;
export const DEVICE_TYPES: DeviceTypes;
export const AVAILABILITY: Availability;
export const AUTOMATION_TYPES: AutomationTypes;
export const BLE: Ble;
export const PLEJD_UUIDS: PlejdUuids;
export const COMMANDS: Commands;
export const OUTPUT_TYPES: OutputTypes;
export const SCENE_STATES: SceneStates;
export const BLUEZ: BluezIds;
export const DBUS: DbusInterface;
export const API: ApiEndpoints;

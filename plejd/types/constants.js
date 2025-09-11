/** @type {import('./Mqtt').MQTT_TYPES} */
const MQTT_TYPES = {
  LIGHT: 'light',
  SCENE: 'scene',
  SWITCH: 'switch',
  DEVICE_AUTOMATION: 'device_automation',
  SENSOR: 'sensor',
  EXTENDER: 'extender',
};

/** @type {import('./Mqtt').TOPIC_TYPES} */
const TOPIC_TYPES = {
  CONFIG: 'config',
  STATE: 'state',
  AVAILABILITY: 'availability',
  SET: 'set',
};

const MQTT_STATE = {
  ON: 'ON',
  OFF: 'OFF',
};

const DEVICE_TYPES = {
  SCENE: 'scene',
  LIGHT: 'light',
  SWITCH: 'switch',
  SENSOR: 'sensor',
  EXTENDER: 'extender',
};

const OUTPUT_TYPES = {
  LIGHT: 'LIGHT',
};

const SCENE_STATES = {
  ON: 'On',
  OFF: 'Off',
};

const AVAILABILITY = {
  ONLINE: 'online',
  OFFLINE: 'offline',
};

const AUTOMATION_TYPES = {
  TRIGGER: 'trigger',
  BUTTON_SHORT_PRESS: 'button_short_press',
};

const BLUEZ = {
  SERVICE_NAME: 'org.bluez',
  ADAPTER_ID: 'org.bluez.Adapter1',
  DEVICE_ID: 'org.bluez.Device1',
  GATT_SERVICE_ID: 'org.bluez.GattService1',
  GATT_CHAR_ID: 'org.bluez.GattCharacteristic1',
};

const DBUS = {
  OM_INTERFACE: 'org.freedesktop.DBus.ObjectManager',
  PROP_INTERFACE: 'org.freedesktop.DBus.Properties',
};

const API = {
  APP_ID: 'zHtVqXt8k4yFyk2QGmgp48D9xZr2G94xWYnF4dak',
  BASE_URL: 'https://cloud.plejd.com/parse/',
  LOGIN_URL: 'login',
  SITE_LIST_URL: 'functions/getSiteList',
  SITE_DETAILS_URL: 'functions/getSiteById',
};

// BLE Protocol Constants
const BLE = {
  UUID_SUFFIX: '6085-4726-be45-040c957391b5',
  COMMANDS: {
    REMOTE_CLICK: 0x0016,
    TIME_UPDATE: 0x001b,
    SCENE_TRIGGER: 0x0021,
    STATE_CHANGE: 0x0097,
    DIM_CHANGE: 0x00c8,
    COLOR_CHANGE: 0x0420,
  },
  BROADCAST_DEVICE_ID: 0x01,
};

// Generate UUIDs
const PLEJD_UUIDS = {
  PLEJD_SERVICE: `31ba0001-${BLE.UUID_SUFFIX}`,
  LIGHTLEVEL_UUID: `31ba0003-${BLE.UUID_SUFFIX}`,
  DATA_UUID: `31ba0004-${BLE.UUID_SUFFIX}`,
  LAST_DATA_UUID: `31ba0005-${BLE.UUID_SUFFIX}`,
  AUTH_UUID: `31ba0009-${BLE.UUID_SUFFIX}`,
  PING_UUID: `31ba000a-${BLE.UUID_SUFFIX}`,
};

// Commands from original constants.js
const COMMANDS = {
  TURN_ON: 'Turn on',
  TURN_OFF: 'Turn off',
  DIM: 'Dim',
  COLOR: 'Color',
  TRIGGER_SCENE: 'Trigger scene',
  BUTTON_CLICK: 'Button click',
};

module.exports = {
  MQTT_TYPES,
  TOPIC_TYPES,
  MQTT_STATE,
  DEVICE_TYPES,
  AVAILABILITY,
  AUTOMATION_TYPES,
  BLE,
  PLEJD_UUIDS,
  COMMANDS,
  OUTPUT_TYPES,
  SCENE_STATES,
  BLUEZ,
  DBUS,
  API,
};

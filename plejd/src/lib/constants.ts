export const API = {
  APP_ID: 'zHtVqXt8k4yFyk2QGmgp48D9xZr2G94xWYnF4dak',
  BASE_URL: 'https://cloud.plejd.com/parse/',
  LOGIN_URL: 'login',
  SITE_LIST_URL: 'functions/getSiteList',
  SITE_DETAILS_URL: 'functions/getSiteById'
} as const;

export const PLEJD_UUIDS = {
  PLEJD_SERVICE: '31ba0001-6085-4726-be45-040c957391b5',
  DATA_UUID: '31ba0004-6085-4726-be45-040c957391b5',
  LAST_DATA_UUID: '31ba0005-6085-4726-be45-040c957391b5',
  AUTH_UUID: '31ba0009-6085-4726-be45-040c957391b5',
  PING_UUID: '31ba000a-6085-4726-be45-040c957391b5'
} as const;

export const BLE = {
  COMMANDS: {
    STATE_CHANGE: 0x0097,
    DIM_CHANGE: 0x0098,
    DIM2_CHANGE: 0x0098,
    COLOR_CHANGE: 0x001b,
    SCENE_TRIGGER: 0x0021,
    REMOTE_CLICK: 0x0016,
    TIME_UPDATE: 0x001b
  },
  BROADCAST_DEVICE_ID: 0x01,
  REQUEST_NO_RESPONSE: 0x0110,
  REQUEST_RESPONSE: 0x0102
} as const;

export const BLUEZ = {
  SERVICE_NAME: 'org.bluez',
  ADAPTER_ID: 'org.bluez.Adapter1',
  DEVICE_ID: 'org.bluez.Device1',
  GATT_SERVICE_ID: 'org.bluez.GattService1',
  GATT_CHAR_ID: 'org.bluez.GattCharacteristic1'
} as const;

export const DBUS = {
  OM_INTERFACE: 'org.freedesktop.DBus.ObjectManager',
  PROP_INTERFACE: 'org.freedesktop.DBus.Properties'
} as const;

export const TRAITS = {
  NO_LOAD: 0,
  NON_DIMMABLE: 9,
  DIMMABLE: 11,
  DIMMABLE_COLORTEMP: 15
} as const;

export const PAYLOAD_OFFSETS = {
  POSITION: 5,
  DIM_LEVEL: 7,
  COLOR_TEMP: 9
} as const;

export const DEVICE_HARDWARE_IDS = {
  DIM_01: [1, 14, 22],
  DIM_02: [2, 15],
  CTR_01: [3],
  LED_10: [5],
  WPH_01: [6],
  REL_01: [7],
  SPR_01: [8, 20],
  WRT_01: [10],
  DIM_01_2P: [11],
  DAL_01: [12],
  REL_01_2P: [17],
  REL_02: [18],
  EXT_01: [19],
  LED_75: [36],
  OUT_02: [135],
  DWN_01: [167],
  DWN_02: [199]
} as const;
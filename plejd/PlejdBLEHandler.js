const dbus = require('dbus-next');
const crypto = require('crypto');
const xor = require('buffer-xor');
const { EventEmitter } = require('events');

const Configuration = require('./Configuration');
const constants = require('./constants');
const Logger = require('./Logger');

const { COMMANDS } = constants;
const logger = Logger.getLogger('plejd-ble');

// UUIDs
const BLE_UUID_SUFFIX = '6085-4726-be45-040c957391b5';
const PLEJD_SERVICE = `31ba0001-${BLE_UUID_SUFFIX}`;
const DATA_UUID = `31ba0004-${BLE_UUID_SUFFIX}`;
const LAST_DATA_UUID = `31ba0005-${BLE_UUID_SUFFIX}`;
const AUTH_UUID = `31ba0009-${BLE_UUID_SUFFIX}`;
const PING_UUID = `31ba000a-${BLE_UUID_SUFFIX}`;

const BLE_CMD_DIM_CHANGE = 0x00c8;
const BLE_CMD_DIM2_CHANGE = 0x0098;
const BLE_CMD_STATE_CHANGE = 0x0097;
const BLE_CMD_SCENE_TRIG = 0x0021;
const BLE_CMD_TIME_UPDATE = 0x001b;
const BLE_CMD_REMOTE_CLICK = 0x0016;

const BLE_BROADCAST_DEVICE_ID = 0x01;
const BLE_REQUEST_NO_RESPONSE = 0x0110;
const BLE_REQUEST_RESPONSE = 0x0102;
// const BLE_REQUEST_READ_VALUE = 0x0103;

const BLUEZ_SERVICE_NAME = 'org.bluez';
const DBUS_OM_INTERFACE = 'org.freedesktop.DBus.ObjectManager';
const DBUS_PROP_INTERFACE = 'org.freedesktop.DBus.Properties';

const BLUEZ_ADAPTER_ID = 'org.bluez.Adapter1';
const BLUEZ_DEVICE_ID = 'org.bluez.Device1';
const GATT_SERVICE_ID = 'org.bluez.GattService1';
const GATT_CHRC_ID = 'org.bluez.GattCharacteristic1';

const PAYLOAD_POSITION_OFFSET = 5;
const DIM_LEVEL_POSITION_OFFSET = 7;

const delay = (timeout) => new Promise((resolve) => setTimeout(resolve, timeout));

class PlejBLEHandler extends EventEmitter {
  adapter;
  adapterProperties;
  config;
  bleDevices = [];
  bus = null;
  /** @type {import('types/ApiSite').Device} */
  connectedDevice = null;
  /** @type Number? */
  connectedDeviceId = null;
  consecutiveWriteFails;
  consecutiveReconnectAttempts = 0;
  /** @type {import('./DeviceRegistry')} */
  deviceRegistry;
  discoveryTimeout = null;
  plejdService = null;
  pingRef = null;
  requestCurrentPlejdTimeRef = null;
  reconnectInProgress = false;
  emergencyReconnectTimeout = null;

  // Refer to BLE-states.md regarding the internal BLE/bluez state machine of Bluetooth states
  // These states refer to the state machine of this file
  static STATES = ['MAIN_INIT', 'GET_ADAPTER_PROXY'];

  static EVENTS = {
    connected: 'connected',
    reconnecting: 'reconnecting',
    commandReceived: 'commandReceived',
    writeFailed: 'writeFailed',
    writeSuccess: 'writeSuccess',
  };

  constructor(deviceRegistry) {
    super();

    logger.info('Starting Plejd BLE Handler, resetting all device states.');

    this.config = Configuration.getOptions();
    this.deviceRegistry = deviceRegistry;

    // Holds a reference to all characteristics
    this.characteristics = {
      data: null,
      lastData: null,
      lastDataProperties: null,
      auth: null,
      ping: null,
    };

    this.bus = dbus.systemBus();
  }

  cleanup() {
    logger.verbose('cleanup() - Clearing ping interval and clock update timer');
    clearInterval(this.pingRef);
    clearTimeout(this.requestCurrentPlejdTimeRef);

    logger.verbose('Removing listeners to write events, bus events and objectManager...');

    this.removeAllListeners(PlejBLEHandler.EVENTS.writeFailed);
    this.removeAllListeners(PlejBLEHandler.EVENTS.writeSuccess);

    if (this.bus) {
      this.bus.removeAllListeners('error');
      this.bus.removeAllListeners('connect');
    }
    if (this.characteristics.lastDataProperties) {
      this.characteristics.lastDataProperties.removeAllListeners('PropertiesChanged');
    }
    if (this.objectManager) {
      this.objectManager.removeAllListeners('InterfacesAdded');
    }
  }

  async init() {
    logger.info('init()');

    this.on(PlejBLEHandler.EVENTS.writeFailed, (error) => this._onWriteFailed(error));
    this.on(PlejBLEHandler.EVENTS.writeSuccess, () => this._onWriteSuccess());

    this.bus.on('error', (err) => {
      // Uncaught error events will show UnhandledPromiseRejection logs
      logger.verbose(`dbus-next error event: ${err.message}`);
    });
    this.bus.on('connect', () => {
      logger.verbose('dbus-next connected');
    });
    // this.bus also has a 'message' event that gets emitted _very_ frequently

    this.adapter = null;
    this.adapterProperties = null;
    this.consecutiveWriteFails = 0;

    this.cryptoKey = Buffer.from(this.deviceRegistry.cryptoKey.replace(/-/g, ''), 'hex');

    if (this.objectManager) {
      this.objectManager.removeAllListeners();
    }

    this.bleDevices = [];
    this.connectedDevice = null;
    this.connectedDeviceId = null;

    this.characteristics = {
      data: null,
      lastData: null,
      lastDataProperties: null,
      auth: null,
      ping: null,
    };

    await this._getInterface();
    await this._startGetPlejdDevice();

    logger.info('BLE init done, waiting for devices.');
  }

  /**
   * @param {string} command
   * @param {number} bleOutputAddress
   * @param {number} data
   */
  async sendCommand(command, bleOutputAddress, data) {
    let payload;
    let brightnessVal;
    switch (command) {
      case COMMANDS.TURN_ON:
        payload = this._createHexPayload(bleOutputAddress, BLE_CMD_STATE_CHANGE, '01');
        break;
      case COMMANDS.TURN_OFF:
        payload = this._createHexPayload(bleOutputAddress, BLE_CMD_STATE_CHANGE, '00');
        break;
      case COMMANDS.DIM:
        // eslint-disable-next-line no-bitwise
        brightnessVal = (data << 8) | data;
        payload = this._createHexPayload(
          bleOutputAddress,
          BLE_CMD_DIM2_CHANGE,
          `01${brightnessVal.toString(16).padStart(4, '0')}`,
        );
        break;
      default:
        logger.error(`Unknown command ${command}`);
        throw new Error(`Unknown command ${command}`);
    }
    await this._write(payload);
  }

  async _initDiscoveredPlejdDevice(path) {
    logger.debug(`initDiscoveredPlejdDevice(). Got ${path} device`);

    logger.debug(`Inspecting ${path}`);

    try {
      const proxyObject = await this.bus.getProxyObject(BLUEZ_SERVICE_NAME, path);
      const device = await proxyObject.getInterface(BLUEZ_DEVICE_ID);
      const properties = await proxyObject.getInterface(DBUS_PROP_INTERFACE);

      const plejd = { path };

      plejd.rssi = (await properties.Get(BLUEZ_DEVICE_ID, 'RSSI')).value;
      plejd.instance = device;

      const segments = plejd.path.split('/');
      let plejdSerialNumber = segments[segments.length - 1].replace('dev_', '');
      plejdSerialNumber = plejdSerialNumber.replace(/_/g, '');
      plejd.device = this.deviceRegistry.getPhysicalDevice(plejdSerialNumber);

      if (plejd.device) {
        logger.debug(
          `Discovered ${plejd.path} with rssi ${plejd.rssi} dBm, name ${plejd.device.name}`,
        );
        this.bleDevices.push(plejd);
      } else {
        logger.warn(`Device registry does not contain device with serial ${plejdSerialNumber}`);
      }
    } catch (err) {
      logger.error(`Failed inspecting ${path}. `, err);
    }
  }

  async _inspectDevicesDiscovered() {
    try {
      if (this.bleDevices.length === 0) {
        logger.error('Discovery timeout elapsed, no devices found. Starting reconnect loop...');
        throw new Error('Discovery timeout elapsed');
      }

      logger.info(`Device discovery done, found ${this.bleDevices.length} Plejd devices`);

      const sortedDevices = this.bleDevices.sort((a, b) => b.rssi - a.rssi);

      // eslint-disable-next-line no-restricted-syntax
      for (const plejd of sortedDevices) {
        try {
          logger.verbose(`Inspecting ${plejd.path}`);
          if (plejd.instance) {
            logger.info(`Connecting to ${plejd.path}`);
            // eslint-disable-next-line no-await-in-loop
            await plejd.instance.Connect();

            logger.verbose('Connected. Waiting for timeout before reading characteristics...');
            // eslint-disable-next-line no-await-in-loop
            await delay(this.config.connectionTimeout * 1000);

            // eslint-disable-next-line no-await-in-loop
            const deviceWasConnected = await this._onDeviceConnected(plejd);
            if (deviceWasConnected) {
              break;
            }
          }
        } catch (err) {
          logger.warn('Unable to connect. ', err);
        }
      }

      try {
        logger.verbose('Stopping discovery...');
        await this.adapter.StopDiscovery();
        logger.verbose('Stopped BLE discovery');
      } catch (err) {
        logger.error('Failed to stop discovery.', err);
        if (err.message.includes('Operation already in progress')) {
          logger.info(
            'If you continue to get "operation already in progress" error, you can try power cycling the bluetooth adapter. Get root console access, run "bluetoothctl" => "power off" => "power on" => "exit" => restart addon.',
          );
          try {
            await delay(250);
            logger.verbose('Power cycling...');
            await this._powerCycleAdapter();
            logger.verbose('Trying again...');
            await this._startGetPlejdDevice();
          } catch (errInner) {
            logger.error('Failed to retry internalInit. Starting reconnect loop', errInner);
            throw new Error('Failed to retry internalInit');
          }
        }
        logger.error('Failed to start discovery. Make sure no other add-on is currently scanning.');
        throw new Error('Failed to start discovery');
      }

      if (!this.connectedDevice) {
        logger.error('Could not connect to any Plejd device. Starting reconnect loop...');
        throw new Error('Could not connect to any Plejd device');
      }

      logger.info(`BLE Connected to ${this.connectedDevice.title}`);

      // Connected and authenticated, request current time and start ping
      if (this.config.updatePlejdClock) {
        this._requestCurrentPlejdTime();
      } else {
        logger.info('Plejd clock updates disabled in configuration.');
      }
      this._startPing();

      // After we've authenticated, we need to hook up the event listener
      // for changes to lastData.
      this.characteristics.lastDataProperties.on('PropertiesChanged', (
        iface,
        properties,
        // invalidated (third param),
      ) => this._onLastDataUpdated(iface, properties));
      this.characteristics.lastData.StartNotify();
      this.consecutiveReconnectAttempts = 0;
      this.emit(PlejBLEHandler.EVENTS.connected);

      clearTimeout(this.emergencyReconnectTimeout);
      this.emergencyReconnectTimeout = null;
    } catch (err) {
      // This method is run on a timer, so errors can't e re-thrown.
      // Start reconnect loop if errors occur here
      logger.debug(`Starting reconnect loop due to ${err.message}`);
      this.startReconnectPeriodicallyLoop();
    }
  }

  async _getInterface() {
    const bluez = await this.bus.getProxyObject(BLUEZ_SERVICE_NAME, '/');

    this.objectManager = await bluez.getInterface(DBUS_OM_INTERFACE);

    // We need to find the ble interface which implements the Adapter1 interface
    const managedObjects = await this.objectManager.GetManagedObjects();
    const managedPaths = Object.keys(managedObjects);

    logger.verbose(`Managed paths${JSON.stringify(managedPaths, null, 2)}`);

    // eslint-disable-next-line no-restricted-syntax
    for (const path of managedPaths) {
      const pathInterfaces = Object.keys(managedObjects[path]);
      if (pathInterfaces.indexOf(BLUEZ_ADAPTER_ID) > -1) {
        logger.debug(`Found BLE interface '${BLUEZ_ADAPTER_ID}' at ${path}`);
        try {
          // eslint-disable-next-line no-await-in-loop
          const adapterObject = await this.bus.getProxyObject(BLUEZ_SERVICE_NAME, path);
          // eslint-disable-next-line no-await-in-loop
          this.adapterProperties = await adapterObject.getInterface(DBUS_PROP_INTERFACE);
          // eslint-disable-next-line no-await-in-loop
          await this._powerOnAdapter();
          this.adapter = adapterObject.getInterface(BLUEZ_ADAPTER_ID);
          // eslint-disable-next-line no-await-in-loop
          await this._cleanExistingConnections(managedObjects);

          logger.verbose(`Got adapter ${this.adapter.path}`);

          return this.adapter;
        } catch (err) {
          logger.error(`Failed to get interface '${BLUEZ_ADAPTER_ID}'. `, err);
        }
      }
    }

    this.adapter = null;
    logger.error('Unable to find a bluetooth adapter that is compatible.');
    throw new Error('Unable to find a bluetooth adapter that is compatible.');
  }

  async _powerCycleAdapter() {
    logger.verbose('Power cycling BLE adapter');
    await this._powerOffAdapter();
    await this._powerOnAdapter();
  }

  async _powerOnAdapter() {
    logger.verbose('Powering on BLE adapter and waiting 5 seconds');
    await this.adapterProperties.Set(BLUEZ_ADAPTER_ID, 'Powered', new dbus.Variant('b', 1));
    await delay(5000);
  }

  async _powerOffAdapter() {
    logger.verbose('Powering off BLE adapter and waiting 30 seconds');
    await this.adapterProperties.Set(BLUEZ_ADAPTER_ID, 'Powered', new dbus.Variant('b', 0));
    await delay(30000);
  }

  async _cleanExistingConnections(managedObjects) {
    logger.verbose(
      `Iterating ${
        Object.keys(managedObjects).length
      } BLE managedObjects looking for ${BLUEZ_DEVICE_ID}`,
    );

    // eslint-disable-next-line no-restricted-syntax
    for (const path of Object.keys(managedObjects)) {
      /* eslint-disable no-await-in-loop */
      try {
        const interfaces = Object.keys(managedObjects[path]);

        if (interfaces.indexOf(BLUEZ_DEVICE_ID) > -1) {
          const proxyObject = await this.bus.getProxyObject(BLUEZ_SERVICE_NAME, path);
          const device = await proxyObject.getInterface(BLUEZ_DEVICE_ID);

          logger.verbose(`Found ${path}`);

          const connected = managedObjects[path][BLUEZ_DEVICE_ID].Connected.value;

          if (connected) {
            logger.info(`disconnecting ${path}. This can take up to 180 seconds`);
            await device.Disconnect();
          }

          logger.verbose(`Removing ${path} from adapter.`);
          await this.adapter.RemoveDevice(path);
        }
      } catch (err) {
        logger.error(`Error handling ${path}`, err);
      }
      /* eslint-enable no-await-in-loop */
    }

    logger.verbose('All active BLE device connections cleaned up.');
  }

  async _startGetPlejdDevice() {
    logger.verbose('Setting up interfacesAdded subscription and discovery filter');
    this.objectManager.on('InterfacesAdded', (path, interfaces) =>
      this._onInterfacesAdded(path, interfaces),
    );

    this.adapter.SetDiscoveryFilter({
      UUIDs: new dbus.Variant('as', [PLEJD_SERVICE]),
      Transport: new dbus.Variant('s', 'le'),
    });

    try {
      logger.verbose('Starting BLE discovery... This can take up to 180 seconds.');
      this._scheduleInternalInit();
      await this.adapter.StartDiscovery();
      logger.verbose('Started BLE discovery');
    } catch (err) {
      logger.error('Failed to start discovery.', err);
      if (err.message.includes('Operation already in progress')) {
        logger.info(
          'If you continue to get "operation already in progress" error, you can try power cycling the bluetooth adapter. Get root console access, run "bluetoothctl" => "power off" => "power on" => "exit" => restart addon.',
        );
      }
      throw new Error(
        'Failed to start discovery. Make sure no other add-on is currently scanning.',
      );
    }
  }

  _scheduleInternalInit() {
    clearTimeout(this.discoveryTimeout);
    this.discoveryTimeout = setTimeout(
      () => this._inspectDevicesDiscovered(),
      this.config.connectionTimeout * 1000,
    );
  }

  async _onInterfacesAdded(path, interfaces) {
    logger.silly(`Interface added ${path}, inspecting...`);
    const interfaceKeys = Object.keys(interfaces);

    if (interfaceKeys.indexOf(BLUEZ_DEVICE_ID) > -1) {
      if (interfaces[BLUEZ_DEVICE_ID].UUIDs.value.indexOf(PLEJD_SERVICE) > -1) {
        logger.debug(`Found Plejd service on ${path}`);
        this.objectManager.removeAllListeners('InterfacesAdded');
        await this._initDiscoveredPlejdDevice(path);
      } else {
        logger.error('Uh oh, no Plejd device!');
      }
    } else {
      logger.silly('Not the right device id');
    }
  }

  async _authenticate() {
    logger.info('authenticate()');

    try {
      logger.debug('Sending challenge to device');
      await this.characteristics.auth.WriteValue([0], {});
      logger.debug('Reading response from device');
      const challenge = await this.characteristics.auth.ReadValue({});
      const response = this._createChallengeResponse(this.cryptoKey, Buffer.from(challenge));
      logger.debug('Responding to authenticate');
      await this.characteristics.auth.WriteValue([...response], {});
    } catch (err) {
      logger.error('Failed to authenticate: ', err);
      throw new Error('Failed to authenticate');
    }
  }

  async startReconnectPeriodicallyLoop() {
    logger.info('Starting reconnect loop...');
    clearTimeout(this.emergencyReconnectTimeout);
    this.emergencyReconnectTimeout = null;
    await this._startReconnectPeriodicallyLoopInternal();
  }

  async _startReconnectPeriodicallyLoopInternal() {
    logger.verbose('Starting internal reconnect loop...');

    if (this.reconnectInProgress && !this.emergencyReconnectTimeout) {
      logger.debug('Reconnect already in progress. Skipping this call.');
      return;
    }
    if (this.emergencyReconnectTimeout) {
      logger.warn(
        'Restarting reconnect loop due to emergency reconnect timer elapsed. This should very rarely happen!',
      );
    }

    this.reconnectInProgress = true;

    /* eslint-disable no-await-in-loop */
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        logger.verbose('Reconnect: Clean up, emit reconnect event, wait 5s and the re-init...');
        this.cleanup();

        this.consecutiveReconnectAttempts++;

        if (this.consecutiveReconnectAttempts % 100 === 0) {
          logger.error('Failed reconnecting 100 times. Creating a new dbus instance...');
          this.bus = dbus.systemBus();
        }

        if (this.consecutiveReconnectAttempts % 10 === 0) {
          logger.warn(
            `Tried reconnecting ${this.consecutiveReconnectAttempts} times. Will power cycle the BLE adapter now...`,
          );
          await this._powerCycleAdapter();
        } else {
          logger.verbose(
            `Reconnect attempt ${this.consecutiveReconnectAttempts} in a row. Will power cycle every 10th time.`,
          );
        }

        this.emit(PlejBLEHandler.EVENTS.reconnecting);

        // Emergency 2 minute timer if reconnect silently fails somewhere
        clearTimeout(this.emergencyReconnectTimeout);
        this.emergencyReconnectTimeout = setTimeout(
          () => this._startReconnectPeriodicallyLoopInternal(),
          120 * 1000,
        );

        await delay(5000);
        logger.info('Reconnecting BLE...');
        await this.init();
        break;
      } catch (err) {
        logger.warn('Failed reconnecting.', err);
      }
    }
    /* eslint-enable no-await-in-loop */

    this.reconnectInProgress = false;
  }

  async _write(payload) {
    if (!payload || !this.plejdService || !this.characteristics.data) {
      logger.debug('data, plejdService or characteristics not available. Cannot write()');
      throw new Error('data, plejdService or characteristics not available. Cannot write()');
    }

    try {
      logger.verbose(
        `Sending ${payload.length} byte(s) of data to Plejd. ${payload.toString('hex')}`,
      );
      const encryptedData = this._encryptDecrypt(this.cryptoKey, this.plejdService.addr, payload);
      await this.characteristics.data.WriteValue([...encryptedData], {});
      await this._onWriteSuccess();
    } catch (err) {
      await this._onWriteFailed(err);
      if (err.message === 'In Progress') {
        logger.debug("Write failed due to 'In progress' ", err);
        throw new Error("Write failed due to 'In progress'");
      }
      logger.debug('Write failed ', err);
      throw new Error(`Write failed due to ${err.message}`);
    }
  }

  _startPing() {
    logger.info('startPing()');
    clearInterval(this.pingRef);

    this.pingRef = setInterval(async () => {
      logger.silly('ping');
      await this._ping();
    }, 3000);
  }

  // eslint-disable-next-line class-methods-use-this
  _onWriteSuccess() {
    this.consecutiveWriteFails = 0;
  }

  async _onWriteFailed(error) {
    this.consecutiveWriteFails++;
    logger.debug(`onWriteFailed #${this.consecutiveWriteFails} in a row.`, error);
    logger.verbose(`Error message: ${error.message}`);

    let errorIndicatesDisconnected = false;

    if (error.message.includes('error: 0x0e')) {
      logger.error("'Unlikely error' (0x0e) writing to Plejd. Will retry.", error);
    } else if (error.message.includes('Not connected')) {
      logger.error("'Not connected' writing to Plejd. Plejd device is probably disconnected.");
      errorIndicatesDisconnected = true;
    } else if (error.message.includes('Method "WriteValue" with signature')) {
      logger.error("'Method \"WriteValue\" doesn't exist'. Plejd device is probably disconnected.");
      errorIndicatesDisconnected = true;
    }

    if (errorIndicatesDisconnected || this.consecutiveWriteFails >= 5) {
      logger.warn(
        `Write error indicates BLE is disconnected. Retry count ${this.consecutiveWriteFails}. Reconnecting...`,
      );
      this.startReconnectPeriodicallyLoop();
    }
  }

  async _ping() {
    logger.silly('ping()');

    const ping = crypto.randomBytes(1);
    let pong = null;

    try {
      await this.characteristics.ping.WriteValue([...ping], {});
      pong = await this.characteristics.ping.ReadValue({});
    } catch (err) {
      logger.verbose(`Error pinging Plejd, calling onWriteFailed... ${err.message}`);
      await this._onWriteFailed(err);
      return;
    }

    // eslint-disable-next-line no-bitwise
    if (((ping[0] + 1) & 0xff) !== pong[0]) {
      logger.verbose('Plejd ping failed, pong contains wrong data. Calling onWriteFailed...');
      await this._onWriteFailed(new Error(`plejd ping failed ${ping[0]} - ${pong[0]}`));
      return;
    }

    logger.silly(`pong: ${pong[0]}`);
    await this._onWriteSuccess();
  }

  async _requestCurrentPlejdTime() {
    if (!this.connectedDevice) {
      logger.warn('Cannot request current Plejd time, not connected.');
      return;
    }
    logger.info('Requesting current Plejd time...');

    const payload = this._createHexPayload(
      this.connectedDevice.id,
      BLE_CMD_TIME_UPDATE,
      '',
      BLE_REQUEST_RESPONSE,
    );
    try {
      this._write(payload);
    } catch (error) {
      logger.warn('Failed requesting time update from Plejd');
    }

    clearTimeout(this.requestCurrentPlejdTimeRef);
    this.requestCurrentPlejdTimeRef = setTimeout(
      () => this._requestCurrentPlejdTime(),
      1000 * 3600,
    ); // Once per hour
  }

  async _processPlejdService(path, characteristics) {
    const proxyObject = await this.bus.getProxyObject(BLUEZ_SERVICE_NAME, path);
    const properties = await proxyObject.getInterface(DBUS_PROP_INTERFACE);

    const uuid = (await properties.Get(GATT_SERVICE_ID, 'UUID')).value;
    if (uuid !== PLEJD_SERVICE) {
      logger.error('not a Plejd device.');
      return null;
    }

    const dev = (await properties.Get(GATT_SERVICE_ID, 'Device')).value;
    const regex = /dev_([0-9A-F_]+)$/;
    const dirtyAddr = regex.exec(dev);
    const addr = this._reverseBuffer(
      Buffer.from(
        String(dirtyAddr[1]).replace(/-/g, '').replace(/_/g, '').replace(/:/g, ''),
        'hex',
      ),
    );

    // eslint-disable-next-line no-restricted-syntax
    for (const chPath of characteristics) {
      /* eslint-disable no-await-in-loop */
      const chProxyObject = await this.bus.getProxyObject(BLUEZ_SERVICE_NAME, chPath);
      const ch = await chProxyObject.getInterface(GATT_CHRC_ID);
      const prop = await chProxyObject.getInterface(DBUS_PROP_INTERFACE);

      const chUuid = (await prop.Get(GATT_CHRC_ID, 'UUID')).value;

      if (chUuid === DATA_UUID) {
        logger.verbose('found DATA characteristic.');
        this.characteristics.data = ch;
      } else if (chUuid === LAST_DATA_UUID) {
        logger.verbose('found LAST_DATA characteristic.');
        this.characteristics.lastData = ch;
        this.characteristics.lastDataProperties = prop;
      } else if (chUuid === AUTH_UUID) {
        logger.verbose('found AUTH characteristic.');
        this.characteristics.auth = ch;
      } else if (chUuid === PING_UUID) {
        logger.verbose('found PING characteristic.');
        this.characteristics.ping = ch;
      }
      /* eslint-eslint no-await-in-loop */
    }

    return {
      addr,
    };
  }

  async _onDeviceConnected(device) {
    this.connectedDevice = null;
    logger.info('onDeviceConnected()');
    logger.debug(`Device ${device.path}, ${JSON.stringify(device.device)}`);

    const objects = await this.objectManager.GetManagedObjects();
    const paths = Object.keys(objects);
    const characteristics = [];

    logger.verbose(`Iterating connected devices looking for ${GATT_CHRC_ID}`);
    // eslint-disable-next-line no-restricted-syntax
    for (const path of paths) {
      const interfaces = Object.keys(objects[path]);
      logger.verbose(`Interfaces ${path}: ${JSON.stringify(interfaces)}`);
      if (interfaces.indexOf(GATT_CHRC_ID) > -1) {
        characteristics.push(path);
      }
    }

    logger.verbose(`Characteristics found: ${JSON.stringify(characteristics)}`);
    // eslint-disable-next-line no-restricted-syntax
    for (const path of paths) {
      const interfaces = Object.keys(objects[path]);
      if (interfaces.indexOf(GATT_SERVICE_ID) > -1) {
        const chPaths = [];
        // eslint-disable-next-line no-restricted-syntax
        for (const c of characteristics) {
          if (c.startsWith(`${path}/`)) {
            chPaths.push(c);
          }
        }

        logger.verbose(`Trying ${chPaths.length} characteristics on ${path}...`);

        this.plejdService = await this._processPlejdService(path, chPaths);
        if (this.plejdService) {
          break;
        }
      }
    }

    if (!this.plejdService) {
      logger.warn("Wasn't able to connect to Plejd, will retry.");
      return null;
    }

    if (!this.characteristics.auth) {
      logger.error('unable to enumerate characteristics.');
      return null;
    }

    this.connectedDevice = device.device;
    this.connectedDeviceId = this.deviceRegistry.getMainBleIdByDeviceId(
      this.connectedDevice.deviceId,
    );

    logger.verbose('The connected Plejd device has the right charecteristics!');
    logger.info(
      `Connected to Plejd device ${this.connectedDevice.title} (${this.connectedDevice.deviceId}, BLE id ${this.connectedDeviceId}).`,
    );

    await this._authenticate();

    return this.connectedDevice;
  }

  // eslint-disable-next-line no-unused-vars
  async _onLastDataUpdated(iface, properties) {
    if (iface !== GATT_CHRC_ID) {
      return;
    }

    const changedKeys = Object.keys(properties);
    if (changedKeys.length === 0) {
      return;
    }

    const value = await properties.Value;
    if (!value) {
      return;
    }

    const encryptedData = value.value;
    const decoded = this._encryptDecrypt(this.cryptoKey, this.plejdService.addr, encryptedData);

    if (decoded.length < PAYLOAD_POSITION_OFFSET) {
      if (Logger.shouldLog('debug')) {
        // decoded.toString() could potentially be expensive
        logger.verbose(`Too short raw event ignored: ${decoded.toString('hex')}`);
      }
      // ignore the notification since too small
      return;
    }

    const bleOutputAddress = decoded.readUInt8(0);
    // Bytes 2-3 is Command/Request
    const cmd = decoded.readUInt16BE(3);

    const state =
      decoded.length > PAYLOAD_POSITION_OFFSET ? decoded.readUInt8(PAYLOAD_POSITION_OFFSET) : 0;

    const dim =
      decoded.length > DIM_LEVEL_POSITION_OFFSET ? decoded.readUInt8(DIM_LEVEL_POSITION_OFFSET) : 0;

    if (Logger.shouldLog('silly')) {
      // Full dim level is 2 bytes, we could potentially use this
      const dimFull =
        decoded.length > DIM_LEVEL_POSITION_OFFSET
          ? decoded.readUInt16LE(DIM_LEVEL_POSITION_OFFSET - 1)
          : 0;
      logger.silly(`Dim: ${dim.toString(16)}, full precision: ${dimFull.toString(16)}`);
    }

    const device = this.deviceRegistry.getOutputDeviceByBleOutputAddress(bleOutputAddress);
    const deviceName = device ? device.name : 'Unknown';
    const outputUniqueId = device ? device.uniqueId : null;

    if (Logger.shouldLog('verbose')) {
      // decoded.toString() could potentially be expensive
      logger.verbose(`Raw event received: ${decoded.toString('hex')}`);
      logger.verbose(
        `Decoded: Device ${outputUniqueId} (BLE address ${bleOutputAddress}), cmd ${cmd.toString(
          16,
        )}, state ${state}, dim ${dim}`,
      );
    }

    let command;
    let data = {};
    if (cmd === BLE_CMD_DIM_CHANGE || cmd === BLE_CMD_DIM2_CHANGE) {
      logger.debug(
        `${deviceName} (${outputUniqueId}) got state+dim update. S: ${state}, D: ${dim}`,
      );

      command = COMMANDS.DIM;
      data = { state, dim };
      this.emit(PlejBLEHandler.EVENTS.commandReceived, outputUniqueId, command, data);
    } else if (cmd === BLE_CMD_STATE_CHANGE) {
      logger.debug(`${deviceName} (${outputUniqueId}) got state update. S: ${state}`);
      command = state ? COMMANDS.TURN_ON : COMMANDS.TURN_OFF;
      this.emit(PlejBLEHandler.EVENTS.commandReceived, outputUniqueId, command, data);
    } else if (cmd === BLE_CMD_SCENE_TRIG) {
      const sceneBleAddress = state;
      const scene = this.deviceRegistry.getSceneByBleAddress(sceneBleAddress);

      if (!scene) {
        logger.warn(
          `Scene with BLE address ${sceneBleAddress} could not be found, can't process message`,
        );
        return;
      }

      logger.debug(
        `${scene.name} (${sceneBleAddress}) scene triggered (device id ${outputUniqueId}).`,
      );

      command = COMMANDS.TRIGGER_SCENE;
      data = { sceneId: scene.uniqueId };
      this.emit(PlejBLEHandler.EVENTS.commandReceived, outputUniqueId, command, data);
    } else if (cmd === BLE_CMD_TIME_UPDATE) {
      if (decoded.length < PAYLOAD_POSITION_OFFSET + 4) {
        if (Logger.shouldLog('debug')) {
          // decoded.toString() could potentially be expensive
          logger.verbose(`Too short time update event ignored: ${decoded.toString('hex')}`);
        }
        // ignore the notification since too small
        return;
      }

      const now = new Date();
      // Guess Plejd timezone based on HA time zone
      const offsetSecondsGuess = now.getTimezoneOffset() * 60 + 250; // Todo: 4 min off

      // Plejd reports local unix timestamp adjust to local time zone
      const plejdTimestampUTC =
        (decoded.readInt32LE(PAYLOAD_POSITION_OFFSET) + offsetSecondsGuess) * 1000;
      const diffSeconds = Math.round((plejdTimestampUTC - now.getTime()) / 1000);
      if (
        bleOutputAddress !== BLE_BROADCAST_DEVICE_ID ||
        Logger.shouldLog('verbose') ||
        Math.abs(diffSeconds) > 60
      ) {
        const plejdTime = new Date(plejdTimestampUTC);
        logger.debug(
          `Plejd clock time update ${plejdTime.toString()}, diff ${diffSeconds} seconds`,
        );
        if (this.config.updatePlejdClock && Math.abs(diffSeconds) > 60) {
          logger.warn(
            `Plejd clock time off by more than 1 minute. Reported time: ${plejdTime.toString()}, diff ${diffSeconds} seconds. Time will be set hourly.`,
          );
          if (this.connectedDevice && bleOutputAddress === this.connectedDeviceId) {
            // Requested time sync by us
            const newLocalTimestamp = now.getTime() / 1000 - offsetSecondsGuess;
            logger.info(`Setting time to ${now.toString()}`);
            const payload = this._createPayload(
              this.connectedDeviceId,
              BLE_CMD_TIME_UPDATE,
              10,
              (pl) => pl.writeInt32LE(Math.trunc(newLocalTimestamp), PAYLOAD_POSITION_OFFSET),
            );
            try {
              this._write(payload);
            } catch (err) {
              logger.error(
                'Failed writing new time to Plejd. Will try again in one hour or at restart.',
              );
            }
          }
        } else if (bleOutputAddress !== BLE_BROADCAST_DEVICE_ID) {
          logger.info('Got time response. Plejd clock time in sync with Home Assistant time');
        }
      }
    } else if (cmd === BLE_CMD_REMOTE_CLICK) {
      const inputBleAddress = state;
      const inputButton = decoded.length > 7 ? decoded.readUInt8(6) : 0;

      const sourceDevice = this.deviceRegistry.getInputDeviceByBleInputAddress(
        inputBleAddress,
        inputButton,
      );
      if (!sourceDevice) {
        logger.warn(
          `Scene with BLE address ${inputBleAddress} could not be found, can't process message`,
        );
        return;
      }
      logger.verbose(
        `A button (eg. WPH-01, WRT-01) ${inputButton} at BLE address ${inputBleAddress} was pressed. Unique Id is ${sourceDevice.uniqueId}`,
      );
      command = COMMANDS.BUTTON_CLICK;
      data = { deviceId: sourceDevice.deviceId, deviceInput: sourceDevice.input };
      this.emit(PlejBLEHandler.EVENTS.commandReceived, outputUniqueId, command, data);
    } else {
      logger.verbose(
        `Command ${cmd.toString(16)} unknown. ${decoded.toString(
          'hex',
        )}. Device ${deviceName} (${bleOutputAddress}: ${outputUniqueId})`,
      );
    }
  }

  _createHexPayload(
    bleOutputAddress,
    command,
    hexDataString,
    requestResponseCommand = BLE_REQUEST_NO_RESPONSE,
  ) {
    return this._createPayload(
      bleOutputAddress,
      command,
      PAYLOAD_POSITION_OFFSET + Math.ceil(hexDataString.length / 2),
      (payload) => payload.write(hexDataString, PAYLOAD_POSITION_OFFSET, 'hex'),
      requestResponseCommand,
    );
  }

  // eslint-disable-next-line class-methods-use-this
  _createPayload(
    bleOutputAddress,
    command,
    bufferLength,
    payloadBufferAddDataFunc,
    requestResponseCommand = BLE_REQUEST_NO_RESPONSE,
  ) {
    const payload = Buffer.alloc(bufferLength);
    payload.writeUInt8(bleOutputAddress);
    payload.writeUInt16BE(requestResponseCommand, 1);
    payload.writeUInt16BE(command, 3);
    payloadBufferAddDataFunc(payload);
    return payload;
  }

  // eslint-disable-next-line class-methods-use-this
  _createChallengeResponse(key, challenge) {
    const intermediate = crypto.createHash('sha256').update(xor(key, challenge)).digest();
    const part1 = intermediate.subarray(0, 16);
    const part2 = intermediate.subarray(16);

    const resp = xor(part1, part2);

    return resp;
  }

  // eslint-disable-next-line class-methods-use-this
  _encryptDecrypt(key, addr, data) {
    const buf = Buffer.concat([addr, addr, addr.subarray(0, 4)]);

    const cipher = crypto.createCipheriv('aes-128-ecb', key, '');
    cipher.setAutoPadding(false);

    let ct = cipher.update(buf).toString('hex');
    ct += cipher.final().toString('hex');
    const ctBuf = Buffer.from(ct, 'hex');

    let output = '';
    for (let i = 0, { length } = data; i < length; i++) {
      // eslint-disable-next-line no-bitwise
      output += String.fromCharCode(data[i] ^ ctBuf[i % 16]);
    }

    return Buffer.from(output, 'ascii');
  }

  // eslint-disable-next-line class-methods-use-this
  _reverseBuffer(src) {
    const buffer = Buffer.allocUnsafe(src.length);

    for (let i = 0, j = src.length - 1; i <= j; ++i, --j) {
      buffer[i] = src[j];
      buffer[j] = src[i];
    }

    return buffer;
  }
}

module.exports = PlejBLEHandler;

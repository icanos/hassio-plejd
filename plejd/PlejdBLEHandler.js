const dbus = require('dbus-next');
const crypto = require('crypto');
const xor = require('buffer-xor');
const EventEmitter = require('events');
const Logger = require('./Logger');

const Configuration = require('./Configuration');

const logger = Logger.getLogger('plejd-ble');

// UUIDs
const BLE_UUID_SUFFIX = '6085-4726-be45-040c957391b5';
const PLEJD_SERVICE = `31ba0001-${BLE_UUID_SUFFIX}`;
const DATA_UUID = `31ba0004-${BLE_UUID_SUFFIX}`;
const LAST_DATA_UUID = `31ba0005-${BLE_UUID_SUFFIX}`;
const AUTH_UUID = `31ba0009-${BLE_UUID_SUFFIX}`;
const PING_UUID = `31ba000a-${BLE_UUID_SUFFIX}`;

const BLE_CMD_DIM_CHANGE = 0xc8;
const BLE_CMD_DIM2_CHANGE = 0x98;
const BLE_CMD_STATE_CHANGE = 0x97;
const BLE_CMD_SCENE_TRIG = 0x21;

const BLUEZ_SERVICE_NAME = 'org.bluez';
const DBUS_OM_INTERFACE = 'org.freedesktop.DBus.ObjectManager';
const DBUS_PROP_INTERFACE = 'org.freedesktop.DBus.Properties';

const BLUEZ_ADAPTER_ID = 'org.bluez.Adapter1';
const BLUEZ_DEVICE_ID = 'org.bluez.Device1';
const GATT_SERVICE_ID = 'org.bluez.GattService1';
const GATT_CHRC_ID = 'org.bluez.GattCharacteristic1';

const MAX_TRANSITION_STEPS_PER_SECOND = 5; // Could be made a setting
const MAX_RETRY_COUNT = 5; // Could be made a setting

const delay = (timeout) => new Promise((resolve) => setTimeout(resolve, timeout));

class PlejBLEHandler extends EventEmitter {
  adapter;
  adapterProperties;
  config;
  bleDevices = [];
  bleDeviceTransitionTimers = {};
  bus = null;
  connectedDevice = null;
  consecutiveWriteFails;
  deviceRegistry;
  discoveryTimeout = null;
  plejdService = null;
  plejdDevices = {};
  pingRef = null;
  writeQueue = {};
  writeQueueRef = null;
  reconnectInProgress = false;

  // Refer to BLE-states.md regarding the internal BLE/bluez state machine of Bluetooth states
  // These states refer to the state machine of this file
  static STATES = ['MAIN_INIT', 'GET_ADAPTER_PROXY'];

  static EVENTS = ['connected', 'reconnecting', 'sceneTriggered', 'stateChanged'];

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

    this.on('writeFailed', (error) => this.onWriteFailed(error));
    this.on('writeSuccess', () => this.onWriteSuccess());
  }

  async init() {
    logger.info('init()');

    this.bus = dbus.systemBus();
    this.bus.on('connect', () => {
      logger.verbose('dbus-next connected');
    });
    this.bus.on('error', (err) => {
      // Uncaught error events will show UnhandledPromiseRejection logs
      logger.verbose(`dbus-next error event: ${err.message}`);
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
      let fixedPlejdPath = segments[segments.length - 1].replace('dev_', '');
      fixedPlejdPath = fixedPlejdPath.replace(/_/g, '');
      plejd.device = this.deviceRegistry.getDeviceBySerialNumber(fixedPlejdPath);

      logger.debug(`Discovered ${plejd.path} with rssi ${plejd.rssi}, name ${plejd.device.name}`);
      // Todo: Connect should probably be done here
      this.bleDevices.push(plejd);
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
            const connectedPlejdDevice = await this._onDeviceConnected(plejd);
            if (connectedPlejdDevice) {
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

      logger.info(`BLE Connected to ${this.connectedDevice.name}`);
      this.emit('connected');

      // Connected and authenticated, start ping
      this.startPing();
      this.startWriteQueue();

      // After we've authenticated, we need to hook up the event listener
      // for changes to lastData.
      this.characteristics.lastDataProperties.on('PropertiesChanged', (
        iface,
        properties,
        // invalidated (third param),
      ) => this.onLastDataUpdated(iface, properties));
      this.characteristics.lastData.StartNotify();
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
    await this._powerOffAdapter();
    await this._powerOnAdapter();
  }

  async _powerOnAdapter() {
    await this.adapterProperties.Set(BLUEZ_ADAPTER_ID, 'Powered', new dbus.Variant('b', 1));
    await delay(1000);
  }

  async _powerOffAdapter() {
    await this.adapterProperties.Set(BLUEZ_ADAPTER_ID, 'Powered', new dbus.Variant('b', 0));
    await delay(1000);
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
    this.objectManager.on('InterfacesAdded', (path, interfaces) => this.onInterfacesAdded(path, interfaces));

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

  async onInterfacesAdded(path, interfaces) {
    logger.silly(`Interface added ${path}, inspecting...`);
    // const [adapter, dev, service, characteristic] = path.split('/').slice(3);
    const interfaceKeys = Object.keys(interfaces);

    if (interfaceKeys.indexOf(BLUEZ_DEVICE_ID) > -1) {
      if (interfaces[BLUEZ_DEVICE_ID].UUIDs.value.indexOf(PLEJD_SERVICE) > -1) {
        logger.debug(`Found Plejd service on ${path}`);

        await this._initDiscoveredPlejdDevice(path);
      } else {
        logger.error('Uh oh, no Plejd device!');
      }
    } else {
      logger.silly('Not the right device id');
    }
  }

  turnOn(deviceId, command) {
    const deviceName = this.deviceRegistry.getDeviceName(deviceId);
    logger.info(
      `Plejd got turn on command for ${deviceName} (${deviceId}), brightness ${command.brightness}${
        command.transition ? `, transition: ${command.transition}` : ''
      }`,
    );
    this._transitionTo(deviceId, command.brightness, command.transition, deviceName);
  }

  turnOff(deviceId, command) {
    const deviceName = this.deviceRegistry.getDeviceName(deviceId);
    logger.info(
      `Plejd got turn off command for ${deviceName} (${deviceId})${
        command.transition ? `, transition: ${command.transition}` : ''
      }`,
    );
    this._transitionTo(deviceId, 0, command.transition, deviceName);
  }

  _clearDeviceTransitionTimer(deviceId) {
    if (this.bleDeviceTransitionTimers[deviceId]) {
      clearInterval(this.bleDeviceTransitionTimers[deviceId]);
    }
  }

  _transitionTo(deviceId, targetBrightness, transition, deviceName) {
    const initialBrightness = this.plejdDevices[deviceId]
      ? this.plejdDevices[deviceId].state && this.plejdDevices[deviceId].dim
      : null;
    this._clearDeviceTransitionTimer(deviceId);

    const isDimmable = this.deviceRegistry.getDevice(deviceId).dimmable;

    if (
      transition > 1
      && isDimmable
      && (initialBrightness || initialBrightness === 0)
      && (targetBrightness || targetBrightness === 0)
      && targetBrightness !== initialBrightness
    ) {
      // Transition time set, known initial and target brightness
      // Calculate transition interval time based on delta brightness and max steps per second
      // During transition, measure actual transition interval time and adjust stepping continously
      // If transition <= 1 second, Plejd will do a better job
      // than we can in transitioning so transitioning will be skipped

      const deltaBrightness = targetBrightness - initialBrightness;
      const transitionSteps = Math.min(
        Math.abs(deltaBrightness),
        MAX_TRANSITION_STEPS_PER_SECOND * transition,
      );
      const transitionInterval = (transition * 1000) / transitionSteps;

      logger.debug(
        `transitioning from ${initialBrightness} to ${targetBrightness} ${
          transition ? `in ${transition} seconds` : ''
        }.`,
      );
      logger.verbose(
        `delta brightness ${deltaBrightness}, steps ${transitionSteps}, interval ${transitionInterval} ms`,
      );

      const dtStart = new Date();

      let nSteps = 0;

      this.bleDeviceTransitionTimers[deviceId] = setInterval(() => {
        const tElapsedMs = new Date().getTime() - dtStart.getTime();
        let tElapsed = tElapsedMs / 1000;

        if (tElapsed > transition || tElapsed < 0) {
          tElapsed = transition;
        }

        let newBrightness = Math.round(
          initialBrightness + (deltaBrightness * tElapsed) / transition,
        );

        if (tElapsed === transition) {
          nSteps++;
          this._clearDeviceTransitionTimer(deviceId);
          newBrightness = targetBrightness;
          logger.debug(
            `Queueing finalize ${deviceName} (${deviceId}) transition from ${initialBrightness} to ${targetBrightness} in ${tElapsedMs}ms. Done steps ${nSteps}. Average interval ${
              tElapsedMs / (nSteps || 1)
            } ms.`,
          );
          this._setBrightness(deviceId, newBrightness, true, deviceName);
        } else {
          nSteps++;
          logger.verbose(
            `Queueing dim transition for ${deviceName} (${deviceId}) to ${newBrightness}. Total queue length ${this.writeQueue.length}`,
          );
          this._setBrightness(deviceId, newBrightness, false, deviceName);
        }
      }, transitionInterval);
    } else {
      if (transition && isDimmable) {
        logger.debug(
          `Could not transition light change. Either initial value is unknown or change is too small. Requested from ${initialBrightness} to ${targetBrightness}`,
        );
      }
      this._setBrightness(deviceId, targetBrightness, true, deviceName);
    }
  }

  _setBrightness(deviceId, brightness, shouldRetry, deviceName) {
    let payload = null;
    let log = '';

    if (!brightness && brightness !== 0) {
      logger.debug(
        `Queueing turn on ${deviceName} (${deviceId}). No brightness specified, setting DIM to previous.`,
      );
      payload = Buffer.from(`${deviceId.toString(16).padStart(2, '0')}0110009701`, 'hex');
      log = 'ON';
    } else if (brightness <= 0) {
      logger.debug(`Queueing turn off ${deviceId}`);
      payload = Buffer.from(`${deviceId.toString(16).padStart(2, '0')}0110009700`, 'hex');
      log = 'OFF';
    } else {
      if (brightness > 255) {
        // eslint-disable-next-line no-param-reassign
        brightness = 255;
      }

      logger.debug(`Queueing ${deviceId} set brightness to ${brightness}`);
      // eslint-disable-next-line no-bitwise
      const brightnessVal = (brightness << 8) | brightness;
      payload = Buffer.from(
        `${deviceId.toString(16).padStart(2, '0')}0110009801${brightnessVal
          .toString(16)
          .padStart(4, '0')}`,
        'hex',
      );
      log = `DIM ${brightness}`;
    }
    this.writeQueue.unshift({
      deviceId,
      log,
      shouldRetry,
      payload,
    });
  }

  async authenticate() {
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
    logger.verbose('startReconnectPeriodicallyLoop');
    if (this.reconnectInProgress) {
      logger.debug('Reconnect already in progress. Skipping this call.');
      return;
    }
    clearInterval(this.pingRef);
    clearTimeout(this.writeQueueRef);
    this.reconnectInProgress = true;

    /* eslint-disable no-await-in-loop */
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await delay(5000);
        this.emit('reconnecting');
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

  async write(data) {
    if (!data || !this.plejdService || !this.characteristics.data) {
      logger.debug('data, plejdService or characteristics not available. Cannot write()');
      return false;
    }

    try {
      logger.verbose(`Sending ${data.length} byte(s) of data to Plejd. ${data.toString('hex')}`);
      const encryptedData = this._encryptDecrypt(this.cryptoKey, this.plejdService.addr, data);
      await this.characteristics.data.WriteValue([...encryptedData], {});
      await this.onWriteSuccess();
      return true;
    } catch (err) {
      if (err.message === 'In Progress') {
        logger.debug("Write failed due to 'In progress' ", err);
      } else {
        logger.debug('Write failed ', err);
      }
      await this.onWriteFailed(err);
      return false;
    }
  }

  startPing() {
    logger.info('startPing()');
    clearInterval(this.pingRef);

    this.pingRef = setInterval(async () => {
      logger.silly('ping');
      await this.ping();
    }, 3000);
  }

  // eslint-disable-next-line class-methods-use-this
  onWriteSuccess() {
    this.consecutiveWriteFails = 0;
  }

  async onWriteFailed(error) {
    this.consecutiveWriteFails++;
    logger.debug(`onWriteFailed #${this.consecutiveWriteFails} in a row.`, error);
    logger.verbose(`Error message: ${error.message}`);

    let errorIndicatesDisconnected = false;
    if (error.message.contains('error: 0x0e')) {
      logger.error("'Unlikely error' (0x0e) writing to Plejd. Will retry.", error);
    } else if (error.message.contains('Not connected')) {
      logger.error(
        "'Not connected' (0x0e) writing to Plejd. Plejd device is probably disconnected.",
      );
      errorIndicatesDisconnected = true;
    } else if (error.message.contains('Method "WriteValue" with signature')) {
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

  async ping() {
    logger.silly('ping()');

    const ping = crypto.randomBytes(1);
    let pong = null;

    try {
      await this.characteristics.ping.WriteValue([...ping], {});
      pong = await this.characteristics.ping.ReadValue({});
    } catch (err) {
      logger.error(`Error pinging Plejd ${err.message}`);
      await this.onWriteFailed(err);
      return;
    }

    // eslint-disable-next-line no-bitwise
    if (((ping[0] + 1) & 0xff) !== pong[0]) {
      logger.error('Plejd ping failed');
      await this.onWriteFailed(new Error(`plejd ping failed ${ping[0]} - ${pong[0]}`));
      return;
    }

    logger.silly(`pong: ${pong[0]}`);
    await this.onWriteSuccess();
  }

  startWriteQueue() {
    logger.info('startWriteQueue()');
    clearTimeout(this.writeQueueRef);

    this.writeQueueRef = setTimeout(() => this.runWriteQueue(), this.config.writeQueueWaitTime);
  }

  async runWriteQueue() {
    try {
      while (this.writeQueue.length > 0) {
        const queueItem = this.writeQueue.pop();
        const deviceName = this.deviceRegistry.getDeviceName(queueItem.deviceId);
        logger.debug(
          `Write queue: Processing ${deviceName} (${queueItem.deviceId}). Command ${queueItem.log}. Total queue length: ${this.writeQueue.length}`,
        );

        if (this.writeQueue.some((item) => item.deviceId === queueItem.deviceId)) {
          logger.verbose(
            `Skipping ${deviceName} (${queueItem.deviceId}) `
              + `${queueItem.log} due to more recent command in queue.`,
          );
          // Skip commands if new ones exist for the same deviceId
          // still process all messages in order
        } else {
          // eslint-disable-next-line no-await-in-loop
          const success = await this.write(queueItem.payload);
          if (!success && queueItem.shouldRetry) {
            queueItem.retryCount = (queueItem.retryCount || 0) + 1;
            logger.debug(`Will retry command, count failed so far ${queueItem.retryCount}`);
            if (queueItem.retryCount <= MAX_RETRY_COUNT) {
              this.writeQueue.push(queueItem); // Add back to top of queue to be processed next;
            } else {
              logger.error(
                `Write queue: Exceeed max retry count (${MAX_RETRY_COUNT}) for ${deviceName} (${queueItem.deviceId}). Command ${queueItem.log} failed.`,
              );
              break;
            }
            if (queueItem.retryCount > 1) {
              break; // First retry directly, consecutive after writeQueueWaitTime ms
            }
          }
        }
      }
    } catch (e) {
      logger.error('Error in writeQueue loop, values probably not written to Plejd', e);
    }

    this.writeQueueRef = setTimeout(() => this.runWriteQueue(), this.config.writeQueueWaitTime);
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

    logger.info('Connected device is a Plejd device with the right characteristics.');

    this.connectedDevice = device.device;
    await this.authenticate();

    return this.connectedDevice;
  }

  // eslint-disable-next-line no-unused-vars
  async onLastDataUpdated(iface, properties) {
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

    const data = value.value;
    const decoded = this._encryptDecrypt(this.cryptoKey, this.plejdService.addr, data);

    if (decoded.length < 5) {
      if (Logger.shouldLog('debug')) {
        // decoded.toString() could potentially be expensive
        logger.verbose(`Too short raw event ignored: ${decoded.toString('hex')}`);
      }
      // ignore the notification since too small
      return;
    }

    const deviceId = decoded.readUInt8(0);
    // What is bytes 2-3?
    const cmd = decoded.readUInt8(4);
    const state = decoded.length > 5 ? decoded.readUInt8(5) : 0;
    // What is byte 6?
    const dim = decoded.length > 7 ? decoded.readUInt8(7) : 0;
    // Bytes 8-9 are sometimes present, what are they?

    const deviceName = this.deviceRegistry.getDeviceName(deviceId);
    if (Logger.shouldLog('debug')) {
      // decoded.toString() could potentially be expensive
      logger.verbose(`Raw event received: ${decoded.toString('hex')}`);
      logger.verbose(
        `Decoded: Device ${deviceId}, cmd ${cmd.toString(16)}, state ${state}, dim ${dim}`,
      );
    }

    if (cmd === BLE_CMD_DIM_CHANGE || cmd === BLE_CMD_DIM2_CHANGE) {
      logger.debug(`${deviceName} (${deviceId}) got state+dim update. S: ${state}, D: ${dim}`);

      this.emit('stateChanged', deviceId, {
        state,
        brightness: dim,
      });

      this.plejdDevices[deviceId] = {
        state,
        dim,
      };
      logger.silly(`All states: ${JSON.stringify(this.plejdDevices, null, 2)}`);
    } else if (cmd === BLE_CMD_STATE_CHANGE) {
      logger.debug(`${deviceName} (${deviceId}) got state update. S: ${state}`);
      this.emit('stateChanged', deviceId, {
        state,
      });
      this.plejdDevices[deviceId] = {
        state,
        dim: 0,
      };
      logger.silly(`All states: ${JSON.stringify(this.plejdDevices, null, 2)}`);
    } else if (cmd === BLE_CMD_SCENE_TRIG) {
      const sceneId = state;
      const sceneName = this.deviceRegistry.getSceneName(sceneId);

      logger.debug(
        `${sceneName} (${sceneId}) scene triggered (device id ${deviceId}). Name can be misleading if there is a device with the same numeric id.`,
      );

      this.emit('sceneTriggered', deviceId, sceneId);
    } else if (cmd === 0x1b) {
      logger.silly('Command 001b seems to be some kind of often repeating ping/mesh data');
    } else {
      logger.verbose(
        `Command ${cmd.toString(16)} unknown. ${decoded.toString(
          'hex',
        )}. Device ${deviceName} (${deviceId})`,
      );
    }
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
    ct = Buffer.from(ct, 'hex');

    let output = '';
    for (let i = 0, { length } = data; i < length; i++) {
      // eslint-disable-next-line no-bitwise
      output += String.fromCharCode(data[i] ^ ct[i % 16]);
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

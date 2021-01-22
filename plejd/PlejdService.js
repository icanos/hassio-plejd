const dbus = require('dbus-next');
const crypto = require('crypto');
const xor = require('buffer-xor');
const EventEmitter = require('events');
const Logger = require('./Logger');

const logger = Logger.getLogger('plejd-ble');

// UUIDs
const PLEJD_SERVICE = '31ba0001-6085-4726-be45-040c957391b5';
const DATA_UUID = '31ba0004-6085-4726-be45-040c957391b5';
const LAST_DATA_UUID = '31ba0005-6085-4726-be45-040c957391b5';
const AUTH_UUID = '31ba0009-6085-4726-be45-040c957391b5';
const PING_UUID = '31ba000a-6085-4726-be45-040c957391b5';

const BLE_CMD_DIM_CHANGE = '00c8';
const BLE_CMD_DIM2_CHANGE = '0098';
const BLE_CMD_STATE_CHANGE = '0097';
const BLE_CMD_SCENE_TRIG = '0021';

const BLUEZ_SERVICE_NAME = 'org.bluez';
const DBUS_OM_INTERFACE = 'org.freedesktop.DBus.ObjectManager';
const DBUS_PROP_INTERFACE = 'org.freedesktop.DBus.Properties';

const BLUEZ_ADAPTER_ID = 'org.bluez.Adapter1';
const BLUEZ_DEVICE_ID = 'org.bluez.Device1';
const GATT_SERVICE_ID = 'org.bluez.GattService1';
const GATT_CHRC_ID = 'org.bluez.GattCharacteristic1';

const MAX_TRANSITION_STEPS_PER_SECOND = 5; // Could be made a setting
const MAX_RETRY_COUNT = 5; // Could be made a setting

class PlejdService extends EventEmitter {
  constructor(cryptoKey, devices, sceneManager, connectionTimeout, writeQueueWaitTime) {
    super();

    logger.info('Starting Plejd BLE, resetting all device states.');

    this.cryptoKey = Buffer.from(cryptoKey.replace(/-/g, ''), 'hex');

    this.sceneManager = sceneManager;
    this.connectedDevice = null;
    this.plejdService = null;
    this.bleDevices = [];
    this.bleDeviceTransitionTimers = {};
    this.plejdDevices = {};
    this.devices = devices;
    this.connectEventHooked = false;
    this.connectionTimeout = connectionTimeout;
    this.writeQueueWaitTime = writeQueueWaitTime;
    this.writeQueue = [];
    this.writeQueueRef = null;
    this.initInProgress = null;

    // Holds a reference to all characteristics
    this.characteristics = {
      data: null,
      lastData: null,
      lastDataProperties: null,
      auth: null,
      ping: null,
    };

    this.bus = dbus.systemBus();
    this.adapter = null;

    logger.debug('wiring events and waiting for BLE interface to power up.');
    this.wireEvents();
  }

  async init() {
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

    clearInterval(this.pingRef);
    clearTimeout(this.writeQueueRef);
    logger.info('init()');

    const bluez = await this.bus.getProxyObject(BLUEZ_SERVICE_NAME, '/');
    this.objectManager = await bluez.getInterface(DBUS_OM_INTERFACE);

    // We need to find the ble interface which implements the Adapter1 interface
    const managedObjects = await this.objectManager.GetManagedObjects();
    const result = await this._getInterface(managedObjects, BLUEZ_ADAPTER_ID);

    if (result) {
      this.adapter = result[1];
    }

    if (!this.adapter) {
      logger.error('Unable to find a bluetooth adapter that is compatible.');
      return Promise.reject(new Error('Unable to find a bluetooth adapter that is compatible.'));
    }

    // eslint-disable-next-line no-restricted-syntax
    for (const path of Object.keys(managedObjects)) {
      /* eslint-disable no-await-in-loop */
      const interfaces = Object.keys(managedObjects[path]);

      if (interfaces.indexOf(BLUEZ_DEVICE_ID) > -1) {
        const proxyObject = await this.bus.getProxyObject(BLUEZ_SERVICE_NAME, path);
        const device = await proxyObject.getInterface(BLUEZ_DEVICE_ID);

        const connected = managedObjects[path][BLUEZ_DEVICE_ID].Connected.value;

        if (connected) {
          logger.info(`disconnecting ${path}`);
          await device.Disconnect();
        }

        await this.adapter.RemoveDevice(path);
      }
      /* eslint-enable no-await-in-loop */
    }

    this.objectManager.on('InterfacesAdded', this.onInterfacesAdded.bind(this));

    this.adapter.SetDiscoveryFilter({
      UUIDs: new dbus.Variant('as', [PLEJD_SERVICE]),
      Transport: new dbus.Variant('s', 'le'),
    });

    try {
      await this.adapter.StartDiscovery();
    } catch (err) {
      logger.error('Failed to start discovery. Make sure no other add-on is currently scanning.');
      return Promise.reject(
        new Error('Failed to start discovery. Make sure no other add-on is currently scanning.'),
      );
    }
    return new Promise((resolve) => setTimeout(
      () => resolve(
        this._internalInit().catch((err) => {
          logger.error('InternalInit exception! Will rethrow.', err);
          throw err;
        }),
      ),
      this.connectionTimeout * 1000,
    ));
  }

  async _internalInit() {
    logger.debug(`Got ${this.bleDevices.length} device(s).`);

    // eslint-disable-next-line no-restricted-syntax
    for (const plejd of this.bleDevices) {
      /* eslint-disable no-await-in-loop */
      logger.debug(`Inspecting ${plejd.path}`);

      try {
        const proxyObject = await this.bus.getProxyObject(BLUEZ_SERVICE_NAME, plejd.path);
        const device = await proxyObject.getInterface(BLUEZ_DEVICE_ID);
        const properties = await proxyObject.getInterface(DBUS_PROP_INTERFACE);

        plejd.rssi = (await properties.Get(BLUEZ_DEVICE_ID, 'RSSI')).value;
        plejd.instance = device;

        const segments = plejd.path.split('/');
        let fixedPlejdPath = segments[segments.length - 1].replace('dev_', '');
        fixedPlejdPath = fixedPlejdPath.replace(/_/g, '');
        plejd.device = this.devices.find((x) => x.serialNumber === fixedPlejdPath);

        logger.debug(`Discovered ${plejd.path} with rssi ${plejd.rssi}`);
      } catch (err) {
        logger.error(`Failed inspecting ${plejd.path}. `, err);
      }
      /* eslint-enable no-await-in-loop */
    }

    const sortedDevices = this.bleDevices.sort((a, b) => b.rssi - a.rssi);
    let connectedDevice = null;

    // eslint-disable-next-line no-restricted-syntax
    for (const plejd of sortedDevices) {
      try {
        if (plejd.instance) {
          logger.info(`Connecting to ${plejd.path}`);
          // eslint-disable-next-line no-await-in-loop
          await plejd.instance.Connect();
          connectedDevice = plejd;
          break;
        }
      } catch (err) {
        logger.error('Warning: unable to connect, will retry. ', err);
      }
    }

    setTimeout(async () => {
      await this.onDeviceConnected(connectedDevice);
      await this.adapter.StopDiscovery();
    }, this.connectionTimeout * 1000);
  }

  async _getInterface(managedObjects, iface) {
    const managedPaths = Object.keys(managedObjects);

    // eslint-disable-next-line no-restricted-syntax
    for (const path of managedPaths) {
      const pathInterfaces = Object.keys(managedObjects[path]);
      if (pathInterfaces.indexOf(iface) > -1) {
        logger.debug(`Found BLE interface '${iface}' at ${path}`);
        try {
          // eslint-disable-next-line no-await-in-loop
          const adapterObject = await this.bus.getProxyObject(BLUEZ_SERVICE_NAME, path);
          return [path, adapterObject.getInterface(iface), adapterObject];
        } catch (err) {
          logger.error(`Failed to get interface '${iface}'. `, err);
        }
      }
    }

    return null;
  }

  async onInterfacesAdded(path, interfaces) {
    // const [adapter, dev, service, characteristic] = path.split('/').slice(3);
    const interfaceKeys = Object.keys(interfaces);

    if (interfaceKeys.indexOf(BLUEZ_DEVICE_ID) > -1) {
      if (interfaces[BLUEZ_DEVICE_ID].UUIDs.value.indexOf(PLEJD_SERVICE) > -1) {
        logger.debug(`Found Plejd service on ${path}`);
        this.bleDevices.push({
          path,
        });
      } else {
        logger.error('Uh oh, no Plejd device!');
      }
    }
  }

  turnOn(deviceId, command) {
    const deviceName = this._getDeviceName(deviceId);
    logger.info(
      `Plejd got turn on command for ${deviceName} (${deviceId}), brightness ${command.brightness}${
        command.transition ? `, transition: ${command.transition}` : ''
      }`,
    );
    this._transitionTo(deviceId, command.brightness, command.transition, deviceName);
  }

  turnOff(deviceId, command) {
    const deviceName = this._getDeviceName(deviceId);
    logger.info(
      `Plejd got turn off command for ${deviceName} (${deviceId}), brightness ${
        command.brightness
      }${command.transition ? `, transition: ${command.transition}` : ''}`,
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

    const isDimmable = this.devices.find((d) => d.id === deviceId).dimmable;

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

  triggerScene(sceneIndex) {
    const sceneName = this._getDeviceName(sceneIndex);
    logger.info(
      `Triggering scene ${sceneName} (${sceneIndex}). Scene name might be misleading if there is a device with the same numeric id.`,
    );
    this.sceneManager.executeScene(sceneIndex, this);
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
    }

    // auth done, start ping
    this.startPing();
    this.startWriteQueue();

    // After we've authenticated, we need to hook up the event listener
    // for changes to lastData.
    this.characteristics.lastDataProperties.on(
      'PropertiesChanged',
      this.onLastDataUpdated.bind(this),
    );
    this.characteristics.lastData.StartNotify();
  }

  async throttledInit(delay) {
    if (this.initInProgress) {
      logger.debug(
        'ThrottledInit already in progress. Skipping this call and returning existing promise.',
      );
      return this.initInProgress;
    }
    this.initInProgress = new Promise((resolve) => setTimeout(async () => {
      const result = await this.init().catch((err) => {
        logger.error('TrottledInit exception calling init(). Will re-throw.', err);
        throw err;
      });
      this.initInProgress = null;
      resolve(result);
    }, delay));
    return this.initInProgress;
  }

  async write(data) {
    if (!data || !this.plejdService || !this.characteristics.data) {
      logger.debug('data, plejdService or characteristics not available. Cannot write()');
      return false;
    }

    try {
      logger.verbose(`Sending ${data.length} byte(s) of data to Plejd`, data);
      const encryptedData = this._encryptDecrypt(this.cryptoKey, this.plejdService.addr, data);
      await this.characteristics.data.WriteValue([...encryptedData], {});
      return true;
    } catch (err) {
      if (err.message === 'In Progress') {
        logger.debug("Write failed due to 'In progress' ", err);
      } else {
        logger.debug('Write failed ', err);
      }
      await this.throttledInit(this.connectionTimeout * 1000);
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
  onPingSuccess(nr) {
    logger.silly(`pong: ${nr}`);
  }

  async onPingFailed(error) {
    logger.debug(`onPingFailed(${error})`);
    logger.info('ping failed, reconnecting.');

    clearInterval(this.pingRef);
    return this.init().catch((err) => {
      logger.error('onPingFailed exception calling init(). Will swallow error.', err);
    });
  }

  async ping() {
    logger.silly('ping()');

    const ping = crypto.randomBytes(1);
    let pong = null;

    try {
      await this.characteristics.ping.WriteValue([...ping], {});
      pong = await this.characteristics.ping.ReadValue({});
    } catch (err) {
      logger.error('Error writing to plejd: ', err);
      this.emit('pingFailed', 'write error');
      return;
    }

    // eslint-disable-next-line no-bitwise
    if (((ping[0] + 1) & 0xff) !== pong[0]) {
      logger.error('Plejd ping failed');
      this.emit('pingFailed', `plejd ping failed ${ping[0]} - ${pong[0]}`);
      return;
    }

    this.emit('pingSuccess', pong[0]);
  }

  startWriteQueue() {
    logger.info('startWriteQueue()');
    clearTimeout(this.writeQueueRef);

    this.writeQueueRef = setTimeout(() => this.runWriteQueue(), this.writeQueueWaitTime);
  }

  async runWriteQueue() {
    try {
      while (this.writeQueue.length > 0) {
        const queueItem = this.writeQueue.pop();
        const deviceName = this._getDeviceName(queueItem.deviceId);
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

    this.writeQueueRef = setTimeout(() => this.runWriteQueue(), this.writeQueueWaitTime);
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
      Buffer.from(String(dirtyAddr[1]).replace(/-/g, '').replace(/_/g, '').replace(/:/g, ''), 'hex'),
    );

    // eslint-disable-next-line no-restricted-syntax
    for (const chPath of characteristics) {
      /* eslint-disable no-await-in-loop */
      const chProxyObject = await this.bus.getProxyObject(BLUEZ_SERVICE_NAME, chPath);
      const ch = await chProxyObject.getInterface(GATT_CHRC_ID);
      const prop = await chProxyObject.getInterface(DBUS_PROP_INTERFACE);

      const chUuid = (await prop.Get(GATT_CHRC_ID, 'UUID')).value;

      if (chUuid === DATA_UUID) {
        logger.debug('found DATA characteristic.');
        this.characteristics.data = ch;
      } else if (chUuid === LAST_DATA_UUID) {
        logger.debug('found LAST_DATA characteristic.');
        this.characteristics.lastData = ch;
        this.characteristics.lastDataProperties = prop;
      } else if (chUuid === AUTH_UUID) {
        logger.debug('found AUTH characteristic.');
        this.characteristics.auth = ch;
      } else if (chUuid === PING_UUID) {
        logger.debug('found PING characteristic.');
        this.characteristics.ping = ch;
      }
      /* eslint-eslint no-await-in-loop */
    }

    return {
      addr,
    };
  }

  async onDeviceConnected(device) {
    logger.info('onDeviceConnected()');
    logger.debug(`Device: ${device}`);
    if (!device) {
      logger.error('Device is null. Should we break/return when this happens?');
    }

    const objects = await this.objectManager.GetManagedObjects();
    const paths = Object.keys(objects);
    const characteristics = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const path of paths) {
      const interfaces = Object.keys(objects[path]);
      if (interfaces.indexOf(GATT_CHRC_ID) > -1) {
        characteristics.push(path);
      }
    }

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

        logger.info(`trying ${chPaths.length} characteristics`);

        this.plejdService = await this._processPlejdService(path, chPaths);
        if (this.plejdService) {
          break;
        }
      }
    }

    if (!this.plejdService) {
      logger.info("warning: wasn't able to connect to Plejd, will retry.");
      this.emit('connectFailed');
      return;
    }

    if (!this.characteristics.auth) {
      logger.error('unable to enumerate characteristics.');
      this.emit('connectFailed');
      return;
    }

    this.connectedDevice = device.device;
    await this.authenticate();
  }

  // eslint-disable-next-line no-unused-vars
  async onLastDataUpdated(iface, properties, invalidated) {
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

    const deviceId = parseInt(decoded[0], 10);
    // What is bytes 2-3?
    const cmd = decoded.toString('hex', 3, 5);
    const state = parseInt(decoded.toString('hex', 5, 6), 10); // Overflows for command 0x001b, scene command
    // eslint-disable-next-line no-bitwise
    const data2 = parseInt(decoded.toString('hex', 6, 8), 16) >> 8;

    if (decoded.length < 5) {
      logger.debug(`Too short raw event ignored: ${decoded.toString('hex')}`);
      // ignore the notification since too small
      return;
    }

    const deviceName = this._getDeviceName(deviceId);
    logger.verbose(`Raw event received: ${decoded.toString('hex')}`);
    logger.verbose(
      `Device ${deviceId}, cmd ${cmd.toString('hex')}, state ${state}, dim/data2 ${data2}`,
    );

    if (cmd === BLE_CMD_DIM_CHANGE || cmd === BLE_CMD_DIM2_CHANGE) {
      const dim = data2;

      logger.debug(`${deviceName} (${deviceId}) got state+dim update. S: ${state}, D: ${dim}`);

      this.emit('stateChanged', deviceId, {
        state,
        brightness: dim,
      });

      this.plejdDevices[deviceId] = {
        state,
        dim,
      };
      logger.verbose(`All states: ${JSON.stringify(this.plejdDevices)}`);
    } else if (cmd === BLE_CMD_STATE_CHANGE) {
      logger.debug(`${deviceName} (${deviceId}) got state update. S: ${state}`);
      this.emit('stateChanged', deviceId, {
        state,
      });
      this.plejdDevices[deviceId] = {
        state,
        dim: 0,
      };
      logger.verbose(`All states: ${this.plejdDevices}`);
    } else if (cmd === BLE_CMD_SCENE_TRIG) {
      const sceneId = parseInt(decoded.toString('hex', 5, 6), 16);
      const sceneName = this._getDeviceName(sceneId);

      logger.debug(
        `${sceneName} (${sceneId}) scene triggered (device id ${deviceId}). Name can be misleading if there is a device with the same numeric id.`,
      );

      this.emit('sceneTriggered', deviceId, sceneId);
    } else if (cmd === '001b') {
      logger.silly('Command 001b seems to be some kind of often repeating ping/mesh data');
    } else {
      logger.verbose(`Command ${cmd.toString('hex')} unknown. Device ${deviceName} (${deviceId})`);
    }
  }

  wireEvents() {
    logger.info('wireEvents()');
    const self = this;

    this.on('pingFailed', this.onPingFailed.bind(self));
    this.on('pingSuccess', this.onPingSuccess.bind(self));
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

  _getDeviceName(deviceId) {
    return (this.devices.find((d) => d.id === deviceId) || {}).name;
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

module.exports = PlejdService;

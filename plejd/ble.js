const noble = require('@icanos/noble');
const crypto = require('crypto');
const xor = require('buffer-xor');
const _ = require('lodash');
const EventEmitter = require('events');

let debug = '';

const getLogger = () => {
  const consoleLogger = msg => console.log('plejd', msg);
  if (debug === 'console') {
    return consoleLogger;
  }

  // > /dev/null
  return _.noop;
};

const logger = getLogger();

// UUIDs
const PLEJD_SERVICE = "31ba000160854726be45040c957391b5"
const DATA_UUID = "31ba000460854726be45040c957391b5"
const LAST_DATA_UUID = "31ba000560854726be45040c957391b5"
const AUTH_UUID = "31ba000960854726be45040c957391b5"
const PING_UUID = "31ba000a60854726be45040c957391b5"

const STATE_IDLE = 'idle';
const STATE_SCANNING = 'scanning';
const STATE_CONNECTING = 'connecting';
const STATE_CONNECTED = 'connected';
const STATE_AUTHENTICATED = 'authenticated';
const STATE_DISCONNECTED = 'disconnected';
const STATE_UNINITIALIZED = 'uninitialized';
const STATE_INITIALIZED = 'initialized';

const BLE_CMD_DIM_CHANGE = '00c8';
const BLE_CMD_DIM2_CHANGE = '0098';
const BLE_CMD_STATE_CHANGE = '0097';
const BLE_CMD_SCENE_TRIG = '0021';

class PlejdService extends EventEmitter {
  constructor(cryptoKey, keepAlive = false) {
    super();

    this.cryptoKey = Buffer.from(cryptoKey.replace(/-/g, ''), 'hex');

    // Keeps track of the current state
    this.state = STATE_IDLE;
    // Keeps track of discovered devices
    this.devices = {};
    // Keeps track of the currently connected device
    this.device = null;
    this.deviceAddress = null;
    this.deviceIdx = 0;

    this.writeQueue = [];

    this.plejdDevices = {};
    this.connectEventHooked = false;

    // Holds a reference to all characteristics
    this.characteristicState = STATE_UNINITIALIZED;
    this.characteristics = {
      data: null,
      lastData: null,
      auth: null,
      ping: null
    };

    logger('wiring events and waiting for BLE interface to power up.');
    this.wireEvents();
  }

  updateSettings(settings) {
    if (settings.debug) {
      debug = 'console';
    }
    else {
      debug = '';
    }
  }

  turnOn(id, command) {
    logger('turning on ' + id + ' at brightness ' + (!command.brightness ? 255 : command.brightness));
    const brightness = command.brightness ? command.brightness : 0;

    if (command.transition) {
      // we have a transition time, split the target brightness
      // into pieces spread of the transition time
      const steps = command.transition * 2;
      const brightnessStep = brightness / steps;

      let i = 0;
      const transitionRef = setInterval(() => {
        let currentBrightness = parseInt((brightnessStep * i) + 1);
        if (currentBrightness > 254) {
          currentBrightness = 254;
        }

        this._turnOn(id, currentBrightness);

        if (i >= steps) {
          clearInterval(transitionRef);
        }

        i++;
      }, 500);
    }
    else {
      this._turnOn(id, brightness);
    }
  }

  _turnOn(id, brightness) {
    var payload;
    if (!brightness || brightness === 0) {
      logger('no brightness specified, setting to previous known.');
      payload = Buffer.from((id).toString(16).padStart(2, '0') + '0110009701', 'hex');
    } else {
      logger('brightness is ' + brightness);
      brightness = brightness << 8 | brightness;
      payload = Buffer.from((id).toString(16).padStart(2, '0') + '0110009801' + (brightness).toString(16).padStart(4, '0'), 'hex');
    }

    this.write(payload);
  }

  turnOff(id, command) {
    logger('turning off ' + id);

    if (command.transition) {
      // we have a transition time, split the target brightness (which will be 0)
      // into pieces spread of the transition time
      const initialBrightness = this.plejdDevices[id] ? this.plejdDevices[id].dim : 250;
      const steps = command.transition * 2;
      const brightnessStep = initialBrightness / steps;
      let currentBrightness = initialBrightness;

      let i = 0;
      const transitionRef = setInterval(() => {
        currentBrightness = parseInt(initialBrightness - (brightnessStep * i));
        if (currentBrightness <= 0 || i >= steps) {
          clearInterval(transitionRef);

          // finally, we turn it off
          this._turnOff(id);
          return;
        }

        this._turnOn(id, currentBrightness);

        i++;
      }, 500);
    }
    else {
      this._turnOff(id);
    }
  }

  _turnOff(id) {
    var payload = Buffer.from((id).toString(16).padStart(2, '0') + '0110009700', 'hex');
    this.write(payload);
  }

  scan() {
    console.log('scan()');

    if (this.state === STATE_SCANNING) {
      console.log('error: already scanning, please wait.');
      return;
    }

    this.state = STATE_SCANNING;
    noble.startScanning([PLEJD_SERVICE]);

    setTimeout(() => {
      noble.stopScanning();
      this.state = STATE_IDLE;

      const foundDeviceCount = Object.values(this.devices).length;
      console.log('scan completed, found ' + foundDeviceCount + ' device(s).');

      if (foundDeviceCount == 0) {
        console.log('warning: no devices found. will not do anything else.');
      }
      else {
        this.emit('scanComplete', this.devices);
      }
    }, 5000);
  }

  connect(uuid = null) {
    const self = this;
    if (this.state === STATE_CONNECTING) {
      console.log('warning: currently connecting to a device, please wait...');
      return;
    }

    if (!uuid) {
      sortedDevices = Object.values(this.devices).sort((a, b) => b.rssi - a.rssi);
      this.device = sortedDevices[this.deviceIdx];
    }
    else {
      this.device = this.devices[uuid];
      if (!this.device) {
        console.log('error: could not find a device with uuid: ' + uuid);
        return;
      }
    }

    if (!this.device) {
      console.log('error: reached end of device list. cannot continue.');
      return;
    }

    this.deviceAddress = this._reverseBuffer(
      Buffer.from(
        String(this.device.address)
          .replace(/\-/g, '')
          .replace(/\:/g, ''), 'hex'
      )
    );

    console.log('connecting to ' + this.device.id + ' with addr ' + this.device.address + ' and rssi ' + this.device.rssi);
    setTimeout(() => {
      if (self.state !== STATE_CONNECTED && self.state !== STATE_AUTHENTICATED) {
        if (self.deviceIdx < Object.keys(self.devices).length) {
          logger('connection timed out after 10 s. cleaning up and trying next.');

          self.disconnect();

          self.deviceIdx++;
          self.connect();
        }
      }
    }, 10 * 1000);

    this.state = STATE_CONNECTING;

    if (!this.connectEventHooked) {
      this.device.once('connect', (state) => {
        self.onDeviceConnected(state);
        this.connectEventHooked = false;
      });
      this.connectEventHooked = true;
    }

    this.device.connect();
  }

  disconnect() {
    console.log('disconnect()');

    clearInterval(this.pingRef);

    if (this.device) {
      this.device.removeAllListeners('servicesDiscover');
      this.device.removeAllListeners('connect');
      this.device.removeAllListeners('disconnect');
    }
    if (this.characteristics.auth) {
      this.characteristics.auth.removeAllListeners('read');
      this.characteristics.auth.removeAllListeners('write');
    }
    if (this.characteristics.data) {
      this.characteristics.data.removeAllListeners('read');
      this.characteristics.data.removeAllListeners('write');
    }
    if (this.characteristics.lastData) {
      this.characteristics.lastData.removeAllListeners('read');
      this.characteristics.lastData.removeAllListeners('write');
    }
    if (this.characteristics.ping) {
      this.characteristics.ping.removeAllListeners('read');
      this.characteristics.ping.removeAllListeners('write');
    }


    this.connectEventHooked = false;

    this.unsubscribeCharacteristics();
    this.device.disconnect();

    this.state = STATE_DISCONNECTED;
    this.characteristicState = STATE_UNINITIALIZED;
  }

  authenticate() {
    console.log('authenticate()');
    const self = this;

    if (this.state !== STATE_CONNECTED) {
      console.log('error: need to be connected and not previously authenticated (new connection).');
      return;
    }

    this.characteristics.auth.write(Buffer.from([0]), false, (err) => {
      if (err) {
        console.log('error: failed to authenticate: ' + err);
        return;
      }

      self.characteristics.auth.read((err, data) => {
        if (err) {
          console.log('error: failed to read auth response: ' + err);
          return;
        }

        var resp = self._createChallengeResponse(self.cryptoKey, data);
        self.characteristics.auth.write(resp, false, (err) => {
          if (err) {
            console.log('error: failed to challenge: ' + err);
            return;
          }

          self.state = STATE_AUTHENTICATED;
          self.emit('authenticated');
        });
      })
    });
  }

  write(data) {
    if (this.state !== STATE_AUTHENTICATED) {
      logger('error: not connected.');
      this.writeQueue.push(data);
      return false;
    }

    try {
      const encryptedData = this._encryptDecrypt(this.cryptoKey, this.deviceAddress, data);
      this.characteristics.data.write(encryptedData, false);

      let writeData;
      while ((writeData = this.writeQueue.shift()) !== undefined) {
        this.characteristics.data.write(this._encryptDecrypt(this.cryptoKey, this.deviceAddress, writeData), false);
      }
    }
    catch (error) {
      console.log('error: writing to plejd: ' + error);
      console.log('will reconnect and try again.');
      this.writeQueue.push(data);

      this.disconnect();
      this.connect();
    }
  }

  onAuthenticated() {
    // Start ping
    logger('onAuthenticated()');
    this.startPing();
  }

  startPing() {
    console.log('startPing()');
    clearInterval(this.pingRef);

    this.pingRef = setInterval(async () => {
      if (this.state === STATE_AUTHENTICATED) {
        logger('ping');
        this.ping();
      }
      else if (this.state === STATE_DISCONNECTED) {
        console.log('warning: device disconnected, stop ping.');
      }
      else {
        console.log('error: ping failed, not connected.');
      }
    }, 3000);
  }

  onPingSuccess(nr) {
    logger('pong: ' + nr);
  }

  onPingFailed(error) {
    logger('onPingFailed(' + error + ')');

    logger('stopping ping and reconnecting.');
    clearInterval(this.pingRef);

    this.unsubscribeCharacteristics();
    this.state = STATE_DISCONNECTED;
    this.characteristicState = STATE_UNINITIALIZED;

    this.connect(this.device.id);
  }

  ping() {
    logger('ping()');

    if (this.state !== STATE_AUTHENTICATED) {
      console.log('error: needs to be authenticated before pinging.');
      return;
    }

    const self = this;
    var ping = crypto.randomBytes(1);

    try {
      this.characteristics.ping.write(ping, false, (err) => {
        if (err) {
          console.log('error: unable to send ping: ' + err);
          self.emit('pingFailed');
          return;
        }

        this.characteristics.ping.read((err, data) => {
          if (err) {
            console.log('error: unable to read ping: ' + err);
            self.emit('pingFailed');
            return;
          }

          if (((ping[0] + 1) & 0xff) !== data[0]) {
            self.emit('pingFailed');
            return;
          }
          else {
            self.emit('pingSuccess', data[0]);
          }
        });
      });
    }
    catch (error) {
      console.log('error: writing to plejd: ' + error);
      self.emit('pingFailed', error);
    }
  }

  onDeviceConnected(err) {
    console.log('onDeviceConnected()');
    const self = this;

    if (err) {
      console.log('error: failed to connect to device: ' + err + '. picking next.');
      this.deviceIdx++;
      this.disconnect();
      this.connect();
      return;
    }

    this.state = STATE_CONNECTED;

    if (this.characteristicState === STATE_UNINITIALIZED) {
      // We need to discover the characteristics
      logger('discovering services and characteristics');

      setTimeout(() => {
        if (this.characteristicState === STATE_UNINITIALIZED) {
          console.log('error: discovering characteristics timed out. trying next device.');
          self.deviceIdx++;
          self.disconnect();
          self.connect();
        }
      }, 5000);

      this.device.discoverSomeServicesAndCharacteristics([PLEJD_SERVICE], [], async (err, services, characteristics) => {
        if (err) {
          console.log('error: failed to discover services: ' + err);
          return;
        }

        if (self.state !== STATE_CONNECTED || self.characteristicState !== STATE_UNINITIALIZED) {
          // in case our time out triggered before we got here.
          console.log('warning: found characteristics in invalid state. ignoring.');
          return;
        }

        logger('found ' + characteristics.length + ' characteristic(s).');

        characteristics.forEach((ch) => {
          if (DATA_UUID == ch.uuid) {
            logger('found DATA characteristic.');
            self.characteristics.data = ch;
          }
          else if (LAST_DATA_UUID == ch.uuid) {
            logger('found LAST_DATA characteristic.');
            self.characteristics.lastData = ch;
          }
          else if (AUTH_UUID == ch.uuid) {
            logger('found AUTH characteristic.');
            self.characteristics.auth = ch;
          }
          else if (PING_UUID == ch.uuid) {
            logger('found PING characteristic.');
            self.characteristics.ping = ch;
          }
        });

        if (self.characteristics.data
          && self.characteristics.lastData
          && self.characteristics.auth
          && self.characteristics.ping) {

          self.characteristicState = STATE_INITIALIZED;

          // subscribe to notifications
          this.subscribeCharacteristics();

          self.emit('deviceCharacteristicsComplete', self.device);
        }
      });
    }
  }

  onDeviceCharacteristicsComplete(device) {
    logger('onDeviceCharacteristicsComplete(' + device.id + ')');
    this.authenticate();
  }

  onDeviceDiscovered(device) {
    logger('onDeviceDiscovered(' + device.id + ')');
    if (device.advertisement.localName === 'P mesh') {
      logger('device is P mesh');
      this.devices[device.id] = device;
    }
  }

  onDeviceDisconnected() {
    logger('onDeviceDisconnected()');
    this.disconnect();

    if (!this.device) {
      console.log('warning: reconnect will not be performed.');
      return;
    }

    // we just want to reconnect
    this.connect(this.device.id);
  }

  onDeviceScanComplete() {
    console.log('onDeviceScanComplete()');
    console.log('trying to connect to the mesh network.');
    this.connect();
  }

  onInterfaceStateChanged(state) {
    console.log('onInterfaceStateChanged(' + state + ')');

    if (state === 'poweredOn') {
      this.scan();
    }
    else {
      noble.stopScanning();
    }
  }

  onLastDataUpdated(data, isNotification) {
    const decoded = this._encryptDecrypt(this.cryptoKey, this.deviceAddress, data);

    let state = 0;
    let dim = 0;
    let device = parseInt(decoded[0], 10);

    if (decoded.length < 5) {
      // ignore the notification since too small
      return;
    }

    const cmd = decoded.toString('hex', 3, 5);

    if (debug) {
      logger('raw event received: ' + decoded.toString('hex'));
    }

    if (cmd === BLE_CMD_DIM_CHANGE || cmd === BLE_CMD_DIM2_CHANGE) {
      state = parseInt(decoded.toString('hex', 5, 6), 10);
      dim = parseInt(decoded.toString('hex', 6, 8), 16) >> 8;

      logger('d: ' + device + ' got state+dim update: ' + state + ' - ' + dim);
      this.emit('stateChanged', device, { state: state, brightness: dim });
    }
    else if (cmd === BLE_CMD_STATE_CHANGE) {
      state = parseInt(decoded.toString('hex', 5, 6), 10);

      logger('d: ' + device + ' got state update: ' + state);
      this.emit('stateChanged', device, { state: state });
    }
    else if (cmd === BLE_CMD_SCENE_TRIG) {
      const scene = parseInt(decoded.toString('hex', 5, 6), 10);
      this.emit('sceneTriggered', device, scene);
    }

    this.plejdDevices[device] = {
      state: state,
      dim: dim
    };
  }

  wireEvents() {
    console.log('wireEvents()');
    const self = this;

    noble.on('stateChange', this.onInterfaceStateChanged.bind(self));
    //noble.on('scanStop', this.onDeviceScanComplete.bind(self));
    noble.on('discover', this.onDeviceDiscovered.bind(self));
    noble.on('disconnect', this.onDeviceDisconnected.bind(self));

    this.on('scanComplete', this.onDeviceScanComplete.bind(this));
    this.on('deviceCharacteristicsComplete', this.onDeviceCharacteristicsComplete.bind(self));
    this.on('authenticated', this.onAuthenticated.bind(self));
    this.on('pingFailed', this.onPingFailed.bind(self));
    this.on('pingSuccess', this.onPingSuccess.bind(self));
  }

  subscribeCharacteristics() {
    if (this.characteristics.lastData) {
      this.characteristics.lastData.subscribe((err) => {
        if (err) {
          console.log('error: could not subscribe to event.');
        }
      });
      this.characteristics.lastData.on('data', this.onLastDataUpdated.bind(this));
    }
  }

  unsubscribeCharacteristics() {
    if (this.characteristics.lastData) {
      try {
        this.characteristics.lastData.unsubscribe((err) => {
          if (err) {
            console.log('error: could not unsubscribe from event.');
          }
        });
      }
      catch (error) {
        console.log('warning: could not unsubscribe from lastData, probably already disconnected: ' + error);
      }
    }
  }

  _createChallengeResponse(key, challenge) {
    const intermediate = crypto.createHash('sha256').update(xor(key, challenge)).digest();
    const part1 = intermediate.subarray(0, 16);
    const part2 = intermediate.subarray(16);

    const resp = xor(part1, part2);

    return resp;
  }

  _encryptDecrypt(key, addr, data) {
    var buf = Buffer.concat([addr, addr, addr.subarray(0, 4)]);

    var cipher = crypto.createCipheriv("aes-128-ecb", key, '');
    cipher.setAutoPadding(false);

    var ct = cipher.update(buf).toString('hex');
    ct += cipher.final().toString('hex');
    ct = Buffer.from(ct, 'hex');

    var output = "";
    for (var i = 0, length = data.length; i < length; i++) {
      output += String.fromCharCode(data[i] ^ ct[i % 16]);
    }

    return Buffer.from(output, 'ascii');
  }

  _reverseBuffer(src) {
    var buffer = Buffer.allocUnsafe(src.length)

    for (var i = 0, j = src.length - 1; i <= j; ++i, --j) {
      buffer[i] = src[j]
      buffer[j] = src[i]
    }

    return buffer
  }
}

module.exports = PlejdService;
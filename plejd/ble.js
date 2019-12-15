const noble = require('@icanos/noble');
const crypto = require('crypto');
const xor = require('buffer-xor');
const _ = require('lodash');
const EventEmitter = require('events');
const sleep = require('sleep');

let debug = 'console';

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

    // Holds a reference to all characteristics
    this.characteristicState = STATE_UNINITIALIZED;
    this.characteristics = {
      data: null,
      lastData: null,
      auth: null,
      ping: null
    };

    this.wireEvents();
  }

  scan() {
    logger('scan()');

    if (this.state === STATE_SCANNING) {
      console.log('error: already scanning, please wait.');
      return;
    }

    this.state = STATE_SCANNING;
    noble.startScanning();
    
    setTimeout(() => {
      noble.stopScanning();
      this.state = STATE_IDLE;

      this.devices.sort((a, b) => (a.rssi > b.rssi) ? 1 : -1)
      this.emit('scanComplete', this.devices);
    }, 5000);
  }

  connect(uuid = null) {
    if (this.state === STATE_CONNECTING) {
      console.log('warning: currently connecting to a device, please wait...');
      return;
    }

    if (!uuid) {
      this.device = Object.values(this.devices)[0];
    }
    else {
      this.device = this.devices[uuid];
      if (!this.device) {
        console.log('error: could not find a device with uuid: ' + uuid);
        return;
      }
    }

    logger('connecting to ' + this.device.id + ' with addr ' + this.device.address + ' and rssi ' + this.device.rssi);

    this.state = STATE_CONNECTING;
    this.device.connect(this.onDeviceConnected);
  }

  disconnect() {
    logger('disconnect()');
    if (this.state !== STATE_CONNECTED) {
      return;
    }

    this.device.disconnect();
  }

  authenticate() {
    logger('authenticate()');
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

  onAuthenticated() {
    // Start ping
    logger('onAuthenticated()');
    this.startPing();
  }

  startPing() {
    logger('startPing()');
    clearInterval(this.pingRef);

    this.pingRef = setInterval(async () => {
      if (this.state === STATE_AUTHENTICATED) {
        logger('ping');
        this.ping();
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

    this.state = STATE_DISCONNECTED;
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

        this.pingCharacteristic.read((err, data) => {
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
    logger('onDeviceConnected()');
    const self = this;

    this.state = STATE_CONNECTED;

    if (this.characteristicState === STATE_UNINITIALIZED) {
      // We need to discover the characteristics
      this.device.discoverSomeServicesAndCharacteristics([PLEJD_SERVICE], [], async (err, services, characteristics) => {
        if (err) {
          console.log('error: failed to discover services: ' + err);
          return;
        }

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

        if (self.dataCharacteristic
          && self.lastDataCharacteristic
          && self.authCharacteristic
          && self.pingCharacteristic) {

          self.characteristicState = STATE_INITIALIZED;
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
    this.devices[device.id] = device;
  }

  onDeviceDisconnected() {
    logger('onDeviceDisconnected()');

    if (!this.device) {
      console.log('warning: reconnect will not be performed.');
      return;
    }

    // we just want to reconnect
    this.connect(this.device.id);
  }

  onDeviceScanComplete() {
    logger('onDeviceScanComplete()');
  }

  onInterfaceStateChanged(state) {
    logger('onInterfaceStateChanged(' + state + ')');

    if (state === 'poweredOn') {
      this.scan();
    }
  }

  wireEvents() {
    noble.on('stateChanged', this.onInterfaceStateChanged);
    noble.on('scanStop', this.onDeviceScanComplete);
    noble.on('discover', this.onDeviceDiscovered);
    noble.on('disconnect', this.onDeviceDisconnected);

    this.on('deviceCharacteristicsComplete', this.onDeviceCharacteristicsComplete);
    this.on('authenticated', this.onAuthenticated);
    this.on('pingFailed', this.onPingFailed);
    this.on('pingSuccess', this.onPingSuccess);
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
const noble = require('@abandonware/noble');
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

class Controller extends EventEmitter {
  constructor(cryptoKey, keepAlive = false) {
    super();

    this.cryptoKey = Buffer.from(cryptoKey.replace(/-/g, ''), 'hex');
    this.peripheral = null;
    this.peripheral_address = null;

    this.isScanning = false;
    this.isConnecting = false;
    this.isConnected = false;
    this.keepAlive = keepAlive;
    this.writeQueue = [];
    this.peripherals = [];
  }

  async init() {
    const self = this;

    noble.on('stateChange', async (state) => {
      logger('ble state changed: ' + state);

      if (state === 'poweredOn') {
        await this.scan();
      }
    });

    noble.on('discover', (peripheral) => {
      logger('found ' + peripheral.advertisement.localName + ' with addr ' + peripheral.address);
      if (peripheral.advertisement.localName === 'P mesh') {
        self.peripherals.push(peripheral);
      }
    });
  }

  async scan() {
    const self = this;
    this.isScanning = true;
    noble.startScanning([PLEJD_SERVICE]);

    setTimeout(() => {
      noble.stopScanning();
      this.isScanning = false;

      self.peripherals.sort((a, b) => a.rssi > b.rssi);
      this.emit('scanComplete', self.peripherals);

    }, 5000);
  }

  async connect() {
    const self = this;

    if (this.isScanning) {
      logger('already scanning, waiting.');

      setTimeout(this.connect(), 1000);
      return Promise.resolve(false);
    }

    if (!this.peripherals.length) {
      await this.scan();
    }

    this.isConnecting = true;

    let idx = 0;
    return await this._internalConnect(idx);
  }

  async _internalConnect(idx) {
    const self = this;

    if (idx >= this.peripherals.length) {
      logger('reached end of list.');
      return Promise.resolve(false);
    }

    logger('connecting to Plejd device');
    try {
      this.peripherals[idx].connect(async (err) => {
        if (err) {
          logger('error: failed to connect to Plejd device: ' + err);
          return await self._internalConnect(idx + 1);
        }

        self.peripheral = self.peripherals[idx];
        logger('connected to Plejd device with addr ' + self.peripheral.address);

        self.peripheral_address = self._reverseBuffer(Buffer.from(String(self.peripheral.address).replace(/\-/g, '').replace(/\:/g, ''), 'hex'));

        logger('discovering services and characteristics');
        await self.peripheral.discoverSomeServicesAndCharacteristics([PLEJD_SERVICE], [], async (err, services, characteristics) => {
          if (err) {
            logger('error: failed to discover services: ' + err);
            return;
          }

          characteristics.forEach((ch) => {
            if (DATA_UUID == ch.uuid) {
              logger('found DATA characteristic.');
              self.dataCharacteristic = ch;
            }
            else if (LAST_DATA_UUID == ch.uuid) {
              logger('found LAST_DATA characteristic.');
              self.lastDataCharacteristic = ch;
            }
            else if (AUTH_UUID == ch.uuid) {
              logger('found AUTH characteristic.');
              self.authCharacteristic = ch;
            }
            else if (PING_UUID == ch.uuid) {
              logger('found PING characteristic.');
              self.pingCharacteristic = ch;
            }
          });

          if (this.dataCharacteristic
            && this.lastDataCharacteristic
            && this.authCharacteristic
            && this.pingCharacteristic) {

            this.on('authenticated', () => {
              logger('Plejd is connected and authenticated.');

              if (self.keepAlive) {
                self.startPing();
              }

              self.subscribe();

              self.emit('connected');
            });

            try {
              await this.authenticate();
            }
            catch (error) {
              this.isConnecting = false;
              logger('error: failed to authenticate: ' + error);
              return Promise.resolve(false);
            }

            this.isConnected = true;
            this.isConnecting = false;
          }

          return Promise.resolve(true);
          //});
        });
      });
    }
    catch (error) {
      this.isConnecting = false;

      logger('error: failed to connect to Plejd device: ' + error);
    }

    return Promise.resolve(true);
  }

  subscribe() {
    const self = this;

    self.lastDataCharacteristic.subscribe((err) => {
      if (err) {
        logger('error: couldnt subscribe to notification characteristic.');
      }

      // subscribe to last data event
      self.lastDataCharacteristic.on('data', (data, isNotification) => {
        const decoded = self._encryptDecrypt(self.cryptoKey, self.peripheral_address, data);

        let state = 0;
        let dim = 0;
        let device = parseInt(decoded[0], 10);

        if (decoded.toString('hex', 3, 5) === '00c8' || decoded.toString('hex', 3, 5) === '0098') {
          state = parseInt(decoded.toString('hex', 5, 6), 10);
          dim = parseInt(decoded.toString('hex', 6, 8), 16) >> 8;

          logger('d: ' + device + ' got state+dim update: ' + state + ' - ' + dim);
          this.emit('dimChanged', device, state, dim);
        }
        else if (decoded.toString('hex', 3, 5) === '0097') {
          state = parseInt(decoded.toString('hex', 5, 6), 10);
          logger('d: ' + device + ' got state update: ' + state);
          this.emit('stateChanged', device, state);
        }
      });
    });
  }

  async disconnect() {
    logger('disconnecting from Plejd');

    if (this.isConnected) {
      clearInterval(this.pingRef);

      if (this.peripheral) {
        try {
          await this.peripheral.disconnect();
        }
        catch (error) {
          logger('error: unable to disconnect from Plejd: ' + error);
          return Promise.resolve(false);
        }

        this.isConnected = false;
        logger('disconnected from Plejd');

        return Promise.resolve(true);
      }
    }
    else {
      clearInterval(this.pingRef);
      this.isConnected = false;
      logger('disconnected from Plejd');

      return Promise.resolve(true);
    }
  }

  turnOn(id, brightness) {
    if (!this.isConnected) {
      logger('error: not connected');
      return;
    }

    logger('turning on ' + id + ' at brightness ' + brightness);

    var payload;

    if (!brightness) {
      payload = Buffer.from((id).toString(16).padStart(2, '0') + '0110009701', 'hex');
    } else {
      brightness = brightness << 8 | brightness;
      payload = Buffer.from((id).toString(16).padStart(2, '0') + '0110009801' + (brightness).toString(16).padStart(4, '0'), 'hex');
    }

    this.write(payload);
  }

  turnOff(id) {
    if (!this.isConnected) {
      logger('error: not connected');
      return;
    }

    logger('turning off ' + id);

    var payload = Buffer.from((id).toString(16).padStart(2, '0') + '0110009700', 'hex');
    this.write(payload);
  }

  startPing() {
    const self = this;

    clearInterval(this.pingRef);
    logger('starting ping');
    this.pingRef = setInterval(async () => {
      logger('ping');
      if (self.isConnected) {
        self.plejdPing(async (pingOk) => {

          if (!pingOk) {
            logger('ping failed');
            await self.disconnect();
            await self.connect();
          }
          else {
            logger('pong');
          }
        });
      }
      else {
        await self.disconnect();
        await self.connect();
      }
    }, 3000);
  }

  plejdPing(callback) {
    var ping = crypto.randomBytes(1);

    this.pingCharacteristic.write(ping, false, (err) => {
      if (err) {
        logger('error: unable to send ping: ' + err);
        callback(false);
      }

      this.pingCharacteristic.read((err, data) => {
        if (err) {
          logger('error: unable to read ping: ' + err);
          callback(false);
        }

        if (((ping[0] + 1) & 0xff) !== data[0]) {
          callback(false);
        }
        else {
          callback(true);
        }
      });
    });
  }

  async authenticate() {
    const self = this;

    logger('authenticating connection');
    this.authCharacteristic.write(Buffer.from([0]), false, (err) => {
      if (err) {
        logger('error: failed to authenticate: ' + err);
        return;
      }

      this.authCharacteristic.read(async (err2, data) => {
        if (err2) {
          logger('error: challenge request failed: ' + err2);
          return;
        }

        var resp = self._challengeResponse(self.cryptoKey, data);

        this.authCharacteristic.write(resp, false, (err3) => {
          if (err3) {
            logger('error: challenge failed: ' + err2);
            return;
          }

          this.emit('authenticated');
        });
      });
    });
  }

  async write(data) {
    const self = this;

    try {
      if (this.isConnecting) {
        this.writeQueue.push(data);
        return Promise.resolve(true);
      }

      if (!this.keepAlive) {
        await this.connect();
      }

      await this.dataCharacteristic.write(this._encryptDecrypt(this.cryptoKey, this.peripheral_address, data), false);

      let writeData;
      while ((writeData = this.writeQueue.shift()) !== undefined) {
        await this.dataCharacteristic.write(this._encryptDecrypt(this.cryptoKey, this.peripheral_address, writeData), false);
      }

      if (!this.keepAlive) {
        clearTimeout(this.disconnectIntervalRef);
        this.disconnectIntervalRef = setTimeout(async () => {
          await self.disconnect();
        }, 5000);
      }
    }
    catch (error) {
      logger('error when writing to plejd: ' + error);
    }
  }

  _challengeResponse(key, challenge) {
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

module.exports = { Controller };
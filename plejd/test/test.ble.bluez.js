const PlejdService = require('../ble.bluez');

const cryptoKey = '';

const plejd = new PlejdService(cryptoKey, true);
plejd.init();
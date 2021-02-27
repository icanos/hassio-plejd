const PlejdBLE = require('../PlejdBLEHandler');

const cryptoKey = '';

const plejd = new PlejdBLE(cryptoKey, true);
plejd.init();

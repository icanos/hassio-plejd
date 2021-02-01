const PlejdBLE = require('../PlejdBLE');

const cryptoKey = '';

const plejd = new PlejdBLE(cryptoKey, true);
plejd.init();

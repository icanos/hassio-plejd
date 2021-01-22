const PlejdService = require('../PlejdService');

const cryptoKey = '';

const plejd = new PlejdService(cryptoKey, true);
plejd.init();

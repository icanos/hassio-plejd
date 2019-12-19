const PlejdService = require('../ble');

const plejd = new PlejdService('todo-insert-crypto-key', true);
plejd.on('authenticated', () => {
    plejd.disconnect();
    console.log('ok, done! disconnected.');
});
plejd.scan();
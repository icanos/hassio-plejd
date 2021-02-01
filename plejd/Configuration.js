const fs = require('fs');

class Configuration {
  static _options = null;

  static getOptions() {
    if (!Configuration._options) {
      const rawData = fs.readFileSync('/data/options.json');
      const config = JSON.parse(rawData);

      const defaultRawData = fs.readFileSync('/plejd/config.json');
      const defaultConfig = JSON.parse(defaultRawData).options;

      Configuration._options = { ...defaultConfig, ...config };

      console.log('Config:', {
        ...Configuration._options,
        username: '---scrubbed---',
        password: '---scrubbed---',
        mqttPassword: '---scrubbed---',
      });
    }
    return Configuration._options;
  }
}

module.exports = Configuration;

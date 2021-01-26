const fs = require('fs');

class Configuration {
  static _config = null;

  static getConfiguration() {
    if (!Configuration._config) {
      const rawData = fs.readFileSync('/data/options.json');
      Configuration._config = JSON.parse(rawData);
    }
    return Configuration._config;
  }
}

module.exports = Configuration;

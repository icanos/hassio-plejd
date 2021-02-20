const EventEmitter = require('events');
const Configuration = require('./Configuration');
const constants = require('./constants');
const Logger = require('./Logger');
const PlejBLEHandler = require('./PlejdBLEHandler');

const { COMMANDS } = constants;
const logger = Logger.getLogger('device-comm');

const MAX_TRANSITION_STEPS_PER_SECOND = 5; // Could be made a setting
const MAX_RETRY_COUNT = 5; // Could be made a setting

class PlejdDeviceCommunication extends EventEmitter {
  bleDeviceTransitionTimers = {};
  plejdBleHandler;
  config;
  deviceRegistry;
  plejdDevices = {}; // Todo: Move to deviceRegistry?
  writeQueue = [];
  writeQueueRef = null;

  static EVENTS = {
    sceneTriggered: 'sceneTriggered',
    stateChanged: 'stateChanged',
  };

  constructor(deviceRegistry) {
    super();
    logger.info('Starting Plejd communication handler.');

    this.plejdBleHandler = new PlejBLEHandler(deviceRegistry);
    this.config = Configuration.getOptions();
    this.deviceRegistry = deviceRegistry;

    // eslint-disable-next-line max-len
    this.plejdBleHandler.on(PlejBLEHandler.EVENTS.commandReceived, (deviceId, command, data) => this._bleCommandReceived(deviceId, command, data));

    this.plejdBleHandler.on('connected', () => {
      logger.info('Bluetooth connected. Plejd BLE up and running!');
      this.startWriteQueue();
    });
    this.plejdBleHandler.on('reconnecting', () => {
      logger.info('Bluetooth reconnecting...');
      clearTimeout(this.writeQueueRef);
    });
  }

  async init() {
    try {
      await this.plejdBleHandler.init();
    } catch (err) {
      logger.error('Failed init() of BLE. Starting reconnect loop.');
      await this.plejdBleHandler.startReconnectPeriodicallyLoop();
    }
  }

  turnOn(deviceId, command) {
    const deviceName = this.deviceRegistry.getDeviceName(deviceId);
    logger.info(
      `Plejd got turn on command for ${deviceName} (${deviceId}), brightness ${command.brightness}${
        command.transition ? `, transition: ${command.transition}` : ''
      }`,
    );
    this._transitionTo(deviceId, command.brightness, command.transition, deviceName);
  }

  turnOff(deviceId, command) {
    const deviceName = this.deviceRegistry.getDeviceName(deviceId);
    logger.info(
      `Plejd got turn off command for ${deviceName} (${deviceId})${
        command.transition ? `, transition: ${command.transition}` : ''
      }`,
    );
    this._transitionTo(deviceId, 0, command.transition, deviceName);
  }

  _bleCommandReceived(deviceId, command, data) {
    try {
      if (command === COMMANDS.DIM) {
        this.plejdDevices[deviceId] = {
          state: data.state,
          dim: data.dim,
        };
        logger.silly(`All states: ${JSON.stringify(this.plejdDevices, null, 2)}`);
        this.emit(PlejdDeviceCommunication.EVENTS.stateChanged, deviceId, {
          state: data.state,
          brightness: data.dim,
        });
      } else if (command === COMMANDS.TURN_ON) {
        this.plejdDevices[deviceId] = {
          state: data.state,
          dim: 0,
        };
        logger.silly(`All states: ${JSON.stringify(this.plejdDevices, null, 2)}`);
        this.emit(PlejdDeviceCommunication.EVENTS.stateChanged, deviceId, {
          state: data.state,
        });
      } else if (command === COMMANDS.TRIGGER_SCENE) {
        this.emit(PlejdDeviceCommunication.EVENTS.sceneTriggered, deviceId, data.sceneId);
      } else {
        logger.warn(`Unknown ble command ${command}`);
      }
    } catch (error) {
      logger.error('Error processing ble command', error);
    }
  }

  _clearDeviceTransitionTimer(deviceId) {
    if (this.bleDeviceTransitionTimers[deviceId]) {
      clearInterval(this.bleDeviceTransitionTimers[deviceId]);
    }
  }

  _transitionTo(deviceId, targetBrightness, transition, deviceName) {
    const initialBrightness = this.plejdDevices[deviceId]
      ? this.plejdDevices[deviceId].state && this.plejdDevices[deviceId].dim
      : null;
    this._clearDeviceTransitionTimer(deviceId);

    const isDimmable = this.deviceRegistry.getDevice(deviceId).dimmable;

    if (
      transition > 1
      && isDimmable
      && (initialBrightness || initialBrightness === 0)
      && (targetBrightness || targetBrightness === 0)
      && targetBrightness !== initialBrightness
    ) {
      // Transition time set, known initial and target brightness
      // Calculate transition interval time based on delta brightness and max steps per second
      // During transition, measure actual transition interval time and adjust stepping continously
      // If transition <= 1 second, Plejd will do a better job
      // than we can in transitioning so transitioning will be skipped

      const deltaBrightness = targetBrightness - initialBrightness;
      const transitionSteps = Math.min(
        Math.abs(deltaBrightness),
        MAX_TRANSITION_STEPS_PER_SECOND * transition,
      );
      const transitionInterval = (transition * 1000) / transitionSteps;

      logger.debug(
        `transitioning from ${initialBrightness} to ${targetBrightness} ${
          transition ? `in ${transition} seconds` : ''
        }.`,
      );
      logger.verbose(
        `delta brightness ${deltaBrightness}, steps ${transitionSteps}, interval ${transitionInterval} ms`,
      );

      const dtStart = new Date();

      let nSteps = 0;

      this.bleDeviceTransitionTimers[deviceId] = setInterval(() => {
        const tElapsedMs = new Date().getTime() - dtStart.getTime();
        let tElapsed = tElapsedMs / 1000;

        if (tElapsed > transition || tElapsed < 0) {
          tElapsed = transition;
        }

        let newBrightness = Math.round(
          initialBrightness + (deltaBrightness * tElapsed) / transition,
        );

        if (tElapsed === transition) {
          nSteps++;
          this._clearDeviceTransitionTimer(deviceId);
          newBrightness = targetBrightness;
          logger.debug(
            `Queueing finalize ${deviceName} (${deviceId}) transition from ${initialBrightness} to ${targetBrightness} in ${tElapsedMs}ms. Done steps ${nSteps}. Average interval ${
              tElapsedMs / (nSteps || 1)
            } ms.`,
          );
          this._setBrightness(deviceId, newBrightness, true, deviceName);
        } else {
          nSteps++;
          logger.verbose(
            `Queueing dim transition for ${deviceName} (${deviceId}) to ${newBrightness}. Total queue length ${this.writeQueue.length}`,
          );
          this._setBrightness(deviceId, newBrightness, false, deviceName);
        }
      }, transitionInterval);
    } else {
      if (transition && isDimmable) {
        logger.debug(
          `Could not transition light change. Either initial value is unknown or change is too small. Requested from ${initialBrightness} to ${targetBrightness}`,
        );
      }
      this._setBrightness(deviceId, targetBrightness, true, deviceName);
    }
  }

  _setBrightness(deviceId, brightness, shouldRetry, deviceName) {
    if (!brightness && brightness !== 0) {
      logger.debug(
        `Queueing turn on ${deviceName} (${deviceId}). No brightness specified, setting DIM to previous.`,
      );
      this._appendCommandToWriteQueue(deviceId, COMMANDS.TURN_ON, null, shouldRetry);
    } else if (brightness <= 0) {
      logger.debug(`Queueing turn off ${deviceId}`);
      this._appendCommandToWriteQueue(deviceId, COMMANDS.TURN_OFF, null, shouldRetry);
    } else {
      if (brightness > 255) {
        // eslint-disable-next-line no-param-reassign
        brightness = 255;
      }

      logger.debug(`Queueing ${deviceId} set brightness to ${brightness}`);
      // eslint-disable-next-line no-bitwise
      this._appendCommandToWriteQueue(deviceId, COMMANDS.DIM, brightness, shouldRetry);
    }
  }

  _appendCommandToWriteQueue(deviceId, command, data, shouldRetry) {
    this.writeQueue.unshift({
      deviceId,
      command,
      data,
      shouldRetry,
    });
  }

  startWriteQueue() {
    logger.info('startWriteQueue()');
    clearTimeout(this.writeQueueRef);

    this.writeQueueRef = setTimeout(() => this.runWriteQueue(), this.config.writeQueueWaitTime);
  }

  async runWriteQueue() {
    try {
      while (this.writeQueue.length > 0) {
        const queueItem = this.writeQueue.pop();
        const deviceName = this.deviceRegistry.getDeviceName(queueItem.deviceId);
        logger.debug(
          `Write queue: Processing ${deviceName} (${queueItem.deviceId}). Command ${
            queueItem.command
          }${queueItem.data ? ` ${queueItem.data}` : ''}. Total queue length: ${this.writeQueue.length}`,
        );

        if (this.writeQueue.some((item) => item.deviceId === queueItem.deviceId)) {
          logger.verbose(
            `Skipping ${deviceName} (${queueItem.deviceId}) `
              + `${queueItem.command} due to more recent command in queue.`,
          );
          // Skip commands if new ones exist for the same deviceId
          // still process all messages in order
        } else {
          /* eslint-disable no-await-in-loop */
          try {
            await this.plejdBleHandler.sendCommand(
              queueItem.command,
              queueItem.deviceId,
              queueItem.data,
            );
          } catch (err) {
            if (queueItem.shouldRetry) {
              queueItem.retryCount = (queueItem.retryCount || 0) + 1;
              logger.debug(`Will retry command, count failed so far ${queueItem.retryCount}`);
              if (queueItem.retryCount <= MAX_RETRY_COUNT) {
                this.writeQueue.push(queueItem); // Add back to top of queue to be processed next;
              } else {
                logger.error(
                  `Write queue: Exceeed max retry count (${MAX_RETRY_COUNT}) for ${deviceName} (${queueItem.deviceId}). Command ${queueItem.command} failed.`,
                );
                break;
              }
              if (queueItem.retryCount > 1) {
                break; // First retry directly, consecutive after writeQueueWaitTime ms
              }
            }
          }
          /* eslint-enable no-await-in-loop */
        }
      }
    } catch (e) {
      logger.error('Error in writeQueue loop, values probably not written to Plejd', e);
    }

    this.writeQueueRef = setTimeout(() => this.runWriteQueue(), this.config.writeQueueWaitTime);
  }
}

module.exports = PlejdDeviceCommunication;

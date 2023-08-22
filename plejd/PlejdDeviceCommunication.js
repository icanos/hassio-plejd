const { EventEmitter } = require('events');
const Configuration = require('./Configuration');
const constants = require('./constants');
const Logger = require('./Logger');
const PlejBLEHandler = require('./PlejdBLEHandler');

const { COMMANDS } = constants;
const logger = Logger.getLogger('device-comm');

const MAX_TRANSITION_STEPS_PER_SECOND = 5; // Could be made a setting
const MAX_RETRY_COUNT = 10; // Could be made a setting

class PlejdDeviceCommunication extends EventEmitter {
  bleConnected;
  bleOutputTransitionTimers = {};
  plejdBleHandler;
  config;
  /** @type {import('./DeviceRegistry')} */
  deviceRegistry;
  // eslint-disable-next-line max-len
  /** @type {{uniqueOutputId: string, command: string, data: any, shouldRetry: boolean, retryCount?: number}[]} */
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
  }

  cleanup() {
    Object.values(this.bleOutputTransitionTimers).forEach((t) => clearTimeout(t));
    this.plejdBleHandler.cleanup();
    this.plejdBleHandler.removeAllListeners(PlejBLEHandler.EVENTS.commandReceived);
    this.plejdBleHandler.removeAllListeners(PlejBLEHandler.EVENTS.connected);
    this.plejdBleHandler.removeAllListeners(PlejBLEHandler.EVENTS.reconnecting);
  }

  async init() {
    try {
      this.cleanup();
      this.bleConnected = false;
      // eslint-disable-next-line max-len
      this.plejdBleHandler.on(
        PlejBLEHandler.EVENTS.commandReceived,
        (uniqueOutputId, command, data) => this._bleCommandReceived(uniqueOutputId, command, data),
      );

      this.plejdBleHandler.on(PlejBLEHandler.EVENTS.connected, () => {
        logger.info('Bluetooth connected. Plejd BLE up and running!');
        logger.verbose(`Starting writeQueue loop. Write queue length: ${this.writeQueue.length}`);
        this.bleConnected = true;
        this._startWriteQueue();
      });
      this.plejdBleHandler.on(PlejBLEHandler.EVENTS.reconnecting, () => {
        logger.info('Bluetooth reconnecting...');
        logger.verbose(
          `Stopping writeQueue loop until connection is established. Write queue length: ${this.writeQueue.length}`,
        );
        this.bleConnected = false;
        clearTimeout(this.writeQueueRef);
      });

      await this.plejdBleHandler.init();
    } catch (err) {
      logger.error('Failed init() of BLE. Starting reconnect loop.');
      await this.plejdBleHandler.startReconnectPeriodicallyLoop();
    }
  }

  turnOn(uniqueOutputId, command) {
    const deviceName = this.deviceRegistry.getOutputDeviceName(uniqueOutputId);
    logger.info(
      `Plejd got turn on command for ${deviceName} (${uniqueOutputId}), brightness ${
        command.brightness
      }${command.transition ? `, transition: ${command.transition}` : ''}`,
    );
    this._transitionTo(uniqueOutputId, command.brightness, command.transition, deviceName);
  }

  turnOff(uniqueOutputId, command) {
    const deviceName = this.deviceRegistry.getOutputDeviceName(uniqueOutputId);
    logger.info(
      `Plejd got turn off command for ${deviceName} (${uniqueOutputId})${
        command.transition ? `, transition: ${command.transition}` : ''
      }`,
    );
    this._transitionTo(uniqueOutputId, 0, command.transition, deviceName);
  }

  _bleCommandReceived(uniqueOutputId, command, data) {
    try {
      if (command === COMMANDS.DIM) {
        this.deviceRegistry.setOutputState(uniqueOutputId, data.state, data.dim);
        this.emit(PlejdDeviceCommunication.EVENTS.stateChanged, uniqueOutputId, {
          state: !!data.state,
          brightness: data.dim,
        });
      } else if (command === COMMANDS.TURN_ON) {
        this.deviceRegistry.setOutputState(uniqueOutputId, true);
        this.emit(PlejdDeviceCommunication.EVENTS.stateChanged, uniqueOutputId, {
          state: 1,
        });
      } else if (command === COMMANDS.TURN_OFF) {
        this.deviceRegistry.setOutputState(uniqueOutputId, false);
        this.emit(PlejdDeviceCommunication.EVENTS.stateChanged, uniqueOutputId, {
          state: 0,
        });
      } else if (command === COMMANDS.TRIGGER_SCENE) {
        this.emit(PlejdDeviceCommunication.EVENTS.sceneTriggered, data.sceneId);
      } else if (command === COMMANDS.BUTTON_CLICK) {
        this.emit(PlejdDeviceCommunication.EVENTS.buttonPressed, data.deviceId, data.deviceInput);
      } else {
        logger.warn(`Unknown ble command ${command}`);
      }
    } catch (error) {
      logger.error('Error processing ble command', error);
    }
  }

  _clearDeviceTransitionTimer(uniqueOutputId) {
    if (this.bleOutputTransitionTimers[uniqueOutputId]) {
      clearInterval(this.bleOutputTransitionTimers[uniqueOutputId]);
    }
  }

  _transitionTo(uniqueOutputId, targetBrightness, transition, deviceName) {
    const device = this.deviceRegistry.getOutputDevice(uniqueOutputId);
    const initialBrightness = device ? device.state && device.dim : null;
    this._clearDeviceTransitionTimer(uniqueOutputId);

    const isDimmable = this.deviceRegistry.getOutputDevice(uniqueOutputId).dimmable;

    if (
      transition > 1 &&
      isDimmable &&
      (initialBrightness || initialBrightness === 0) &&
      (targetBrightness || targetBrightness === 0) &&
      targetBrightness !== initialBrightness
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

      this.bleOutputTransitionTimers[uniqueOutputId] = setInterval(() => {
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
          this._clearDeviceTransitionTimer(uniqueOutputId);
          newBrightness = targetBrightness;
          logger.debug(
            `Queueing finalize ${deviceName} (${uniqueOutputId}) transition from ${initialBrightness} to ${targetBrightness} in ${tElapsedMs}ms. Done steps ${nSteps}. Average interval ${
              tElapsedMs / (nSteps || 1)
            } ms.`,
          );
          this._setBrightness(uniqueOutputId, newBrightness, true, deviceName);
        } else {
          nSteps++;
          logger.verbose(
            `Queueing dim transition for ${deviceName} (${uniqueOutputId}) to ${newBrightness}. Total queue length ${this.writeQueue.length}`,
          );
          this._setBrightness(uniqueOutputId, newBrightness, false, deviceName);
        }
      }, transitionInterval);
    } else {
      if (transition && isDimmable) {
        logger.debug(
          `Could not transition light change. Either initial value is unknown or change is too small. Requested from ${initialBrightness} to ${targetBrightness}`,
        );
      }
      this._setBrightness(uniqueOutputId, targetBrightness, true, deviceName);
    }
  }

  _setBrightness(unqiueOutputId, brightness, shouldRetry, deviceName) {
    if (!brightness && brightness !== 0) {
      logger.debug(
        `Queueing turn on ${deviceName} (${unqiueOutputId}). No brightness specified, setting DIM to previous.`,
      );
      this._appendCommandToWriteQueue(unqiueOutputId, COMMANDS.TURN_ON, null, shouldRetry);
    } else if (brightness <= 0) {
      logger.debug(`Queueing turn off ${unqiueOutputId}`);
      this._appendCommandToWriteQueue(unqiueOutputId, COMMANDS.TURN_OFF, null, shouldRetry);
    } else {
      if (brightness > 255) {
        // eslint-disable-next-line no-param-reassign
        brightness = 255;
      }

      logger.debug(`Queueing ${unqiueOutputId} set brightness to ${brightness}`);
      // eslint-disable-next-line no-bitwise
      this._appendCommandToWriteQueue(unqiueOutputId, COMMANDS.DIM, brightness, shouldRetry);
    }
  }

  _appendCommandToWriteQueue(uniqueOutputId, command, data, shouldRetry) {
    this.writeQueue.unshift({
      uniqueOutputId,
      command,
      data,
      shouldRetry,
    });
  }

  _startWriteQueue() {
    logger.info('startWriteQueue()');
    clearTimeout(this.writeQueueRef);

    this.writeQueueRef = setTimeout(() => this._runWriteQueue(), this.config.writeQueueWaitTime);
  }

  async _runWriteQueue() {
    try {
      while (this.writeQueue.length > 0) {
        if (!this.bleConnected) {
          logger.warn('BLE not connected, stopping write queue until connection is up again.');
          return;
        }
        const queueItem = this.writeQueue.pop();
        const device = this.deviceRegistry.getOutputDevice(queueItem.uniqueOutputId);

        logger.debug(
          `Write queue: Processing ${device.name} (${queueItem.uniqueOutputId}). Command ${
            queueItem.command
          }${queueItem.data ? ` ${queueItem.data}` : ''}. Total queue length: ${
            this.writeQueue.length
          }`,
        );

        if (this.writeQueue.some((item) => item.uniqueOutputId === queueItem.uniqueOutputId)) {
          logger.verbose(
            `Skipping ${device.name} (${queueItem.uniqueOutputId}) ` +
              `${queueItem.command} due to more recent command in queue.`,
          );
          // Skip commands if new ones exist for the same uniqueOutputId
          // still process all messages in order
        } else {
          /* eslint-disable no-await-in-loop */
          try {
            await this.plejdBleHandler.sendCommand(
              queueItem.command,
              device.bleOutputAddress,
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
                  `Write queue: Exceeed max retry count (${MAX_RETRY_COUNT}) for ${device.name} (${queueItem.uniqueOutputId}). Command ${queueItem.command} failed.`,
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

    this.writeQueueRef = setTimeout(() => this._runWriteQueue(), this.config.writeQueueWaitTime);
  }
}

module.exports = PlejdDeviceCommunication;

import axios, { type AxiosInstance } from 'axios';
import { readFile, writeFile } from 'fs/promises';
import type { 
  AddonConfiguration, 
  ApiSite, 
  CachedSite, 
  DeviceType,
  OutputDevice,
  InputDevice,
  SceneDevice
} from '@/types';
import { DeviceTypeEnum } from '@/types';
import { API, TRAITS, DEVICE_HARDWARE_IDS } from '@/lib/constants';
import { getLogger } from '@/lib/logger';
import type { DeviceRegistry } from '@/lib/device-registry';

const logger = getLogger('plejd-api');

export class PlejdApi {
  private sessionToken: string | null = null;
  private siteId: string | null = null;
  private siteDetails: ApiSite | null = null;

  constructor(
    private readonly deviceRegistry: DeviceRegistry,
    private readonly config: AddonConfiguration
  ) {}

  public async init(): Promise<void> {
    logger.info('Initializing Plejd API');
    
    const cache = await this.getCachedCopy();
    const cacheExists = cache?.siteId && cache?.siteDetails && cache?.sessionToken;

    logger.debug(`Prefer cache: ${this.config.preferCachedApiResponse}`);
    logger.debug(`Cache exists: ${cacheExists ? `Yes, created ${cache.dtCache}` : 'No'}`);

    if (this.config.preferCachedApiResponse && cacheExists) {
      logger.info(`Using cached response from ${cache.dtCache}`);
      this.siteId = cache.siteId;
      this.siteDetails = cache.siteDetails;
      this.sessionToken = cache.sessionToken;
    } else {
      try {
        await this.login();
        await this.getSites();
        await this.getSiteDetails();
        await this.saveCachedCopy();
      } catch (error) {
        if (cacheExists) {
          logger.warn('API request failed, using cached copy');
          this.siteId = cache.siteId;
          this.siteDetails = cache.siteDetails;
          this.sessionToken = cache.sessionToken;
        } else {
          logger.error('API request failed, no cached fallback available');
          throw error;
        }
      }
    }

    if (!this.siteDetails) {
      throw new Error('No site details available');
    }

    this.deviceRegistry.setApiSite(this.siteDetails);
    this.processDevices();
  }

  private async getCachedCopy(): Promise<CachedSite | null> {
    try {
      const rawData = await readFile('/data/cachedApiResponse.json', 'utf8');
      return JSON.parse(rawData) as CachedSite;
    } catch (error) {
      logger.warn('No cached API response found (normal on first run)');
      return null;
    }
  }

  private async saveCachedCopy(): Promise<void> {
    if (!this.siteId || !this.siteDetails || !this.sessionToken) {
      throw new Error('Cannot save cache - missing required data');
    }

    try {
      const cachedSite: CachedSite = {
        siteId: this.siteId,
        siteDetails: this.siteDetails,
        sessionToken: this.sessionToken,
        dtCache: new Date().toISOString()
      };
      
      await writeFile('/data/cachedApiResponse.json', JSON.stringify(cachedSite));
      logger.info('Cached API response saved');
    } catch (error) {
      logger.error('Failed to save API cache', error);
    }
  }

  private async login(): Promise<void> {
    logger.info(`Logging into ${this.config.site}`);

    try {
      const response = await this.getAxiosInstance().post(API.LOGIN_URL, {
        username: this.config.username,
        password: this.config.password
      });

      this.sessionToken = response.data.sessionToken as string;
      if (!this.sessionToken) {
        throw new Error('No session token received');
      }
      
      logger.info('Login successful');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 400) {
          throw new Error('Invalid credentials');
        } else if (status === 403) {
          throw new Error('Login forbidden - possibly throttled');
        }
      }
      throw new Error(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getSites(): Promise<void> {
    logger.info('Getting site list');

    try {
      const response = await this.getAxiosInstance().post(API.SITE_LIST_URL);
      const sites = response.data.result as Array<{ site: { title: string; siteId: string } }>;
      
      logger.info(`Found ${sites.length} sites: ${sites.map(s => s.site.title).join(', ')}`);

      const site = sites.find(s => s.site.title === this.config.site);
      if (!site) {
        throw new Error(`Site '${this.config.site}' not found`);
      }

      this.siteId = site.site.siteId;
      logger.info(`Selected site: ${this.config.site}`);
    } catch (error) {
      throw new Error(`Failed to get sites: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getSiteDetails(): Promise<void> {
    if (!this.siteId) {
      throw new Error('Site ID not available');
    }

    logger.info(`Getting site details for ${this.siteId}`);

    try {
      const response = await this.getAxiosInstance().post(API.SITE_DETAILS_URL, {
        siteId: this.siteId
      });

      const result = response.data.result as ApiSite[];
      if (result.length === 0) {
        throw new Error(`No site found with ID ${this.siteId}`);
      }

      this.siteDetails = result[0]!;
      
      if (!this.siteDetails.plejdMesh.cryptoKey) {
        throw new Error('No crypto key found for site');
      }

      logger.info(`Site details loaded for ${this.siteId}`);
    } catch (error) {
      throw new Error(`Failed to get site details: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private processDevices(): void {
    if (!this.siteDetails) return;

    logger.info('Processing devices from API response');

    if (this.siteDetails.gateways?.length) {
      this.siteDetails.gateways.forEach(gateway => {
        logger.info(`Found Plejd gateway: ${gateway.title}`);
      });
    }

    this.processPlejdDevices();
    this.processRoomDevices();
    this.processSceneDevices();
  }

  private processPlejdDevices(): void {
    if (!this.siteDetails) return;

    this.deviceRegistry.clearPlejdDevices();

    this.siteDetails.devices.forEach(device => {
      this.deviceRegistry.addPhysicalDevice(device);

      const outputSettings = this.siteDetails!.outputSettings.find(
        x => x.deviceParseId === device.objectId
      );

      const deviceOutput = outputSettings?.output ?? 0;
      const outputAddress = this.siteDetails!.outputAddress[device.deviceId];

      if (outputAddress) {
        const bleOutputAddress = outputAddress[deviceOutput]!;

        if (device.traits === TRAITS.NO_LOAD) {
          logger.warn(`Device ${device.title} has no load configured - excluding`);
          return;
        }

        const uniqueOutputId = this.deviceRegistry.getUniqueOutputId(device.deviceId, deviceOutput);
        const plejdDevice = this.siteDetails!.plejdDevices.find(x => x.deviceId === device.deviceId);

        if (!plejdDevice) {
          logger.warn(`No Plejd device found for ${device.deviceId}`);
          return;
        }

        try {
          const deviceType = this.getDeviceType(plejdDevice.hardwareId);
          const dimmable = device.traits === TRAITS.DIMMABLE || device.traits === TRAITS.DIMMABLE_COLORTEMP;
          
          let loadType = deviceType.type;
          if (device.outputType === 'RELAY') {
            loadType = DeviceTypeEnum.SWITCH;
          } else if (device.outputType === 'LIGHT') {
            loadType = DeviceTypeEnum.LIGHT;
          }

          const room = this.siteDetails!.rooms.find(x => x.roomId === device.roomId);

          const outputDevice: OutputDevice = {
            bleOutputAddress,
            colorTemp: null,
            colorTempSettings: outputSettings?.colorTemperature ?? null,
            deviceId: device.deviceId,
            dimmable,
            name: device.title,
            output: deviceOutput,
            roomId: device.roomId,
            roomName: room?.title,
            state: undefined,
            type: loadType,
            typeDescription: deviceType.description,
            typeName: deviceType.name,
            version: plejdDevice.firmware.version,
            uniqueId: uniqueOutputId
          };

          this.deviceRegistry.addOutputDevice(outputDevice);
        } catch (error) {
          logger.error(`Error creating output device: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        // Input device (buttons, etc.)
        const inputSettings = this.siteDetails!.inputSettings.filter(x => x.deviceId === device.deviceId);

        inputSettings.forEach(input => {
          const bleInputAddress = this.siteDetails!.deviceAddress[input.deviceId]!;
          const plejdDevice = this.siteDetails!.plejdDevices.find(x => x.deviceId === device.deviceId);

          if (!plejdDevice) return;

          try {
            const deviceType = this.getDeviceType(plejdDevice.hardwareId);

            if (deviceType.broadcastClicks) {
              const inputDevice: InputDevice = {
                bleInputAddress,
                deviceId: device.deviceId,
                name: device.title,
                input: input.input,
                roomId: device.roomId,
                type: deviceType.type,
                typeDescription: deviceType.description,
                typeName: deviceType.name,
                version: plejdDevice.firmware.version,
                uniqueId: this.deviceRegistry.getUniqueInputId(device.deviceId, input.input)
              };

              this.deviceRegistry.addInputDevice(inputDevice);
            }
          } catch (error) {
            logger.error(`Error creating input device: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        });
      }
    });
  }

  private processRoomDevices(): void {
    if (!this.config.includeRoomsAsLights || !this.siteDetails) return;

    logger.debug('Processing room devices');

    this.siteDetails.rooms.forEach(room => {
      const roomAddress = this.siteDetails!.roomAddress[room.roomId]!;
      const deviceIdsByRoom = this.deviceRegistry.getOutputDeviceIdsByRoomId(room.roomId);

      const dimmable = deviceIdsByRoom.some(deviceId => {
        const device = this.deviceRegistry.getOutputDevice(deviceId);
        return device?.dimmable ?? false;
      });

      const roomDevice: OutputDevice = {
        bleOutputAddress: roomAddress,
        deviceId: null,
        colorTemp: null,
        colorTempSettings: null,
        dimmable,
        name: room.title,
        output: undefined,
        roomId: undefined,
        roomName: undefined,
        state: undefined,
        type: DeviceTypeEnum.LIGHT,
        typeDescription: 'A Plejd room',
        typeName: 'Room',
        uniqueId: room.roomId,
        version: undefined
      };

      this.deviceRegistry.addOutputDevice(roomDevice);
    });
  }

  private processSceneDevices(): void {
    if (!this.siteDetails) return;

    this.deviceRegistry.clearSceneDevices();

    this.siteDetails.scenes.forEach(scene => {
      const sceneNum = this.siteDetails!.sceneIndex[scene.sceneId]!;
      
      const sceneDevice: SceneDevice = {
        bleOutputAddress: sceneNum,
        colorTemp: null,
        colorTempSettings: null,
        deviceId: undefined,
        dimmable: false,
        name: scene.title,
        output: undefined,
        roomId: undefined,
        roomName: undefined,
        state: false,
        type: DeviceTypeEnum.SCENE,
        typeDescription: 'A Plejd scene',
        typeName: DeviceTypeEnum.SCENE,
        version: undefined,
        uniqueId: scene.sceneId
      };

      this.deviceRegistry.addScene(sceneDevice);
    });
  }

  private getDeviceType(hardwareId: string): DeviceType {
    const id = parseInt(hardwareId, 10);

    // Map hardware IDs to device types
    if ((DEVICE_HARDWARE_IDS.DIM_01 as readonly number[]).includes(id)) {
      return {
        name: 'DIM-01',
        description: '1-channel dimmer LED, 300 VA',
        type: DeviceTypeEnum.LIGHT,
        dimmable: true,
        broadcastClicks: false
      };
    }

    if ((DEVICE_HARDWARE_IDS.WPH_01 as readonly number[]).includes(id)) {
      return {
        name: 'WPH-01',
        description: 'Wireless push button, 4 buttons',
        type: DeviceTypeEnum.DEVICE_AUTOMATION,
        dimmable: false,
        broadcastClicks: true
      };
    }

    if ((DEVICE_HARDWARE_IDS.LED_75 as readonly number[]).includes(id)) {
      return {
        name: 'LED-75',
        description: '1-channel LED dimmer/driver with tuneable white, 10 W',
        type: DeviceTypeEnum.LIGHT,
        dimmable: true,
        colorTemp: true,
        broadcastClicks: false
      };
    }

    // Add more device types as needed...

    throw new Error(`Unknown device type with hardware id ${hardwareId}`);
  }

  private getAxiosInstance(): AxiosInstance {
    const headers: Record<string, string> = {
      'X-Parse-Application-Id': API.APP_ID,
      'Content-Type': 'application/json'
    };

    if (this.sessionToken) {
      headers['X-Parse-Session-Token'] = this.sessionToken;
    }

    return axios.create({
      baseURL: API.BASE_URL,
      headers
    });
  }
}
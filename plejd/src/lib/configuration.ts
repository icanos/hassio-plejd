import { readFileSync } from 'fs';
import type { AddonConfiguration, AddonInfo } from '@/types';

class Configuration {
  private static instance: Configuration;
  private readonly config: AddonConfiguration;
  private readonly addonInfo: AddonInfo;

  private constructor() {
    this.config = this.loadConfiguration();
    this.addonInfo = this.loadAddonInfo();
  }

  public static getInstance(): Configuration {
    if (!Configuration.instance) {
      Configuration.instance = new Configuration();
    }
    return Configuration.instance;
  }

  public getOptions(): AddonConfiguration {
    return this.config;
  }

  public getAddonInfo(): AddonInfo {
    return this.addonInfo;
  }

  private loadConfiguration(): AddonConfiguration {
    try {
      const configData = readFileSync('/data/options.json', 'utf8');
      const parsed = JSON.parse(configData) as Record<string, unknown>;
      
      return {
        site: this.validateString(parsed.site, 'Default Site'),
        username: this.validateString(parsed.username, ''),
        password: this.validateString(parsed.password, ''),
        mqttBroker: this.validateString(parsed.mqttBroker, 'mqtt://'),
        mqttUsername: this.validateString(parsed.mqttUsername, ''),
        mqttPassword: this.validateString(parsed.mqttPassword, ''),
        includeRoomsAsLights: this.validateBoolean(parsed.includeRoomsAsLights, false),
        preferCachedApiResponse: this.validateBoolean(parsed.preferCachedApiResponse, false),
        updatePlejdClock: this.validateBoolean(parsed.updatePlejdClock, false),
        logLevel: this.validateLogLevel(parsed.logLevel, 'info'),
        connectionTimeout: this.validateNumber(parsed.connectionTimeout, 2),
        writeQueueWaitTime: this.validateNumber(parsed.writeQueueWaitTime, 400)
      };
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private loadAddonInfo(): AddonInfo {
    try {
      const configData = readFileSync('/app/config.json', 'utf8');
      const parsed = JSON.parse(configData) as Record<string, unknown>;
      
      return {
        version: this.validateString(parsed.version, '0.0.0'),
        name: this.validateString(parsed.name, 'Plejd'),
        slug: this.validateString(parsed.slug, 'plejd')
      };
    } catch (error) {
      throw new Error(`Failed to load addon info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private validateString(value: unknown, defaultValue: string): string {
    return typeof value === 'string' ? value : defaultValue;
  }

  private validateBoolean(value: unknown, defaultValue: boolean): boolean {
    return typeof value === 'boolean' ? value : defaultValue;
  }

  private validateNumber(value: unknown, defaultValue: number): number {
    return typeof value === 'number' && !isNaN(value) ? value : defaultValue;
  }

  private validateLogLevel(value: unknown, defaultValue: AddonConfiguration['logLevel']): AddonConfiguration['logLevel'] {
    const validLevels: AddonConfiguration['logLevel'][] = ['error', 'warn', 'info', 'debug', 'verbose', 'silly'];
    return typeof value === 'string' && validLevels.includes(value as AddonConfiguration['logLevel']) 
      ? value as AddonConfiguration['logLevel'] 
      : defaultValue;
  }
}

export const configuration = Configuration.getInstance();
export const getOptions = (): AddonConfiguration => configuration.getOptions();
export const getAddonInfo = (): AddonInfo => configuration.getAddonInfo();
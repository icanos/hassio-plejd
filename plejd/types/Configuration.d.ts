/* eslint-disable no-use-before-define */

export interface AddonInfo {
  name: string;
  version: string;
  slug: string;
  description: string;
  url: string;
  arch: string[];
  startup: string;
  boot: string;
  host_network: boolean;
  host_dbus: boolean;
  apparmor: boolean;
}

export interface Configuration extends AddonInfo {
  options: Options;
  schema: Schema;
}

export interface Options {
  site: string;
  username: string;
  password: string;
  mqttBroker: string;
  mqttUsername: string;
  mqttPassword: string;
  includeRoomsAsLights: boolean;
  preferCachedApiResponse: boolean;
  updatePlejdClock: boolean;
  logLevel: string;
  connectionTimeout: number;
  writeQueueWaitTime: number;
}

export interface Schema {
  site: string;
  username: string;
  password: string;
  mqttBroker: string;
  mqttUsername: string;
  mqttPassword: string;
  includeRoomsAsLights: string;
  preferCachedApiResponse: string;
  updatePlejdClock: string;
  logLevel: string;
  connectionTimeout: string;
  writeQueueWaitTime: string;
}

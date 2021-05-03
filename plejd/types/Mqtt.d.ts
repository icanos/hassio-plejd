/* eslint-disable no-use-before-define */

export type TopicType = 'config' | 'state' | 'availability' | 'set';
export type TOPIC_TYPES = { [key: string]: TopicType };

export type MqttType = 'light' | 'scene' | 'switch' | 'device_automation';
export type MQTT_TYPES = { [key: string]: MqttType };

export interface OutputDevice {
  bleOutputAddress: number;
  deviceId: string;
  dim?: number;
  dimmable: boolean;
  hiddenFromRoomList?: boolean;
  hiddenFromIntegrations?: boolean;
  hiddenFromSceneList?: boolean;
  name: string;
  output: number;
  roomId: string;
  state: boolean | undefined;
  type: string;
  typeName: string;
  version: string;
  uniqueId: string;
}

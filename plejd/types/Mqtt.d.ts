/* eslint-disable no-use-before-define */

export type TopicType = 'config' | 'state' | 'availability' | 'set';
export type TOPIC_TYPES = { [key: string]: TopicType };

export type MqttType = 'light' | 'scene' | 'switch' | 'device_automation';
export type MQTT_TYPES = { [key: string]: MqttType };

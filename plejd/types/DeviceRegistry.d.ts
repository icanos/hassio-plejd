/* eslint-disable no-use-before-define */

export type OutputDevices = { [deviceIdAndOutput: string]: OutputDevice };

export interface OutputDevice {
  bleOutputAddress: number;
  deviceId: string;
  dim?: number;
  dimmable: boolean;
  name: string;
  output: number;
  roomId: string | undefined;
  roomName: string | undefined;
  state: boolean | undefined;
  type: string;
  typeDescription: string;
  typeName: string;
  version: string;
  uniqueId: string;
}

export type InputDevices = { [deviceIdAndOutput: string]: InputDevice };

export interface InputDevice {
  bleInputAddress: number;
  deviceId: string;
  name: string;
  input: number;
  roomId: string;
  type: string;
  typeDescription: string;
  typeName: string;
  version: string;
  uniqueId: string;
}

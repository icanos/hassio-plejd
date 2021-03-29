/* eslint-disable no-use-before-define */

export type OutputDevices = { [deviceIdAndOutput: string]: OutputDevice };

export interface OutputDevice {
  bleDeviceIndex: number;
  deviceId: string;
  dim?: number;
  dimmable: boolean;
  hiddenFromRoomList?: boolean;
  hiddenFromIntegrations?: boolean;
  hiddenFromSceneList?: boolean;
  name: string;
  output: number;
  roomId: string;
  state: number | undefined;
  type: string;
  typeName: string;
  version: string;
  uniqueId: string;
}

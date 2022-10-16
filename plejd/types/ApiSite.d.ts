/* eslint-disable camelcase */
/* eslint-disable no-use-before-define */

export interface CachedSite {
  siteId: string;
  siteDetails: ApiSite;
  sessionToken: string;
  dtCache: string;
}

export interface ApiSite {
  site: SiteDetailsSite;
  plejdMesh: PlejdMesh;
  rooms: Room[];
  scenes: Scene[];
  devices: Device[];
  plejdDevices: PlejdDevice[];
  gateways: Gateway[];
  resourceSets: ResourceSet[];
  timeEvents: TimeEvent[];
  sceneSteps: SceneStep[];
  astroEvents: AstroEvent[];
  inputSettings: InputSetting[];
  outputSettings: OutputSetting[];
  stateTimers: StateTimers;
  sitePermission: SitePermission;
  inputAddress: { [key: string]: { [key: string]: number } };
  outputAddress: { [key: string]: OutputAddress };
  deviceAddress: { [key: string]: number };
  outputGroups: { [key: string]: OutputGroup };
  roomAddress: { [key: string]: number };
  sceneIndex: { [key: string]: number };
  images: string;
  deviceLimit: number;
}

export interface AstroEvent {
  dirtyDevices?: any[];
  dirtyRemovedDevices?: any[];
  deviceId: string;
  siteId: string;
  sceneId: string;
  fadeTime: number;
  activated: boolean;
  astroEventId: string;
  index: number;
  sunriseOffset: number;
  sunsetOffset: number;
  pauseStart: string;
  pauseEnd: string;
  createdAt: Date;
  updatedAt: Date;
  dirtyRemove?: boolean;
  ACL: AstroEventACL;
  targetDevices: AstroEventTargetDevice[];
  objectId: string;
  __type: AstroEventType;
  className: string;
}

export interface AstroEventACL {}

export enum AstroEventType {
  Object = 'Object',
}

export interface AstroEventTargetDevice {
  deviceId: string;
  index: number;
}

export interface Device {
  deviceId: string;
  siteId: string;
  roomId: string;
  title: string;
  traits: number;
  hardware?: Hardware;
  hiddenFromRoomList: boolean;
  createdAt: Date;
  updatedAt: Date;
  outputType: OutputType;
  ACL: AstroEventACL;
  objectId: string;
  __type: AstroEventType;
  className: DeviceClassName;
  hiddenFromIntegrations?: boolean;
}

export enum DeviceClassName {
  Device = 'Device',
}

export interface Hardware {
  createdAt: Date;
  updatedAt: Date;
  name: Name;
  hardwareId: string;
  minSupportedFirmware: PlejdMeshClass;
  latestFirmware: PlejdMeshClass;
  brand: Brand;
  type: Type;
  image: Image;
  requiredAccountType: RequiredAccountType[];
  numberOfDevices: number;
  predefinedLoad: PredefinedLoad;
  supportedFirmware: PredefinedLoad;
  ACL: AstroEventACL;
  objectId: string;
  __type: AstroEventType;
  className: HardwareClassName;
}

export enum Brand {
  PlejdLight = 'Plejd Light',
}

export enum HardwareClassName {
  Hardware = 'Hardware',
}

export interface Image {
  __type: ImageType;
  name: string;
  url: string;
}

export enum ImageType {
  File = 'File',
}

export interface PlejdMeshClass {
  __type: InstallerType;
  className: SiteClassName;
  objectId: string;
}

export enum InstallerType {
  Pointer = 'Pointer',
}

export enum SiteClassName {
  DimCurve = 'DimCurve',
  Firmware = 'Firmware',
  PlejdMesh = 'PlejdMesh',
  Site = 'Site',
  User = '_User',
  UserProfile = 'UserProfile',
}

export enum Name {
  Ctr01 = 'CTR-01',
  Dim01 = 'DIM-01',
}

export interface PredefinedLoad {
  __type: SupportedFirmwareType;
  className: PredefinedLoadClassName;
}

export enum SupportedFirmwareType {
  Relation = 'Relation',
}

export enum PredefinedLoadClassName {
  DimCurve = 'DimCurve',
  Firmware = 'Firmware',
  PredefinedLoad = 'PredefinedLoad',
}

export enum RequiredAccountType {
  Installer = 'installer',
}

export enum Type {
  Controller = 'Controller',
  LEDDimmer = 'LED Dimmer',
}

export enum OutputType {
  Light = 'LIGHT',
  Relay = 'RELAY',
}

export interface Gateway {
  title: string;
  deviceId: string;
  siteId: string;
  hardwareId: string;
  installer: string;
  firmware: number;
  firmwareObject: Firmware;
  dirtyInstall: boolean;
  dirtyUpdate: boolean;
  createdAt: Date;
  updatedAt: Date;
  factoryKey: string;
  resourceSetId: string;
  ACL: AstroEventACL;
  objectId: string;
  __type: AstroEventType;
  className: string;
}

export interface Firmware {
  notes: string;
  createdAt: Date;
  updatedAt: Date;
  data: Image;
  metaData: Image;
  version: string;
  buildTime: number;
  firmwareApi: string;
  ACL: AstroEventACL;
  objectId: string;
  __type: AstroEventType;
  className: SiteClassName;
}

export interface InputSetting {
  deviceId: string;
  input: number;
  siteId: string;
  dimSpeed: number;
  buttonType: ButtonType;
  createdAt: Date;
  updatedAt: Date;
  ACL: AstroEventACL;
  objectId: string;
  __type: AstroEventType;
  className: InputSettingClassName;
  doubleClick?: string;
  singleClick?: null;
  doubleSidedDirectionButton?: boolean;
}

export enum ButtonType {
  PushButton = 'PushButton',
  DirectionUp = 'DirectionUp',
  DirectionDown = 'DirectionDown',
  RotateMesh = 'RotateMesh',
  Scene = 'Scene',
}

export enum InputSettingClassName {
  PlejdDeviceInputSetting = 'PlejdDeviceInputSetting',
}

export interface OutputAddress {
  '0': number;
}

export interface OutputGroup {
  '0': number[];
}

export interface OutputSetting {
  deviceId: string;
  output: number;
  deviceParseId: string;
  siteId: string;
  predefinedLoad: OutputSettingPredefinedLoad;
  createdAt: Date;
  updatedAt: Date;
  dimMin: number;
  dimMax: number;
  dimStart: number;
  outputStartTime: number;
  outputSpeed: number;
  bootState: BootState;
  dimCurve: DimCurve;
  curveLogarithm: number;
  curveSinusCompensation: number;
  curveRectification: boolean;
  output_0_10V_Mode?: Output0_10_VMode;
  zeroCrossing?: Output0_10_VMode;
  minimumRelayOffTime?: number;
  ACL: AstroEventACL;
  objectId: string;
  __type: AstroEventType;
  className: OutputSettingClassName;
  ledCurrent?: number;
  ledVoltage?: number;
  relayConfig?: Output0_10_VMode;
}

export enum BootState {
  UseLast = 'UseLast',
}

export enum OutputSettingClassName {
  PlejdDeviceOutputSetting = 'PlejdDeviceOutputSetting',
}

export enum DimCurve {
  LinearLogarithmicSlidingProportion = 'LinearLogarithmicSlidingProportion',
  NonDimmable = 'NonDimmable',
}

export enum Output0_10_VMode {
  Unknown = 'Unknown',
}

export interface OutputSettingPredefinedLoad {
  updatedAt: Date;
  createdAt: Date;
  loadType: string;
  predefinedLoadData: string;
  defaultDimCurve: PlejdMeshClass;
  description_en?: DescriptionEn;
  title_en?: TitleEn;
  title_sv?: TitleSv;
  description_sv?: DescriptionSv;
  titleKey: string;
  descriptionKey: string;
  allowedDimCurves: PredefinedLoad;
  ACL: PredefinedLoadACL;
  objectId: string;
  __type: AstroEventType;
  className: PredefinedLoadClassName;
  supportMessage?: SupportMessage;
  filters?: Filters;
}

export interface PredefinedLoadACL {
  '*': Empty;
}

export interface Empty {
  read: boolean;
}

export enum DescriptionEn {
  OnOff = 'On / Off',
  OnlySwitchingOffOn = 'Only switching off/on',
  The230VDimmableLEDLightSourceMax100VA = '230V dimmable LED light source - Max 100VA',
  The230VIncandescentHalogenElectronicTransformatorMax300W = '230V Incandescent / Halogen, Electronic transformator - Max 300W',
  WithoutRelay = 'Without relay',
}

export enum DescriptionSv {
  EndastBrytningAVPå = 'Endast brytning av/på',
  ReläbrytningAVPå = 'Reläbrytning av/på',
  The230VDimbarLEDLjuskällaMax100VA = '230V dimbar LED ljuskälla - Max 100VA',
  The230VDimbarLEDLjuskällaMax200VA = '230V dimbar LED ljuskälla - Max 200VA',
  The230VHalogenGlödljusElektroniskTransformatorMax300W = '230V Halogen  / Glödljus, Elektronisk transformator - Max 300W',
  UtanReläbrytning = 'Utan reläbrytning',
}

export interface Filters {
  allowedCountriesFilter: AllowedCountriesFilter;
}

export interface AllowedCountriesFilter {
  countryCodes: CountryCode[];
}

export enum CountryCode {
  Fi = 'FI',
  No = 'NO',
  SE = 'SE',
}

export enum SupportMessage {
  PredefinedLoadNonDimmableSupportMessageHTML = 'PredefinedLoadNonDimmableSupportMessageHTML',
}

export enum TitleEn {
  IncandescentHalogen = 'Incandescent / Halogen',
  LEDTrailingEdgeCommon = 'LED Trailing Edge (Common)',
  LeadingEdge = 'Leading edge',
  NonDimmableLEDLightSourceMax200VA = 'Non-dimmable LED light source (Max 200VA)',
  RelayOnly = 'Relay only',
  The010V = '0-10V',
}

export enum TitleSv {
  EjDimbarLEDLjuskällaMax200VA = 'Ej dimbar LED-ljuskälla (Max 200VA)',
  HalogenGlödljus = 'Halogen / Glödljus',
  LEDBakkantVanligast = 'LED Bakkant (Vanligast)',
  LEDFramkant = 'LED Framkant',
  Reläfunktion = 'Reläfunktion',
  The010V = '0-10V',
}

export interface PlejdDevice {
  deviceId: string;
  installer: PlejdMeshClass;
  dirtyInstall: boolean;
  dirtyUpdate: boolean;
  dirtyClock: boolean;
  hardwareId: string;
  faceplateId: string;
  firmware: Firmware;
  createdAt: Date;
  updatedAt: Date;
  coordinates: Coordinates;
  dirtySettings: boolean;
  diagnostics: string;
  siteId: string;
  predefinedLoad: OutputSettingPredefinedLoad;
  ACL: AstroEventACL;
  objectId: string;
  __type: AstroEventType;
  className: PlejdDeviceClassName;
}

export enum PlejdDeviceClassName {
  PlejdDevice = 'PlejdDevice',
}

export interface Coordinates {
  __type: CoordinatesType;
  latitude: number;
  longitude: number;
}

export enum CoordinatesType {
  GeoPoint = 'GeoPoint',
}

export interface PlejdMesh {
  siteId: string;
  plejdMeshId: string;
  meshKey: string;
  cryptoKey: string;
  createdAt: Date;
  updatedAt: Date;
  site: PlejdMeshClass;
  ACL: AstroEventACL;
  objectId: string;
  __type: AstroEventType;
  className: SiteClassName;
}

export interface ResourceSet {
  scopes: string[];
  remoteAccessUsers: string[];
  name: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
  ACL: AstroEventACL;
  objectId: string;
  __type: AstroEventType;
  className: string;
}

export interface Room {
  siteId: string;
  roomId: string;
  title: string;
  category: string;
  imageHash: number;
  createdAt: Date;
  updatedAt: Date;
  ACL: AstroEventACL;
  objectId: string;
  __type: AstroEventType;
  className: RoomClassName;
}

export enum RoomClassName {
  Room = 'Room',
}

export interface SceneStep {
  sceneId: string;
  siteId: string;
  deviceId: string;
  state: State;
  value: number;
  output: number;
  createdAt: Date;
  updatedAt: Date;
  ACL: AstroEventACL;
  objectId: string;
  __type: AstroEventType;
  className: SceneStepClassName;
  dirty?: boolean;
  dirtyRemoved?: boolean;
}

export enum SceneStepClassName {
  SceneStep = 'SceneStep',
}

export enum State {
  Off = 'Off',
  On = 'On',
}

export interface Scene {
  title: string;
  sceneId: string;
  siteId: string;
  hiddenFromSceneList: boolean;
  settings: string;
  createdAt: Date;
  updatedAt: Date;
  ACL: AstroEventACL;
  objectId: string;
  __type: AstroEventType;
  className: ButtonType;
}

export interface SiteDetailsSite {
  installers: string[];
  title: string;
  siteId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  plejdMesh: PlejdMeshClass;
  coordinates: Coordinates;
  astroTable: AstroTable;
  deviceAstroTable: DeviceAstroTable;
  zipCode: string;
  city: string;
  country: string;
  previousOwners: string[];
  ACL: AstroEventACL;
  objectId: string;
  __type: AstroEventType;
  className: SiteClassName;
}

export interface AstroTable {
  sunrise: string[];
  sunset: string[];
}

export interface DeviceAstroTable {
  sunrise: number[];
  sunset: number[];
}

export interface SitePermission {
  siteId: string;
  userId: string;
  user: User;
  isOwner: boolean;
  isInstaller: boolean;
  isUser: boolean;
  site: SiteDetailsSite;
  createdAt: Date;
  updatedAt: Date;
  ACL: AstroEventACL;
  objectId: string;
  __type: AstroEventType;
  className: string;
}

export interface User {
  profileName: string;
  isInstaller: boolean;
  email: string;
  locale: string;
  username: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  profile: PlejdMeshClass;
  _failed_login_count: number;
  hasIntegration: boolean;
  ACL: UserACL;
  objectId: string;
  __type: AstroEventType;
  className: SiteClassName;
}

export interface UserACL {
  gX1W4p06QS: GX1W4P06QS;
}

export interface GX1W4P06QS {
  read: boolean;
  write: boolean;
}

export interface StateTimers {
  SafetyTimer: any[];
}

export interface TimeEvent {
  dirtyDevices?: any[];
  dirtyRemovedDevices?: any[];
  scheduledDays: number[];
  deviceId: string;
  siteId: string;
  sceneId: string;
  fadeTime: number;
  activated: boolean;
  timeEventId: string;
  startTimeIndex: number;
  endTimeIndex: number;
  startTime: string;
  endTime: string;
  createdAt: Date;
  updatedAt: Date;
  dirtyRemove?: boolean;
  ACL: AstroEventACL;
  targetDevices: TimeEventTargetDevice[];
  objectId: string;
  __type: AstroEventType;
  className: string;
}

export interface TimeEventTargetDevice {
  deviceId: string;
  startTimeIndex: number;
  endTimeIndex: number;
}

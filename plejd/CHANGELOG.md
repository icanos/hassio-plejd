# Changelog hassio-plejd Home Assistant Plejd addon

## [0.8.0-beta](https://github.com/icanos/hassio-plejd/tree/0.8.0-beta) (2021-06-14)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.7.1...0.8.0-beta)

**BREAKING - READ BELOW FIRST**

Release 0.8 and later will break ALL EXISTING DEVICES from earlier versions. Unique mqtt id:s will change, meaning HA will create new devices. Scenes will be added as scenes not as switches. Devices will be installed to Areas named by the rooms defined in the Plejd app (can be changed)

Recommendations to minimize impact

- Optionally install MQTT explorer to bulk-delete discovered devices. If so - start MQTT explorer, connect, restart Plejd addon and then delete from MQTT explorer
- Shut down Plejd addon, disable autostart
- Reboot HA
- Go to Configuration => Integration => MQTT. Go to entities and after that devices and remove all Plejd devices (should be listed as unavailable)
- Upgrade addon to latest version and start
- All devices should now be back. With luck they will have the same HA id:s as before so most things should work. Room assignments, icons, automations, scenes, etc will have to be gone though.
- If all else fails you can uninstall the Plejd addon and the Mqtt addon (which should remove all Mqtt devices after restart), re-install and get back the same device id:s as you had before.

**Closed issues:**

- Repostitory structure for 0.7.1 is not compliant [\#202](https://github.com/icanos/hassio-plejd/issues/202)
- Configuration instruction outdated [\#189](https://github.com/icanos/hassio-plejd/issues/189)
- Cant turn on lights after update [\#183](https://github.com/icanos/hassio-plejd/issues/183)
- Discovery finds lights but claims not to [\#182](https://github.com/icanos/hassio-plejd/issues/182)
- MQTTS connection problems with mqtt@~3.0.0 [\#181](https://github.com/icanos/hassio-plejd/issues/181)
- Adding repository to HACS [\#180](https://github.com/icanos/hassio-plejd/issues/180)
- WPH-01 buttons to trigger generic automations in HA [\#172](https://github.com/icanos/hassio-plejd/issues/172)
- Scene id and device id can overlap meaning mqtt commands overlap [\#161](https://github.com/icanos/hassio-plejd/issues/161)
- Add to "Tested on" section [\#122](https://github.com/icanos/hassio-plejd/issues/122)
- USB Bluetooth adapter  [\#101](https://github.com/icanos/hassio-plejd/issues/101)
- Ignores devices if they have same name [\#91](https://github.com/icanos/hassio-plejd/issues/91)
- Scene does not change state [\#85](https://github.com/icanos/hassio-plejd/issues/85)

**Merged pull requests:**

- Release 0.8.0-beta [\#204](https://github.com/icanos/hassio-plejd/pull/204) ([SweVictor](https://github.com/SweVictor))
- Added more documentation to install steps [\#201](https://github.com/icanos/hassio-plejd/pull/201) ([polyzois](https://github.com/polyzois))
- Fix for issue discussed in \#198.  [\#199](https://github.com/icanos/hassio-plejd/pull/199) ([faanskit](https://github.com/faanskit))
- Suggested Area and fix for \#189 [\#192](https://github.com/icanos/hassio-plejd/pull/192) ([faanskit](https://github.com/faanskit))
- Support for WPH-01 and WRT-01 added.  [\#188](https://github.com/icanos/hassio-plejd/pull/188) ([faanskit](https://github.com/faanskit))
- Refactor unique id handling throughout the addon [\#179](https://github.com/icanos/hassio-plejd/pull/179) ([SweVictor](https://github.com/SweVictor))
- Update README.md [\#178](https://github.com/icanos/hassio-plejd/pull/178) ([zissou1](https://github.com/zissou1))

## [0.7.1](https://github.com/icanos/hassio-plejd/tree/0.7.1) (2021-03-25)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.7.0...0.7.1)

**Closed issues:**

- Can't connect to device: TypeError: Cannot read property 'dimmable' [\#175](https://github.com/icanos/hassio-plejd/issues/175)

**Merged pull requests:**
- Release 0.7.1 [\#177](https://github.com/icanos/hassio-plejd/pull/177) ([SweVictor](https://github.com/SweVictor))

## [0.7.0](https://github.com/icanos/hassio-plejd/tree/0.7.0) (2021-03-23)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.6.2...0.7.0)

**Closed issues:**

- \[plejd-ble\] Unable to connect. Software caused connection abort [\#173](https://github.com/icanos/hassio-plejd/issues/173)
- All logs seam to be OK but it´s not working anyway [\#171](https://github.com/icanos/hassio-plejd/issues/171)
- Include rooms as lights does not work in 0.6.1 [\#169](https://github.com/icanos/hassio-plejd/issues/169)

**Merged pull requests:**

- Feature/restructure ble [\#167](https://github.com/icanos/hassio-plejd/pull/167) ([SweVictor](https://github.com/SweVictor))

### [0.6.2](https://github.com/icanos/hassio-plejd/tree/0.6.2) (2021-02-27)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.6.1...0.6.2)

**Closed issues:**

- Include rooms as lights does not work in 0.6.1 [\#169](https://github.com/icanos/hassio-plejd/issues/169)

### [0.6.1](https://github.com/icanos/hassio-plejd/tree/0.6.1) (2021-02-20)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.6.0...0.6.1)

**Implemented enhancements:**

- Feature Request: Support setting the Plejd Network System Clock [\#130](https://github.com/icanos/hassio-plejd/issues/130)

**Closed issues:**

- Set Plejd devices' clock hourly [\#165](https://github.com/icanos/hassio-plejd/issues/165)

### [0.6.0](https://github.com/icanos/hassio-plejd/tree/0.6.0) (2021-01-30)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.5.1...0.6.0)

**Implemented enhancements:**

- Code restructure testing/input/code review [\#158](https://github.com/icanos/hassio-plejd/issues/158)
- Offline mode [\#148](https://github.com/icanos/hassio-plejd/issues/148)

**Fixed bugs:**

- Brightness level incorrect with RTR-01 and WPH-01 [\#159](https://github.com/icanos/hassio-plejd/issues/159)

**Closed issues:**

- \[plejd-api\] Unable to retrieve session token response: Request failed with status code 403 Error: Request failed with status code 403 [\#162](https://github.com/icanos/hassio-plejd/issues/162)
- Can't turn on/off lights after last update [\#157](https://github.com/icanos/hassio-plejd/issues/157)
- Brightness level incorrect when changing with RTR-01 or WPH-01 [\#138](https://github.com/icanos/hassio-plejd/issues/138)
- plejd-ble reconnect attempts [\#123](https://github.com/icanos/hassio-plejd/issues/123)
- unable to retrieve session token response: Error: Request failed with status code 404 \(and 403\) [\#99](https://github.com/icanos/hassio-plejd/issues/99)
- Unable to scan BT Plejd [\#97](https://github.com/icanos/hassio-plejd/issues/97)

### [0.5.1](https://github.com/icanos/hassio-plejd/tree/0.5.1) (2021-01-30)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.5.0...0.5.1)

**Merged pull requests:**

- Fix CRLF line endings that snuck into plejd.sh [\#155](https://github.com/icanos/hassio-plejd/pull/155) ([SweVictor](https://github.com/SweVictor))

## [0.5.0](https://github.com/icanos/hassio-plejd/tree/0.5.0) (2021-01-30)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.4.8...0.5.0)

**New features:**

- Improved transitions due to new per-device queue of commands
- Completely rewritten and improved logging for js to improve code structure and user experience

**Implemented enhancements:**

- Adjust code to airbnb style guide, including eslint rules and prettier config
- Updated dependencies
- Improved readme with info about installation, debugging, and logging

**Fixed bugs:**

- Fix wrong initial brightness when transitioning turned-off lights
- Fix includeRoomsAsLights setting

**Closed issues:**

- Remove or fix mqtt settings code [\#147](https://github.com/icanos/hassio-plejd/issues/147)
- Errors in BLE cause addon to reinitialize [\#143](https://github.com/icanos/hassio-plejd/issues/143)
- Cannot read property 'length' of undefined - when turning of the light [\#134](https://github.com/icanos/hassio-plejd/issues/134)
- Idea: Add device id and shouldRetry to writeQueue [\#128](https://github.com/icanos/hassio-plejd/issues/128)
- Request: Clarify versions/readme [\#126](https://github.com/icanos/hassio-plejd/issues/126)
- light.turn_off turns the lights on [\#124](https://github.com/icanos/hassio-plejd/issues/124)
- startWriteQueue\(\) - Nothing happens [\#120](https://github.com/icanos/hassio-plejd/issues/120)
- Reverse transition: revisit [\#68](https://github.com/icanos/hassio-plejd/issues/68)

**Merged pull requests:**

- Feature/code style [\#150](https://github.com/icanos/hassio-plejd/pull/150) ([SweVictor](https://github.com/SweVictor))
- Improved logging [\#149](https://github.com/icanos/hassio-plejd/pull/149) ([SweVictor](https://github.com/SweVictor))
- Feature/per device write queue [\#144](https://github.com/icanos/hassio-plejd/pull/144) ([SweVictor](https://github.com/SweVictor))
- Fix wrong initial brightness when transitioning turned-off lights [\#142](https://github.com/icanos/hassio-plejd/pull/142) ([SweVictor](https://github.com/SweVictor))
- Fix includeRoomsAsLights and improve logging [\#141](https://github.com/icanos/hassio-plejd/pull/141) ([SweVictor](https://github.com/SweVictor))
- Update README.md [\#140](https://github.com/icanos/hassio-plejd/pull/140) ([buffedelic](https://github.com/buffedelic))
- multiple fixes for improved lifecycle and errors [\#137](https://github.com/icanos/hassio-plejd/pull/137) ([JohnPhoto](https://github.com/JohnPhoto))
- Bump axios from 0.19.0 to 0.21.1 in /plejd [\#133](https://github.com/icanos/hassio-plejd/pull/133) ([dependabot[bot]](https://github.com/apps/dependabot))
- Improve transitioning of brightness [\#127](https://github.com/icanos/hassio-plejd/pull/127) ([SweVictor](https://github.com/SweVictor))
- Bump ini from 1.3.5 to 1.3.8 in /plejd [\#116](https://github.com/icanos/hassio-plejd/pull/116) ([dependabot[bot]](https://github.com/apps/dependabot))
- Publish availability of devices [\#115](https://github.com/icanos/hassio-plejd/pull/115) ([thomasloven](https://github.com/thomasloven))
- Listen for Home Assistant default birth message [\#114](https://github.com/icanos/hassio-plejd/pull/114) ([thomasloven](https://github.com/thomasloven))
- Remove dead code [\#113](https://github.com/icanos/hassio-plejd/pull/113) ([thomasloven](https://github.com/thomasloven))
- Bump bl from 1.2.2 to 1.2.3 in /plejd [\#112](https://github.com/icanos/hassio-plejd/pull/112) ([dependabot[bot]](https://github.com/apps/dependabot))

## [0.4.8](https://github.com/icanos/hassio-plejd/tree/0.4.8) (2020-11-24)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.4.7...0.4.8)

**Closed issues:**

- Unable to install [\#111](https://github.com/icanos/hassio-plejd/issues/111)
- No state change on scene [\#109](https://github.com/icanos/hassio-plejd/issues/109)
- UnhandledPromiseRejectionWarning: DBusError: Failed to activate service 'org.bluez': timed out [\#108](https://github.com/icanos/hassio-plejd/issues/108)
- UnhandledPromiseRejectionWarning: DBusError: Failed to activate service 'org.bluez': timed out [\#107](https://github.com/icanos/hassio-plejd/issues/107)
- UnhandledPromiseRejectionWarning: DBusError: Operation already in progress [\#106](https://github.com/icanos/hassio-plejd/issues/106)
- failed to start discovery. Make sure no other add-on is currently scanning [\#103](https://github.com/icanos/hassio-plejd/issues/103)
- \(node:294\) UnhandledPromiseRejectionWarning: DBusError: Does Not Exist [\#95](https://github.com/icanos/hassio-plejd/issues/95)
- Error after RPI 3 B+ setup [\#94](https://github.com/icanos/hassio-plejd/issues/94)
- Installation instruction needs to be changed [\#90](https://github.com/icanos/hassio-plejd/issues/90)
- Losing connection [\#80](https://github.com/icanos/hassio-plejd/issues/80)
- Looks like it detects my divices but i still get some errors [\#75](https://github.com/icanos/hassio-plejd/issues/75)
- Support for Accesories [\#71](https://github.com/icanos/hassio-plejd/issues/71)

**Merged pull requests:**

- Bump lodash from 4.17.15 to 4.17.19 in /plejd [\#93](https://github.com/icanos/hassio-plejd/pull/93) ([dependabot[bot]](https://github.com/apps/dependabot))

## [0.4.7](https://github.com/icanos/hassio-plejd/tree/0.4.7) (2020-06-12)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.4.6...0.4.7)

**Closed issues:**

- Plejd app cant find devices after hassio.plejd connected [\#87](https://github.com/icanos/hassio-plejd/issues/87)
- plejd-ble: disconnecting / what do i do wrong:\( [\#82](https://github.com/icanos/hassio-plejd/issues/82)
- Reverse transition: revisit [\#68](https://github.com/icanos/hassio-plejd/issues/68)

**Merged pull requests:**

- transitions work [\#89](https://github.com/icanos/hassio-plejd/pull/89) ([icanos](https://github.com/icanos))

## [0.4.6](https://github.com/icanos/hassio-plejd/tree/0.4.6) (2020-05-06)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.4.5...0.4.6)

**Closed issues:**

- Installation issue [\#83](https://github.com/icanos/hassio-plejd/issues/83)
- Addon needs to manually be restarted [\#79](https://github.com/icanos/hassio-plejd/issues/79)
- Cant install v 0.4.4 [\#77](https://github.com/icanos/hassio-plejd/issues/77)

**Merged pull requests:**

- fixed build error [\#84](https://github.com/icanos/hassio-plejd/pull/84) ([icanos](https://github.com/icanos))

## [0.4.5](https://github.com/icanos/hassio-plejd/tree/0.4.5) (2020-03-26)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.4.4...0.4.5)

**Merged pull requests:**

- fixed build error and upped version [\#81](https://github.com/icanos/hassio-plejd/pull/81) ([icanos](https://github.com/icanos))

## [0.4.4](https://github.com/icanos/hassio-plejd/tree/0.4.4) (2020-03-19)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.4.3...0.4.4)

**Implemented enhancements:**

- Disabled AppArmor Policy since there's been a lot of issues with that.

**Closed issues:**

- Apparmor in latest version [\#74](https://github.com/icanos/hassio-plejd/issues/74)
- No devices added [\#70](https://github.com/icanos/hassio-plejd/issues/70)

**Merged pull requests:**

- disabled apparmor since lots of issues with that [\#76](https://github.com/icanos/hassio-plejd/pull/76) ([icanos](https://github.com/icanos))

## [0.4.3](https://github.com/icanos/hassio-plejd/tree/0.4.3) (2020-03-13)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.4.2...0.4.3)

**Fixed bugs:**

- Updated add-on to work with the API changes made by Plejd.

**Closed issues:**

- Error: unable to retrieve the crypto key. error: Error: Request failed with status code 400 [\#72](https://github.com/icanos/hassio-plejd/issues/72)
- plejd-ble: warning: wasn't able to connect to Plejd, will retry. [\#69](https://github.com/icanos/hassio-plejd/issues/69)

**Merged pull requests:**

- updated to comply with new api version [\#73](https://github.com/icanos/hassio-plejd/pull/73) ([icanos](https://github.com/icanos))

## [0.4.2](https://github.com/icanos/hassio-plejd/tree/0.4.2) (2020-03-03)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.4.1...0.4.2)

**Closed issues:**

- Error: Cannot find module './scene.manager' in 0.4.0 [\#65](https://github.com/icanos/hassio-plejd/issues/65)

**Merged pull requests:**

- reworked write queue and added configurable wait time [\#67](https://github.com/icanos/hassio-plejd/pull/67) ([icanos](https://github.com/icanos))

## [0.4.1](https://github.com/icanos/hassio-plejd/tree/0.4.1) (2020-02-29)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.4.0...0.4.1)

**Merged pull requests:**

- added missing file to dockerfile [\#66](https://github.com/icanos/hassio-plejd/pull/66) ([icanos](https://github.com/icanos))

## [0.4.0](https://github.com/icanos/hassio-plejd/tree/0.4.0) (2020-02-29)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.3.4...0.4.0)

**New features:**

- Implemented support for Plejd scenes, each scene appears as a switch in Home Assistant.
- _WPH-01_ is supported and generates two switches (left and right button).
- Write queues, finally able to incorporate Plejd devices in HA automations/scenes etc.

**Closed issues:**

- voluptuous.error.MultipleInvalid: extra keys not allowed @ data\['schema'\] [\#61](https://github.com/icanos/hassio-plejd/issues/61)
- Can't install R pi3+ [\#62](https://github.com/icanos/hassio-plejd/issues/62)
- Plejd plugin installation fail [\#60](https://github.com/icanos/hassio-plejd/issues/60)
- dBus Error? [\#59](https://github.com/icanos/hassio-plejd/issues/59)
- Connection problem with 3.4 [\#56](https://github.com/icanos/hassio-plejd/issues/56)
- Scene triggering via MQTT [\#43](https://github.com/icanos/hassio-plejd/issues/43)
- Reverse transition: [\#26](https://github.com/icanos/hassio-plejd/issues/26)
- light transition: not supported? [\#15](https://github.com/icanos/hassio-plejd/issues/15)

**Merged pull requests:**

- scene support, wph-01 and write queues [\#64](https://github.com/icanos/hassio-plejd/pull/64) ([icanos](https://github.com/icanos))

## [0.3.4](https://github.com/icanos/hassio-plejd/tree/0.3.4) (2020-01-27)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.3.3...0.3.4)

**New features:**

- `connectionTimeout` configuration parameter to enable tweaking of wait time on connection, usable for RPi 3B+.

**Implemented enhancements:**

- Reworked some logging to get better understanding of what happens.

**Merged pull requests:**

- new config parameter [\#55](https://github.com/icanos/hassio-plejd/pull/55) ([icanos](https://github.com/icanos))

## [0.3.3](https://github.com/icanos/hassio-plejd/tree/0.3.3) (2020-01-24)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.3.2...0.3.3)

**Merged pull requests:**

- resolved missing device bug and new version [\#52](https://github.com/icanos/hassio-plejd/pull/52) ([icanos](https://github.com/icanos))

**Closed issues:**

- v0.3.1, DBusError: Software caused connection abort [\#50](https://github.com/icanos/hassio-plejd/issues/50)

## [0.3.2](https://github.com/icanos/hassio-plejd/tree/0.3.2) (2020-01-24)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.3.1...0.3.2)

**Merged pull requests:**

- potential bug fixed and new version [\#51](https://github.com/icanos/hassio-plejd/pull/51) ([icanos](https://github.com/icanos))

## [0.3.1](https://github.com/icanos/hassio-plejd/tree/0.3.1) (2020-01-24)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.3.0...0.3.1)

**Merged pull requests:**

- added missing dbus access [\#49](https://github.com/icanos/hassio-plejd/pull/49) ([icanos](https://github.com/icanos))

## [0.3.0](https://github.com/icanos/hassio-plejd/tree/0.3.0) (2020-01-24)

**New features:**

- New BLE manager, DBus instead of noble

**Closed issues:**

- Entities without devices [\#28](https://github.com/icanos/hassio-plejd/issues/28)
- noble warning: unknown peripheral in ver 0.2.0 [\#24](https://github.com/icanos/hassio-plejd/issues/24)
- \(node:291\) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. [\#19](https://github.com/icanos/hassio-plejd/issues/19)

**Merged pull requests:**

- new ble manager [\#48](https://github.com/icanos/hassio-plejd/pull/48) ([icanos](https://github.com/icanos))

## 0.2.10 (2020-01-18)

**Merged pull requests:**

- upped version to fix issue [\#47](https://github.com/icanos/hassio-plejd/pull/47) ([icanos](https://github.com/icanos))
- fix [\#46](https://github.com/icanos/hassio-plejd/pull/46) ([icanos](https://github.com/icanos))
- bug fix [\#45](https://github.com/icanos/hassio-plejd/pull/45) ([icanos](https://github.com/icanos))

## 0.2.9 (2020-01-18)

**Merged pull requests:**

- added sorted list of devices discovered [\#44](https://github.com/icanos/hassio-plejd/pull/44) ([icanos](https://github.com/icanos))

## 0.2.8 (2020-01-16)

**Fixed bugs:**

- FIX: Reset characteristic state on disconnect

**Merged pull requests:**

- Update README.md [\#42](https://github.com/icanos/hassio-plejd/pull/42) ([icanos](https://github.com/icanos))
- reset characteristic state and new version [\#41](https://github.com/icanos/hassio-plejd/pull/41) ([icanos](https://github.com/icanos))

## 0.2.7 (2020-01-16)

**Fixed bugs:**

- Added exception handling to unsubscribing lastData characteristic if already disconnected

**Merged pull requests:**

- more error handling and version upgrade [\#39](https://github.com/icanos/hassio-plejd/pull/39) ([icanos](https://github.com/icanos))
- Update README.md [\#40](https://github.com/icanos/hassio-plejd/pull/40) ([icanos](https://github.com/icanos))

## 0.2.6 (2020-01-15)

**Merged pull requests:**

- resolved null usage exception [\#38](https://github.com/icanos/hassio-plejd/pull/38) ([icanos](https://github.com/icanos))

## 0.2.5 (2020-01-14)

**Closed issues:**

- Scene ID always 0 [\#35](https://github.com/icanos/hassio-plejd/issues/35)

**Merged pull requests:**

- Update README.md [\#37](https://github.com/icanos/hassio-plejd/pull/37) ([icanos](https://github.com/icanos))
- resolved bug with scenes [\#36](https://github.com/icanos/hassio-plejd/pull/36) ([icanos](https://github.com/icanos))

## 0.2.4 (2020-01-14)

**Merged pull requests:**

- added error handling for writing to Plejd [\#34](https://github.com/icanos/hassio-plejd/pull/34) ([icanos](https://github.com/icanos))

## 0.2.3 (2020-01-14)

**Closed issues:**

- parse error: Expected string key before ':' at line 1, column 4 [\#17](https://github.com/icanos/hassio-plejd/issues/17)
- Raspberry Pi4 Hassos - Installation exited [\#32](https://github.com/icanos/hassio-plejd/issues/32)

**Merged pull requests:**

- resolved container build error [\#33](https://github.com/icanos/hassio-plejd/pull/33) ([icanos](https://github.com/icanos))

## 0.2.2

**Implemented enhancements:**

- Stability improvements

## [0.2.1](https://github.com/icanos/hassio-plejd/tree/0.2.1) (2020-01-08)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/0.2.0...0.2.1)

**Implemented enhancements:**

- stability improvements

**Merged pull requests:**

- 0.2.1 extended logging [\#25](https://github.com/icanos/hassio-plejd/pull/25) ([icanos](https://github.com/icanos))

## [0.2.0](https://github.com/icanos/hassio-plejd/tree/0.2.0) (2019-12-31)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/v0.1.4...0.2.0)

**New features**

- Include rooms as lights

**Implemented enhancements:**

- stability improvements

**Fixed bugs:**

- noble warning: unknown peripheral [\#1](https://github.com/icanos/hassio-plejd/issues/1)

**Closed issues:**

- parse error: Expected string key before ':' at line 1, column 4/code 404 [\#18](https://github.com/icanos/hassio-plejd/issues/18)
- Cannot find module './plejd' [\#13](https://github.com/icanos/hassio-plejd/issues/13)
- Cannot add repo [\#11](https://github.com/icanos/hassio-plejd/issues/11)
- REL-02 [\#8](https://github.com/icanos/hassio-plejd/issues/8)
- Http error on line 1 [\#7](https://github.com/icanos/hassio-plejd/issues/7)
- DIM-2 and MQTT auto discover issue? [\#6](https://github.com/icanos/hassio-plejd/issues/6)
- Switch / Light [\#5](https://github.com/icanos/hassio-plejd/issues/5)
- Devices not loading after restart of HA [\#4](https://github.com/icanos/hassio-plejd/issues/4)
- Error building [\#3](https://github.com/icanos/hassio-plejd/issues/3)

**Merged pull requests:**

- merge to 0.2.0 [\#23](https://github.com/icanos/hassio-plejd/pull/23) ([icanos](https://github.com/icanos))
- Remove old reference to plejd.js [\#14](https://github.com/icanos/hassio-plejd/pull/14) ([treet](https://github.com/treet))
- rewritten the ble communication layer [\#12](https://github.com/icanos/hassio-plejd/pull/12) ([icanos](https://github.com/icanos))
- more stability improvements [\#9](https://github.com/icanos/hassio-plejd/pull/9) ([icanos](https://github.com/icanos))

## [0.1.4](https://github.com/icanos/hassio-plejd/tree/v0.1.4) (2019-12-11)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/v0.1.3...v0.1.4)

## [0.1.3](https://github.com/icanos/hassio-plejd/tree/v0.1.3) (2019-12-11)

[Full Changelog](https://github.com/icanos/hassio-plejd/compare/942be4c54317abd768fb7470f0b2d49fd58f06db...v0.1.3)

**Closed issues:**

- DIM-02 only one entity per device detected [\#2](https://github.com/icanos/hassio-plejd/issues/2)

## 0.1.1

**Fixed bugs:**

- Fixed missing reference on startup, preventing add-on from starting

## 0.1.0

**New features:**

- Rewrote the BLE integration for more stability

**Fixed bugs:**

- discovery wasn't always sent

## 0.0.9:

**New features:**

- Added support for Plejd devices with multiple outputs (such as DIM-02)

**Fixed bugs:**

- bug preventing add-on from building

## Initial (2019-12-04)

**New features:**

- Initial version of the addon created!

\* _This Changelog was partially generated by [github_changelog_generator](https://github.com/github-changelog-generator/github-changelog-generator)_

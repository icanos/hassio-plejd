# Hass.io Plejd add-on
Hass.io add-on for Plejd home automation devices. Gives you the ability to control the Plejd home automation devices through Home Assistant.
It uses MQTT to communicate with Home Assistant and supports auto discovery of the devices in range.

It also supports notifications so that changed made in the Plejd app are propagated to Home Assistant.

Thanks to [ha-plejd](https://github.com/klali/ha-plejd) for inspiration.

Disclaimer:
I am in no way affiliated with Plejd and am solely doing this as a hobby project.

**Did you like this? Consider helping me continue the development:**  
[Buy me a coffee](https://www.buymeacoffee.com/w1ANTUb)

[![Gitter](https://badges.gitter.im/hassio-plejd/community.svg)](https://gitter.im/hassio-plejd/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

## Getting started
To get started, make sure that the following requirements are met:

### Requirements
* A Bluetooth device (BLE), for eg. the built-in device in Raspberry Pi 4.
* An MQTT broker (the Mosquitto Hass.io add-on works perfectly well).

### Tested on
The add-on has been tested on the following platforms:
* Mac OS Catalina 10.15.1 with Node v. 13.2.0
* Raspberry Pi 4 with Hass.io
* Raspberry Pi 4 with Hass.io/aarch64

#### Tested Plejd devices
* DIM-01
* DIM-02
* LED-10
* CTR-01
* REL-01
* REL-02
* WPH-01

### Easy Installation
Browse to your Home Assistant installation in a web browser and click on `Hass.io` in the navigation bar to the left.
* Open the Home Assistant web console and click `Hass.io` in the menu on the left side.
* Click on `Add-on Store` in the top navigation bar of that page.
* Paste the URL to this repo https://github.com/icanos/hassio-plejd.git in the `Add new repository by URL` field and hit `Add`.
* Scroll down and you should find a Plejd add-on that can be installed. Open that and install.
* Enjoy!

### Manual Installation
Browse your Hass.io installation using a tool that allows you to manage files, for eg. SMB or an SFTP client etc.
* Open the `/addon` directory
* Create a new folder named `hassio-plejd`
* Copy all files from this repository into that newly created one.
* Open the Home Assistant web console and click `Hass.io` in the menu on the left side.
* Click on `Add-on Store` in the top navigation bar of that page.
* Click on the refresh button in the upper right corner.
* A new Local Add-on should appear named Plejd. Open that and install.
* Enjoy!

### IMPORTANT INFORMATION
#### Startup error message
When starting the add-on, the log displays this message:
```
parse error: Expected string key before ':' at line 1, column 4
[08:56:24] ERROR: Unknown HTTP error occured
```
However, the add-on still works as expected and this is something I'm looking into, but not with that much effort yet though.

#### Running the Plejd add-on outside of HassOS
If you're planning on running this add-on outside of HassOS, you might need to turn off AppArmor in the `config.json` file. This is due to missing AppArmor configuration that is performed in HassOS (if you've manually done it, ignore this).

Open the `config.json` file and locate `host_dbus`, after that line, insert: `"apparmor": "no",` and then restart the add-on.

More information about available parameters can be found here:
https://developers.home-assistant.io/docs/en/hassio_addon_config.html

#### Migration from 32bit to 64 bit
If you restorre a backup from a 32bit system to a new 64bit system, use the Rebuid option in the Add-on 

### Configuration
You need to add the following to your `configuration.yaml` file:
```
mqtt:
  broker: [point to your broker IP eg. 'mqtt://localhost']
  username: [username of mqtt broker]
  password: !secret mqtt_password
  discovery: true
  discovery_prefix: homeassistant
  birth_message: 
    topic: 'hass/status'
    payload: 'online'
  will_message: 
    topic: 'hass/status'
    payload: 'offline'
```
The above is used to notify the add-on when Home Assistant has started successfully and let the add-on send the discovery response (containing all devices).

The plugin needs you to configure some settings before working. You find these on the Add-on page after you've installed it.

Parameter | Value
--- | ---
site | Name of your Plejd site, the name is displayed in the Plejd app (top bar).
username | Username of your Plejd account, this is used to fetch the crypto key and devices from the Plejd API.
password | Password of your Plejd account, this is used to fetch the crypto key and devices from the Plejd API.
mqttBroker | URL of the MQTT Broker, eg. mqtt://localhost
mqttUsername | Username of the MQTT broker
mqttPassword | Password of the MQTT broker
includeRoomsAsLights | Adds all rooms as lights, making it possible to turn on/off lights by room instead. Setting this to false will ignore all rooms. *Added in v. 5*.
connectionTimeout | Number of seconds to wait when scanning and connecting. Might need to be tweaked on platforms other than RPi 4. Defaults to: 2 seconds.
writeQueueWaitTime | Wait time between message sent to Plejd over BLE, defaults to 400. If that doesn't work, try changing the value higher in steps of 50.

## Transitions
Transitions from Home Assistant are supported (for dimmable devices) when transition is longer than 1 second. Plejd will do a bit of internal transitioning (default soft start is 0.1 seconds). 

This implementation will transition each device independently, meaning that brightness change might be choppy if transitioning many devices at once or a changing brightness a lot in a limited time. Hassio-plejd's communication channel seems to handle a few updates per second, this is the combined value for all devices.

Transition points will be skipped if the queue of messages to be sent is over a certain threshold, by default equal to the number of devices in the system. Total transition time is prioritized rather than smoothness.

Recommendations
* Only transition a few devices at a time when possible
* Expect 5-10 brightness changes per second, meaning 5 devices => 1-2 updates per device per second
* ... meaning that SLOW transitions will work well (wake-up light, gradually fade over a minute, ...), but quick ones will only work well for few devices or small relative changes in brightness
* When experiencing choppy quick transitions, turn transitioning off and let the Plejd hardware do the work instead

## I want voice control!
With the Google Home integration in Home Assistant, you can get voice control for your Plejd lights right away, check this out for more information:
https://www.home-assistant.io/integrations/google_assistant/

### I don't want voice, I want HomeKit!
Check this out for more information on how you can get your Plejd lights controlled using HomeKit:
https://www.home-assistant.io/integrations/homekit/

## Changelog
*v 0.4.5*:
* FIX: Resolved a Docker build error

*v 0.4.4*:
* FIX: Disabled AppArmor Policy since there's been a lot of issues with that.

*v 0.4.3*:
* FIX: Updated add-on to work with the API changes made by Plejd.

*v 0.4.0*:
* NEW: Implemented support for Plejd scenes, each scene appears as a switch in Home Assistant.
* NEW: *WPH-01* is supported and generates two switches (left and right button).
* NEW: Write queues, finally able to incorporate Plejd devices in HA automations/scenes etc.

*v 0.3.4*:
* NEW: `connectionTimeout` configuration parameter to enable tweaking of wait time on connection, usable for RPi 3B+.
* FIX: Reworked some logging to get better understanding of what happens.

*v 0.3.0*:
* NEW: New BLE manager, DBus instead of noble
* FIX: Adding entities as devices now as well
* FIX: Bug fixes

*v 0.2.8*:
* FIX: Reset characteristic state on disconnect

*v 0.2.7*:
* FIX: Added exception handling to unsubscribing lastData characteristic if already disconnected

*v 0.2.6*:
* FIX: Added null check to remove listeners for characteristics

*v 0.2.5*:
* FIX: Invalid scene id in events/scene message

*v 0.2.4*:
* Stability improvements

*v 0.2.3*:
* FIX: Container build error fix

*v 0.2.2*:
* Stability improvements

*v 0.2.1*:
* Stability improvements

*v 0.2.0*:
* Stability improvements
* Bugfixes

*v 0.1.1*:
* FIX: Fixed missing reference on startup, preventing add-on from starting

*v 0.1.0*:
* NEW: Rewrote the BLE integration for more stability
* FIX: discovery wasn't always sent

*previous*:
* FIX: bug preventing add-on from building
* NEW: Added support for Plejd devices with multiple outputs (such as DIM-02)

## License

```
Copyright 2019 Marcus Westin <marcus@sekurbit.se>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

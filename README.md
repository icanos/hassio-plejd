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

- A Bluetooth device (BLE), for eg. the built-in device in Raspberry Pi 4.
- An MQTT broker (the Mosquitto Hass.io add-on works perfectly well).

### Tested on

The add-on has been tested on the following platforms:

- Mac OS Catalina 10.15.1 with Node v. 13.2.0
- Raspberry Pi 4 with Hass.io
- Raspberry Pi 4 with Hass.io/aarch64

#### Tested Plejd devices

- DIM-01
- DIM-02
- LED-10
- CTR-01
- REL-01
- REL-02
- WPH-01

### Easy Installation

Browse to your Home Assistant installation in a web browser and click on `Hass.io` in the navigation bar to the left.

- Open the Home Assistant web console and click `Hass.io` in the menu on the left side.
- Click on `Add-on Store` in the top navigation bar of that page.
- Paste the URL to this repo https://github.com/icanos/hassio-plejd.git in the `Add new repository by URL` field and hit `Add`.
- Scroll down and you should find a Plejd add-on that can be installed. Open that and install.
- Enjoy!

### Manual Installation

Browse your Hass.io installation using a tool that allows you to manage files, for eg. SMB or an SFTP client etc.

- Open the `/addon` directory
- Create a new folder named `hassio-plejd`
- Copy all files from this repository into that newly created one.
- Open the Home Assistant web console and click `Hass.io` in the menu on the left side.
- Click on `Add-on Store` in the top navigation bar of that page.
- Click on the refresh button in the upper right corner.
- A new Local Add-on should appear named Plejd. Open that and install.
- Enjoy!

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

If you restore a backup from a 32bit system to a new 64bit system, use the Rebuild option in the Add-on

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

| Parameter            | Value                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| site                 | Name of your Plejd site, the name is displayed in the Plejd app (top bar).                                                                                                           |
| username             | Username of your Plejd account, this is used to fetch the crypto key and devices from the Plejd API.                                                                                 |
| password             | Password of your Plejd account, this is used to fetch the crypto key and devices from the Plejd API.                                                                                 |
| mqttBroker           | URL of the MQTT Broker, eg. mqtt://localhost                                                                                                                                         |
| mqttUsername         | Username of the MQTT broker                                                                                                                                                          |
| mqttPassword         | Password of the MQTT broker                                                                                                                                                          |
| includeRoomsAsLights | Adds all rooms as lights, making it possible to turn on/off lights by room instead. Setting this to false will ignore all rooms. _Added in v. 5_.                                    |
| logLevel             | Minimim log level. Supported values are `error`, `warn`, `info`, `debug`, `verbose`, `silly` with increasing amount of logging. Do not log more than `info` for production purposes. |
| connectionTimeout    | Number of seconds to wait when scanning and connecting. Might need to be tweaked on platforms other than RPi 4. Defaults to: 2 seconds.                                              |
| writeQueueWaitTime   | Wait time between message sent to Plejd over BLE, defaults to 400. If that doesn't work, try changing the value higher in steps of 50.                                               |

## Transitions

Transitions from Home Assistant are supported (for dimmable devices) when transition is longer than 1 second. Plejd will do a bit of internal transitioning (default soft start is 0.1 seconds).

This implementation will transition each device independently, meaning that brightness change might be choppy if transitioning many devices at once or a changing brightness a lot in a limited time. Hassio-plejd's communication channel seems to handle a few updates per second, this is the combined value for all devices.

Transition points will be skipped if the queue of messages to be sent is over a certain threshold, by default equal to the number of devices in the system. Total transition time is prioritized rather than smoothness.

Recommendations

- Only transition a few devices at a time when possible
- Expect 5-10 brightness changes per second, meaning 5 devices => 1-2 updates per device per second
- ... meaning that SLOW transitions will work well (wake-up light, gradually fade over a minute, ...), but quick ones will only work well for few devices or small relative changes in brightness
- When experiencing choppy quick transitions, turn transitioning off and let the Plejd hardware do the work instead

## I want voice control!

With the Google Home integration in Home Assistant, you can get voice control for your Plejd lights right away, check this out for more information:
https://www.home-assistant.io/integrations/google_assistant/

### I don't want voice, I want HomeKit!

Check this out for more information on how you can get your Plejd lights controlled using HomeKit:
https://www.home-assistant.io/integrations/homekit/

## Developing

The code in this project follows the [Airbnb JavaScript guide](https://github.com/airbnb/javascript) with a few exceptions. Do run the `npm run lint:fix` command in the `plejd` folder (after running `npm install`) and fix any remaining issues before committing. If copying the plugin locally to your Home Assistant instance _do not include the node_modules directory_, strange errors will happen during build!

For a nice developer experience it is very convenient to have `eslint` and `prettier` installed in your favorite editor (such as VS Code) and use the "format on save" option (or invoke formatting by Alt+Shift+F in VS Code). Any code issues should appear in the problems window inside the editor, as well as when running the command above.

### Logs

Logs are color coded and can be accessed on the Log tab of the addon. If you set log level to debug, verbose or silly you will generate a lot of log output
that will quickly scroll out of view. Logs can be exported through Docker that hosts all Home Assistant addons. To do that:

- SSH or console access the HA installation
- Identify the docker container name using `docker container ls` (NAMES column). Example name used `addon_local_plejd`
- tail logs: `tail -f addon_local_plejd`
- tail logs, strip color coding and save to file `docker logs -f addon_local_plejd | sed 's/\x1b\[[0-9;]*m//g' > /config/plejd.log` (output file might need to be adjusted)

### View logs in VS Code addon

Logs extracted as above can easily be viewed in the VS Code Home Assistant addon, which will default to using the excellent `Log File Highlighter` extension to parse the file.
Out of the box you can for example view elapsed time by selecting multiple lines and keeping an eye in the status bar. If you're feeling fancy you can get back the removed color information by adding something like below to the the `settings.json` configuration of VS Code.

```JSON
{
  ... other settings,
  "logFileHighlighter.customPatterns": [
    {
        "pattern": "ERR",
        "foreground": "#af1f1f",
        "fontStyle": "bold",
    },
    {
        "pattern": "WRN",
        "foreground": "#af6f00",
        "fontStyle": "bold",
    },
    {
      "pattern": "INF",
      "foreground": "#44d",
      "fontStyle": "bold"
    },
    {
      "pattern": "VRB",
      "foreground": "#4a4",
    },
    {
      "pattern": "DBG",
      "foreground": "#4a4",
    },
    {
      "pattern": "SIL",
      "foreground": "#999"
    },
    {
      "pattern": "\\[.*\\]",
      "foreground": "#666"
    }
  ]
}
```

## Changelog

_v 0.4.5_:

- FIX: Resolved a Docker build error

_v 0.4.4_:

- FIX: Disabled AppArmor Policy since there's been a lot of issues with that.

_v 0.4.3_:

- FIX: Updated add-on to work with the API changes made by Plejd.

_v 0.4.0_:

- NEW: Implemented support for Plejd scenes, each scene appears as a switch in Home Assistant.
- NEW: _WPH-01_ is supported and generates two switches (left and right button).
- NEW: Write queues, finally able to incorporate Plejd devices in HA automations/scenes etc.

_v 0.3.4_:

- NEW: `connectionTimeout` configuration parameter to enable tweaking of wait time on connection, usable for RPi 3B+.
- FIX: Reworked some logging to get better understanding of what happens.

_v 0.3.0_:

- NEW: New BLE manager, DBus instead of noble
- FIX: Adding entities as devices now as well
- FIX: Bug fixes

_v 0.2.8_:

- FIX: Reset characteristic state on disconnect

_v 0.2.7_:

- FIX: Added exception handling to unsubscribing lastData characteristic if already disconnected

_v 0.2.6_:

- FIX: Added null check to remove listeners for characteristics

_v 0.2.5_:

- FIX: Invalid scene id in events/scene message

_v 0.2.4_:

- Stability improvements

_v 0.2.3_:

- FIX: Container build error fix

_v 0.2.2_:

- Stability improvements

_v 0.2.1_:

- Stability improvements

_v 0.2.0_:

- Stability improvements
- Bugfixes

_v 0.1.1_:

- FIX: Fixed missing reference on startup, preventing add-on from starting

_v 0.1.0_:

- NEW: Rewrote the BLE integration for more stability
- FIX: discovery wasn't always sent

_previous_:

- FIX: bug preventing add-on from building
- NEW: Added support for Plejd devices with multiple outputs (such as DIM-02)

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

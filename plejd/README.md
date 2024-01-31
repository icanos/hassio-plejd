# Hass.io Plejd add-on

Hass.io add-on for Plejd home automation devices. Gives you the ability to control the Plejd home automation devices through Home Assistant.
It uses MQTT to communicate with Home Assistant and supports auto discovery of the devices in range. Changed made in the Plejd app are propagated to Home Assistant.

Thanks to [ha-plejd](https://github.com/klali/ha-plejd) for inspiration.

Disclaimer:
I am in no way affiliated with Plejd and am solely doing this as a hobby project.

**Did you like this? Consider helping me continue the development:**
[Buy me a coffee](https://www.buymeacoffee.com/w1ANTUb)

## Getting started

To get started, make sure that the following requirements are met:

### Requirements

- A Bluetooth device (BLE), se "Tested on" section below.
- An MQTT broker (the [Mosquitto broker Home Assistant add-on](https://github.com/home-assistant/addons/blob/master/mosquitto/DOCS.md) works perfectly well).

### Tested on

The add-on has been tested on the following platforms:

- Odroid-n2+ / Home Assistant Blue / Home Assistant Operating System ("HassOS") / BT ASUS USB-BT400 - Chipset: Broadcom BCM20702A1-0b05-17cb
- Raspberry Pi 4 with Home Assistant ("Hass.io") / Built-in BT
- Raspberry Pi 4 with Home Assistant ("Hass.io"/aarch64) / Built-in BT
- Raspberry Pi 3+ with Home Assistant ("Hass.io") / Built-in BT
- Intel NUC7i5BNH with Home Assistant Operating System ("HassOS") intel NUC image / Built-in BT
- Windows 10 Pro host / Oracle VirtualBox 6.1 / Home Assistant VBox image / Deltaco BT-118 with Cambridge Silicon Radio chipset / Windows + Zadig to change driver to WinUSB
- Windows 10 host / Oracle Virtualbox 6.1 / Home Assistant VBox image / ASUS BT400
- Mac OS Catalina 10.15.1 with Node v. 13.2.0

Supported Plejd devices are detailed in a specific "Plejd devices" section below.

### Easy Installation

- Browse to your Home Assistant installation in a web browser and click on `Settings` in the navigation bar to the left.
- Click on `Add-ons`
- Click on `Add-on Store` in the bottom right corner of that page.
- Click on the three vertical dots to the far right and chose `Repositories`
- Paste the URL to this repo https://github.com/icanos/hassio-plejd.git in the `Add` field and hit `Add`.
- Scroll down and you should find a Plejd add-on that can be installed. Open that and install.
- Configure hassio-plejd (see below).
- Enjoy!

### Manual Installation

Browse your Home Assistant installation using a tool that allows you to manage files, for eg. SCP, SMB, SFTP client, etc.

- Open the `/addons` directory
- Create a new folder named `hassio-plejd`
- Copy all files from the `plejd` subdirectory of the add-on repository (not the top-level which contains `repository.json`) into that newly created one.
- Browse to your Home Assistant installation in a web browser and click on `Settings` in the navigation bar to the left.
- Click on `Add-ons`
- Click on `Add-on Store` in the bottom right corner of that page.
- Click on the three vertical dots to the far right and chose `Check for updates`
- A new Local Add-on should appear named Plejd. Open that and install.
- Enjoy!

### Install older versions or development version

To install older versions, follow the "Manual Installation" instructions above, but copy the code from [one of the releases](https://github.com/icanos/hassio-plejd/releases). To test new functionality you can download the development version, available in the [develop branch](https://github.com/icanos/hassio-plejd/tree/develop).

### More details regarding installation

Please see the separate document [Details](./Details.md) for more detailed instructions regarding Home Asssistant, Mosquitto, etc.

### Startup error message

When starting the add-on, the log displays this message:

```
parse error: Expected string key before ':' at line 1, column 4
[08:56:24] ERROR: Unknown HTTP error occured
```

However, the add-on still works as expected and this is something I'm looking into, but not with that much effort yet though.

## Configuration

### Simple MQTT Configurations

When you are using the official Mosquitto Broker from Home Assistant Add-on store, minimal configuration is required.
Create a user in [Configuration -&gt; Users](https://my.home-assistant.io/redirect/users/) named e.g. mqtt-api-user

| Parameter    | Value                                            |
| ------------ | ------------------------------------------------ |
| mqttBroker   | mqtt://                                          |
| mqttUsername | Arbitrary Home Assistant User e.g. mqtt-api-user |
| mqttPassword | Users password                                   |

### Advanced MQTT Configurations

For more advanced instllations, you need to add the MQTT integration to Home Assistant either by going to Configuration -> Integrations and clicking the Add Integration button, or by adding the following to your `configuration.yaml` file:

```
mqtt:
  broker: [point to your broker IP eg. 'mqtt://localhost']
  username: [username of mqtt broker]
  password: !secret mqtt_password
  discovery: true
  discovery_prefix: homeassistant
```

The above is used to notify the add-on when Home Assistant has started successfully and let the add-on send the discovery response (containing information about all Plejd devices found).

### Configuration Parameters

The plugin needs you to configure some settings before working. You find these on the Add-on page after you've installed it.

| Parameter            | Value                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| site                 | Name of your Plejd site, the name is displayed in the Plejd app (top bar).                                                                                                               |
| username             | Email/username of your Plejd account, this is used to fetch the crypto key and devices from the Plejd API.                                                                               |
| password             | Password of your Plejd account, this is used to fetch the crypto key and devices from the Plejd API.                                                                                     |
| mqttBroker           | URL of the MQTT Broker, eg. mqtt://                                                                                                                                                      |
| mqttUsername         | Username of the MQTT broker                                                                                                                                                              |
| mqttPassword         | Password of the MQTT broker                                                                                                                                                              |
| includeRoomsAsLights | Adds all rooms as lights, making it possible to turn on/off lights by room instead. Setting this to false will ignore all rooms.                                                         |
| updatePlejdClock     | Hourly update Plejd devices' clock if out of sync. Clock is used for time-based scenes. Not recommended if you have a Plejd gateway. Clock updates may flicker scene-controlled devices. |
| logLevel             | Minimim log level. Supported values are `error`, `warn`, `info`, `debug`, `verbose`, `silly` with increasing amount of logging. Do not log more than `info` for production purposes.     |
| connectionTimeout    | Number of seconds to wait when scanning and connecting. Might need to be tweaked on platforms other than RPi 4. Defaults to: 2 seconds.                                                  |
| writeQueueWaitTime   | Wait time between message sent to Plejd over BLE, defaults to 400. If that doesn't work, try changing the value higher in steps of 50.                                                   |

## Plejd devices and corresponding Home Assistant devices

Plejd output devices typically appears as either lights or switches in Home Assistant depending on how they are configured.

| Device    | Plejd Configuration | Home Assistant Role | Comment                                                               |
| --------- | ------------------- | ------------------- | --------------------------------------------------------------------- |
| CTR-01    | Relay, Light        | Light               |                                                                       |
| CTR-01    | Relay, Other        | Switch              |                                                                       |
| REL-01    | Relay, Light        | Light               |                                                                       |
| REL-01    | Relay, Other        | Switch              |                                                                       |
| REL-02    | Relay, Light        | Light               |                                                                       |
| REL-02    | Relay, Other        | Switch              |                                                                       |
| SPR-01    | Relay, Light        | Light               |                                                                       |
| SPR-01    | Relay, Other        | Switch              |                                                                       |
| DIM-01    | -                   | Light               |                                                                       |
| DIM-01-2P | -                   | Light               |                                                                       |
| DIM-02    | -                   | Light               |                                                                       |
| LED-10    | -                   | Light               |                                                                       |
| LED-75    | -                   | Light               |                                                                       |
| DAL-01    | -                   | Light               |                                                                       |
| DWN-01    | -                   | Light               |                                                                       |
| WPH-01    | -                   | Device Automation   | type:button_short_press, subtype:button_1, button_2,button_3,button_4 |
| WRT-01    | -                   | Device Automation   | type:button_short_press, subtype:button_1                             |
| GWY-01    | -                   | -                   |                                                                       |
| RTR-01    | -                   | -                   |                                                                       |
| Scene     | -                   | Scene               |                                                                       |
| Scene     | -                   | Device Automation   | type:scene, subtype:trigger                                           |
| Room      | -                   | Area                | Can be changed by Home Assistant                                      |
| Room      | -                   | Light               | If includeRoomsAsLights is set to true                                |

## Transitions

Transitions from Home Assistant are supported (for dimmable devices) when transition is longer than 1 second. Plejd will do a bit of internal transitioning (default soft start is 0.1 seconds).

This implementation will transition each device independently, meaning that brightness change might be choppy if transitioning many devices at once or a changing brightness a lot in a limited time. Hassio-plejd's communication channel seems to handle a few updates per second, this is the combined value for all devices.

Transition points will be skipped if the queue of messages to be sent is over a certain threshold, by default equal to the number of devices in the system. Total transition time is prioritized rather than smoothness.

Recommendations

- Only transition a few devices at a time when possible
- Entire rooms can be transitioned efficiently after settin gincludeRoomsAsLights to true
- Expect 5-10 brightness changes per second, meaning 5 devices => 1-2 updates per device per second
- ... meaning that SLOW transitions will work well (wake-up light, gradually fade over a minute, ...), but quick ones will only work well for few devices or small relative changes in brightness
- When experiencing choppy quick transitions, turn transitioning off and let the Plejd hardware do the work instead

## Troubleshooting

If you're having issues to get the addon working, there are a few things you can look into:

- Increase log level of plugin to debug, verbose or silly in configuration and restart addon. Refer to the "Logs" section below for information on how to get the full logs.
- Make sure MQTT is correctly configured. If using the HomeAssistant Supervisor (HassIO) Addon mosquitto, changing from `broker: "mqtt://localhost"` to `broker: "core-mosquitto"` can sometimes help (username and password as before)
- Make sure that the MQTT integration works! Config => Integrations => MQTT => Configure => Listen to "#" (everything), then publish to topic `home-assistant/switch/1/power` and make sure you see the message below when listening
- Make sure BT is working
  - Go to HA console (login as "root", write `login` to access normal terminal (or SSH or similar)
  - Start `bluetoothctl` interactive command
  - Write `list` and make sure it finds the Bluetooth device. If no device is found you need to fix this first!
  - Look in Plejd addon log and make sure there is no `unable to find a bluetooth adapter` line
- Make sure signal strength is "good enough". The BLE adapter needs to be reasonably close to a Plejd device. Look at the RSSI reading in the debug logs. In some cases an RSSI of -80 dBm works well, in other cases a higher value such as -40 dBm is required to work.
- You should get verbose/debug logs similar to: `Found Plejd service on ...` => `Discovered ... with RSSI ...` => `Inspecting ...` => `Connecting ...` => `Connected` => `Connected device is a Plejd device ...` => `BLE Connected to ...` => `Bluetooth connected. Plejd BLE up and running!`. After this sequence (which could fail multiple times before finally succeeding) you should get quite frequent `Raw event received ...` from the Plejd mesh. When updating state you should see in the logs `Sending 8 byte(s) of data to Plejd ...`.
- Listen to `#` in the MQTT integration and watch Plejd mqtt messages come in
  - Initial device discovery messages originate from the Plejd API, so if you set up that correctly you should get new devices in HA
  - Plejd log will show something like `discovered light (DIM-01) named ....`
  - State change messages originate from the Plejd Bluetooth connection, so if you get those you should be able to listen to Plejd state changes as well as being able to set states!
  - Initial sync may take many minutes until all devices have the correct on/off/brightness states in HA
- One Plejd device means max one BLE connection, meaning using the Plejd app over BT will disconnect the addon BLE connection
  - It seems you can kick yourself out (by connecting using the app) even when you have multiple devices if the app happens to connect to the same device as the addon is using

## I want voice control!

With the Google Home integration in Home Assistant, you can get voice control for your Plejd lights right away, check this out for more information:
https://www.home-assistant.io/integrations/google_assistant/

### I don't want voice, I want HomeKit!

Check this out for more information on how you can get your Plejd lights controlled using HomeKit:
https://www.home-assistant.io/integrations/homekit/

## Developing

The code in this project follows the [Airbnb JavaScript guide](https://github.com/airbnb/javascript) with a few exceptions. Do run the `npm run lint:fix` command in the `plejd` folder (after running `npm install`) and fix any remaining issues before committing. If copying the plugin locally to your Home Assistant instance _do not include the node_modules directory_, strange errors will happen during build!

For a nice developer experience it is very convenient to have `eslint` and `prettier` installed in your favorite editor (such as VS Code) and use the "format on save" option (or invoke formatting by Alt+Shift+F in VS Code). Any code issues should appear in the problems window inside the editor, as well as when running the command above.

For partial type hinting you can run

- `npm install --global typings`
- `typings install`

When contributing, please do so by forking the repo and then using pull requests towards the dev branch.

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
  // other settings
  // ...
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

## License

```
Copyright 2023 Marcus Westin <marcus@sekurbit.se>

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

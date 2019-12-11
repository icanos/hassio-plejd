# Hass.io Plejd add-on
Hass.io add-on for Plejd home automation devices. Gives you the ability to control the Swedish Plejd home automation devices through Home Assistant.
It uses MQTT to communicate with Home Assistant and supports auto discovery of the devices in range.

It also supports notifications so that changed made in the Plejd app are propagated to Home Assistant.

Thanks to [ha-plejd](https://github.com/klali/ha-plejd) for inspiration.

## Getting started
To get started, make sure that the following requirements are met:

### Requirements
* A Bluetooth device (BLE), for eg. the built-in device in Raspberry Pi 4.
* An MQTT broker (the Mosquitto Hass.io add-on works perfectly well).

### Tested on
The add-on has been tested on the following platforms:
* Mac OS Catalina 10.15.1 with Node v. 13.2.0
* Raspberry Pi 4 with Hass.io

#### Tested Plejd devices
* DIM-01
* DIM-02
* LED-10
* CTR-01

### Installation
Browse your Hass.io installation using a tool that allows you to manage files, for eg. SMB or an SFTP client etc.
* Open the `/addon` directory
* Create a new folder named `hassio-plejd`
* Copy all files from this repository into that newly created one.
* Open the Home Assistant web console and click `Hass.io` in the menu on the left side.
* Click on `Add-on Store` in the top navigation bar of that page.
* Click on the refresh button in the upper right corner.
* A new Local Add-on should appear named Plejd. Open that and install.

You also need to add the following to your `configuration.yaml` file:
```
mqtt:
  broker: [point to your broker IP]
  username: [username of mqtt broker]
  password: !secret mqtt_password
  client_id: mqtt
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

### Configuration
The plugin needs you to configure some settings before working.

Parameter | Value
--- | ---
site | Name of your Plejd site, the name is displayed in the Plejd app (top bar).
username | Username of your Plejd account, this is used to fetch the crypto key and devices from the Plejd API.
password | Password of your Plejd account, this is used to fetch the crypto key and devices from the Plejd API.
mqttBroker | URL of the MQTT Broker, eg. mqtt://localhost
mqttUsername | Username of the MQTT broker
mqttPassword | Password of the MQTT broker

## Things to do
* I'm currently looking into adding support to import rooms, containing one or multiple devices, from Plejd as well.

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

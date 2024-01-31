# Details regarding installation

## Mosquitto

Head over to [Supervisor -> Add-on Store](https://my.home-assistant.io/redirect/supervisor_store/) and find the `Mosquitto broker`.
Install and start it.

## Add api user for Mosquitto

Add a Home Assistant user for the Plejd addon to be able to connect to Mosquitto [Configuration -> Users](https://my.home-assistant.io/redirect/users/)
Call the user e.g. `mqtt-api-user`, set a password and save

## Plejd

Follow the `Easy Installation` in [README.MD](./README.md)And `Configuration Parameters` on the same page.The only parameters needing a value are

- site
- username (typically email address)
- password
- mqttUsername e.g. `mqtt-api-user`
- mqttPassword

Now you can start the Plejd add-on

## Where are the lights?

Head over to [Configuration -> Integrations](https://my.home-assistant.io/redirect/integrations/) and the [Configure MQTT](https://my.home-assistant.io/redirect/config_mqtt/).
After this step a new Mosquitto broker `core-mosquitto` should appear on the [MQTT Page](https://my.home-assistant.io/redirect/integration/?domain=mqtt). If everything was setup correctly. It will list your lights under devices/entities subheading.

## Running the Plejd add-on in VirtualBox on Windows

If on Windows + VirtualBox or similar setup

- Install VirtualBox extensions to get USB 2/3
- Redirect correct USB device
- Potentially try to replace BT drivers with WinUSB using Zadig
- (Re)start VirtualBox HA machine

## Running the Plejd add-on outside of Home Assistant Operating System ("HassOS")

If you're planning on running this add-on outside of HassOS, you might need to turn off AppArmor in the `config.json` file. This is due to missing AppArmor configuration that is performed in HassOS (if you've manually done it, ignore this).

Open the `config.json` file and locate `host_dbus`, after that line, insert: `"apparmor": "no",` and then restart the add-on.

More information about available parameters can be found here:
https://developers.home-assistant.io/docs/en/hassio_addon_config.html

## Migration from 32bit to 64 bit

If you restore a backup from a 32bit system to a new 64bit system, use the Rebuild option in the Add-on

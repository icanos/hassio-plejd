# Details regarding installation

If you can reach your Home Assistant at [http://homeassistant.local:8123](http://homeassistant.local:8123) the links below should work.

## Mosquitto

Head over to Supervisor -> Add-on Store and search for `mosquitto broker`.  
Install it and then start [mosquito addon link](http://homeassistant.local:8123/hassio/addon/core_mosquitto/info)

## Add api user for Mosquito

Add a Home Assistant user for the Plejd addon to be able to connect to Mosquito [Configuration -> Users](http://homeassistant.local:8123/config/users)  
Call the user e.g. `mqtt-api-user`, set a password and save

## Plejd

Follow the `Easy Installation` in [README.MD](plejd/README.md)  
And `Configuration Parameters` on the same page.  
The only parameters needing a value are

- site
- username
- password
- mqttUsername e.g. `mqtt-api-user`
- mqttPassword

Now you can start the Plejd add-on

## Where are the lights?

Head over to [Configuration -> Integrations](http://homeassistant.local:8123/config/integrations) and click Configure on MQTT  
After this step a new `Mosquito broker` should appear on the same page. If everything was setup correctly. It will list your lights under
`1 entity`/`n entities`

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

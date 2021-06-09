# Details for Home Assistant beginners
If you can reach your Home Assistant at [http://homeassistant.local:8123](http://homeassistant.local:8123) the links below should work.

## Mosquitto  
Head over to Supervisor -> Add-on Store and search for `mosquitto broker`.  
Install it and then start  [mosquito addon link](http://homeassistant.local:8123/hassio/addon/core_mosquitto/info)  


## Add api user for Mosquito
Add a Home Assistant user for the Plejd addon to be able to connect to Mosquito [Configuration -> Users](http://homeassistant.local:8123/config/users)  
Call the user e.g. `mqtt-api-user`, set a password and save

## Plejd
Follow the `Easy Installation` in [README.MD](plejd/README.md)  
And `Configuration Parameters` on the same page.  
The only parameters needing a value are  
  * site
  * username
  * password
  * mqttUsername e.g. `mqtt-api-user`
  * mqttPassword

Now you can start the Plejd add-on

## Where are the lights?
Head over to [Configuration -> Integrations](http://homeassistant.local:8123/config/integrations) and click Configure on MQTT  
After this step a new `Mosquito broker` should appear on the same page. If everything was setup correctly. It will list your lights under
`1 entity`/`n entities`
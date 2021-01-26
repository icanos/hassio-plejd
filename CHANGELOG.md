# Hass.io Plejd add-on

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

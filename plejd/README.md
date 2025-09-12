# Plejd Home Assistant Add-on (TypeScript)

A modern TypeScript implementation of the Plejd Home Assistant add-on for controlling Swedish Plejd home automation devices.

## Features

- **Full TypeScript Implementation** - Type-safe code with modern ES2022 features
- **Bluetooth Low Energy (BLE)** - Direct communication with Plejd devices
- **MQTT Integration** - Seamless Home Assistant integration
- **Auto-Discovery** - Automatic device detection and configuration
- **Scene Support** - Plejd scenes as Home Assistant switches
- **Color Temperature** - Support for tunable white devices
- **Robust Error Handling** - Automatic reconnection and recovery

## Supported Devices

- **Dimmers**: DIM-01, DIM-02 (LED dimmers with various power ratings)
- **Switches**: CTR-01, REL-01, SPR-01 (relays and smart plugs)
- **Controls**: WPH-01 (wireless buttons), WRT-01 (rotary controls)
- **LED Drivers**: LED-10, LED-75 (with color temperature support)
- **Smart Lights**: DWN-01/02 (downlights), OUT-01/02 (outdoor lights)
- **Advanced**: DAL-01 (DALI broadcast), EXT-01 (mesh extender)

## Development

### Prerequisites

- Node.js 18+
- TypeScript 5.2+
- Docker (for building)

### Building

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run locally
npm run dev

# Lint code
npm run lint
npm run lint:fix

# Type check
npm run type-check
```

### Project Structure

```
src/
├── lib/
│   ├── configuration.ts     # Configuration management
│   ├── logger.ts           # Logging service
│   ├── constants.ts        # Application constants
│   ├── device-registry.ts  # Device management
│   ├── plejd-api.ts       # Plejd cloud API client
│   ├── mqtt-client.ts     # MQTT/Home Assistant integration
│   ├── plejd-ble-handler.ts # Bluetooth communication
│   ├── scene-manager.ts   # Scene handling
│   └── plejd-addon.ts     # Main orchestrator
├── types/
│   └── index.ts           # TypeScript type definitions
└── main.ts                # Application entry point
```

## Configuration

The add-on uses the same configuration format as the original JavaScript version:

```json
{
  "site": "Your Site Name",
  "username": "your-plejd-username",
  "password": "your-plejd-password",
  "mqttBroker": "mqtt://core-mosquitto:1883",
  "mqttUsername": "homeassistant",
  "mqttPassword": "your-mqtt-password",
  "includeRoomsAsLights": false,
  "preferCachedApiResponse": false,
  "updatePlejdClock": false,
  "logLevel": "info",
  "connectionTimeout": 2,
  "writeQueueWaitTime": 400
}
```

## Architecture

The refactored codebase follows modern TypeScript best practices:

- **Strict Type Safety** - All code is fully typed with strict TypeScript settings
- **Dependency Injection** - Clean separation of concerns with constructor injection
- **Event-Driven Architecture** - Proper EventEmitter usage with typed events
- **Error Boundaries** - Comprehensive error handling and recovery
- **Async/Await** - Modern promise-based asynchronous code
- **Singleton Services** - Shared services like logging and configuration
- **Immutable Data** - Readonly interfaces and const assertions
- **Clean Code** - ESLint with strict rules and Prettier formatting

## Key Improvements

1. **Type Safety** - Eliminates runtime type errors with comprehensive TypeScript types
2. **Modern Syntax** - Uses ES2022 features like optional chaining and nullish coalescing
3. **Better Error Handling** - Proper error types and async error boundaries
4. **Cleaner Architecture** - Separation of concerns with dependency injection
5. **Maintainability** - Consistent code style with automated linting and formatting
6. **Performance** - Optimized async operations and memory management
7. **Debugging** - Better logging with structured data and proper error traces

## License

Apache License 2.0 - See LICENSE file for details.
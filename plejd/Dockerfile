ARG BUILD_FROM
FROM ${BUILD_FROM}

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    linux-headers \
    eudev-dev

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json tsconfig.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Remove dev dependencies and source files to reduce image size
RUN npm prune --production && \
    rm -rf src/ tsconfig.json node_modules/.cache

# Copy addon configuration
COPY config.json ./

# Copy rootfs
COPY rootfs /

# Set proper permissions
RUN chmod a+x /etc/services.d/plejd/run /etc/services.d/plejd/finish /usr/bin/plejd.sh

# Labels
LABEL \
    io.hass.name="Plejd" \
    io.hass.description="Plejd integration for Home Assistant" \
    io.hass.arch="armhf|aarch64|i386|amd64|armv7" \
    io.hass.type="addon" \
    io.hass.version="0.17.0"
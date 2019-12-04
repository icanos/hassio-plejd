ARG BUILD_FROM=hassioaddons/base:5.0.2
FROM $BUILD_FROM

ENV LANG C.UTF-8

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Copy data for add-on
COPY ./api.js /plejd/
COPY ./config.json /plejd/
COPY ./main.js /plejd/
COPY ./mqtt.js /plejd/
COPY ./package.json /plejd/
COPY ./plejd.js /plejd/

ARG BUILD_ARCH

# Install Node
RUN apk add --no-cache jq
RUN \
  apk add --no-cache --virtual .build-dependencies \
  g++=8.3.0-r0 \
  gcc=8.3.0-r0 \
  libc-dev=0.7.1-r0 \
  linux-headers=4.19.36-r0 \
  make=4.2.1-r2 \
  python=2.7.16-r1 \
  bluez=5.50-r3 \
  eudev-dev=3.2.8-r0 \
  \
  && apk add --no-cache \
  git=2.22.0-r0 \
  nodejs=10.16.3-r0 \
  npm=10.16.3-r0 \
  \
  && npm config set unsafe-perm true

WORKDIR /plejd
RUN npm install \
  --no-audit \
  --no-update-notifier \
  --unsafe-perm

# Copy root filesystem
COPY rootfs /

# Build arguments
ARG BUILD_DATE
ARG BUILD_REF
ARG BUILD_VERSION

# Labels
LABEL \
  io.hass.name="Plejd" \
  io.hass.description="Adds support for the Swedish home automation devices from Plejd." \
  io.hass.arch="${BUILD_ARCH}" \
  io.hass.type="addon" \
  io.hass.version=${BUILD_VERSION} \
  maintainer="Marcus Westin <marcus@sekurbit.se>" \
  org.label-schema.description="Adds support for the Swedish home automation devices from Plejd." \
  org.label-schema.build-date=${BUILD_DATE} \
  org.label-schema.name="Plejd" \
  org.label-schema.schema-version="1.0" \
  org.label-schema.usage="https://github.com/icanos/hassio-plejd/tree/master/README.md" \
  org.label-schema.vcs-ref=${BUILD_REF} \
  org.label-schema.vcs-url="https://github.com/icanos/hassio-plejd"
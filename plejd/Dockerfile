ARG BUILD_FROM=ghcr.io/hassio-addons/base/amd64:18.1.4
FROM $BUILD_FROM

ENV LANG=C.UTF-8

# Instruct npm to run lifecycle scripts (like preinstall, install, postinstall) 
# as the root user, instead of trying to downgrade permissions.
ENV NPM_CONFIG_UNSAFE_PERM=true

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Copy data for add-on
COPY ./*.js /plejd/
COPY ./config.json /plejd/
COPY ./package.json /plejd/

ARG BUILD_ARCH

# Install Node
RUN set -eux; \
  apk add --no-cache --virtual .build-dependencies \
  g++ \
  gcc \
  libc-dev \
  linux-headers \
  make \
  python3 \
  bluez \
  eudev-dev \
  zlib-dev \
  \
  && apk add --no-cache \
  git \
  nodejs \
  npm \
  dbus-dev \
  glib-dev

WORKDIR /plejd
RUN npm install \
  --no-audit \
  --no-update-notifier \
  --unsafe-perm

# Copy root filesystem
COPY rootfs /
# Ensure runtime scripts remain executable even if modes were lost in the source checkout
RUN set -eux; \
  chmod 0755 /etc/services.d/plejd/run /etc/cont-init.d/10-plejd-perms /usr/bin/plejd.sh

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

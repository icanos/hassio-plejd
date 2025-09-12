#!/usr/bin/with-contenv bashio

bashio::log.info 'Starting Plejd TypeScript addon'
cd /app || bashio::exit.nok 'Unable to change to app directory'
exec node dist/main.js
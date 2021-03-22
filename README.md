# bonob

A sonos SMAPI implementation to allow registering sources of music with sonos.  Currently only a single integration allowing Navidrome to be registered with sonos.

In theory as Navidrome implements the subsonic API, it *may* work with other subsonic api clones.

![Build](https://github.com/simojenki/bonob/workflows/Build/badge.svg)

## Features
- Integrates with Navidrome
- Browse by Artist, Albums, Genres, Random
- Artist Art
- Album Art
- View Related Artists via Artist -> '...' -> Menu -> Related Arists
- Track scrobbling

## Running

bonob is ditributed via docker and can be run in a number of ways

### Full sonos device auto-discovery by using docker --network host
```
docker run \
    -p 4534 \
    --network host \
    simojenki/bonob
```

### Full sonos device auto-discovery and auto-registration on custom port by using a sonos seed device, without requiring docker host networking
```
docker run \
    -e BONOB_PORT=3000 \
    -e BONOB_SONOS_AUTO_REGISTER=true \
    -e BONOB_SONOS_SEED_HOST=192.168.1.123 \
    -p 3000 \
    simojenki/bonob
```

## Configuration

item | default value | description
---- | ------------- | -----------
BONOB_PORT | 4534 | Default http port for bonob to listen on
BONOB_WEB_ADDRESS | http://localhost:4534 | URL for bonob so that sonos devices can communicate
BONOB_SECRET | bonob | secret used for encrypting credentials
BONOB_SONOS_AUTO_REGISTER | false | Whether or not to try and auto-register on startup
BONOB_SONOS_DEVICE_DISCOVERY | true | whether or not sonos device discovery should be enabled
BONOB_SONOS_SEED_HOST | undefined | sonos device seed host for discovery, or ommitted for for auto-discovery
BONOB_SONOS_SERVICE_NAME | bonob | service name for sonos
BONOB_SONOS_SERVICE_ID | 246 | service id for sonos
BONOB_NAVIDROME_URL | http://localhost:4533 | URL for navidrome


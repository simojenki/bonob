# bonob

A sonos SMAPI implementation to allow registering sources of music with sonos.  

Currently only a single integration allowing Navidrome to be registered with sonos. In theory as Navidrome implements the subsonic API, it *may* work with other subsonic api clones.

![Build](https://github.com/simojenki/bonob/workflows/Build/badge.svg)

## Features

- Integrates with Navidrome
- Browse by Artist, Albums, Genres, Playlist, Random Albums, Starred Albums, Recently Added Albums, Recently Played Albums, Most Played Albums
- Artist Art
- Album Art
- View Related Artists via Artist -> '...' -> Menu -> Related Arists
- Track scrobbling
- Auto discovery of sonos devices
- Discovery of sonos devices using seed IP address
- Auto register bonob service with sonos system
- Multiple registrations within a single household.
- Transcoding performed by Navidrome with specific player for bonob/sonos, customisable by mimeType
- Ability to search by Album, Artist, Track
- Ability to play a playlist

## Running

bonob is ditributed via docker and can be run in a number of ways

### Full sonos device auto-discovery by using docker --network host

```bash
docker run \
    -p 4534:4534 \
    --network host \
    simojenki/bonob
```

Now open http://localhost:4534 in your browser, you should see sonos devices, and service configuration.  By pressing 'Re-register' bonob will register itself in your sonos system, and should then show up in the "Services" list.

### Full sonos device auto-discovery and auto-registration on custom port by using a sonos seed device, without requiring docker host networking

```bash
docker run \
    -e BONOB_PORT=3000 \
    -e BONOB_SONOS_AUTO_REGISTER=true \
    -e BONOB_SONOS_SEED_HOST=192.168.1.123 \
    -p 3000:3000 \
    simojenki/bonob
```

Bonob will now auto-register itself with sonos on startup, updating the registration if the configuration has changed.  Bonob should show up in the "Services" list on http://localhost:3000

### Running bonob on a different network to your sonos devices

Running bonob outside of your lan will require registering your bonob install with your sonos devices from within your lan.  

If you are running this on the internet, you should put bonob behind a reverse proxy and use certificates/https.

Start bonob outside the lan with sonos discovery & registration disabled as they are meaningless in this case, ie.

```bash
docker run \
    -e BONOB_PORT=4534 \
    -e BONOB_WEB_ADDRESS=https://my-bonob-service.com \
    -e BONOB_SONOS_AUTO_REGISTER=false \
    -e BONOB_SONOS_DEVICE_DISCOVERY=false \
    -e BONOB_NAVIDROME_URL=https://my-navidrome-service.com:4533 \
    -p 4534:4534 \
    simojenki/bonob
```

Now inside the lan that contains the sonos devices run bonob registration, using the same BONOB_WEB_ADDRESS as above, and with discovery enabled.  Make sure to use host networking so that bonob can find the sonos devices (or provide a BONOB_SONOS_SEED_HOST)

```bash
docker run \
    -e BONOB_WEB_ADDRESS=https://my-bonob-service.com \
    -e BONOB_SONOS_DEVICE_DISCOVERY=true \
    --network host \
    simojenki/bonob register
```

## Configuration

item | default value | description
---- | ------------- | -----------
BONOB_PORT | 4534 | Default http port for bonob to listen on
BONOB_WEB_ADDRESS | http://$(hostname):4534 | URL for bonob so that sonos devices can communicate. **This must be either the public IP or DNS entry of the bonob instance so that the sonos devices can communicate with it.**
BONOB_SECRET | bonob | secret used for encrypting credentials
BONOB_SONOS_AUTO_REGISTER | false | Whether or not to try and auto-register on startup
BONOB_SONOS_DEVICE_DISCOVERY | true | whether or not sonos device discovery should be enabled
BONOB_SONOS_SEED_HOST | undefined | sonos device seed host for discovery, or ommitted for for auto-discovery
BONOB_SONOS_SERVICE_NAME | bonob | service name for sonos
BONOB_SONOS_SERVICE_ID | 246 | service id for sonos
BONOB_NAVIDROME_URL | http://$(hostname):4533 | URL for navidrome
BONOB_NAVIDROME_CUSTOM_CLIENTS | undefined | Comma delimeted mime types for custom navidrome clients when streaming. ie. "audio/flac,audio/ogg" would use client = 'bonob+audio/flac' for flacs, and 'bonob+audio/ogg' for oggs.

## Initialising service within sonos app

- Open sonos app on your device
- Settings -> Services & Voice -> + Add a Service
- Select your Music Service, default name is 'bonob', can be override with configuration BONOB_SONOS_SERVICE_NAME
- Press 'Add to Sonos' -> 'Linking sonos with bonob' -> Authorize
- Your device should open and brower and you should now see a login screen, enter your navidrome credentials
- You should get 'Login successful!'
- Go back into the sonos app and complete the process
- You should now be able to play music from navidrome
- Within navidrome a new player will be created, 'bonob (username)', so you can configure transcoding specifically for sonos

## Implementing a different music source other than navidrome
- Implement the MusicService/MusicLibrary interface
- Startup bonob with your new implementation.

## TODO

- Artist Radio
- Add tracks to playlists

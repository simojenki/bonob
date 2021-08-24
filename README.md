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
- Now playing & Track Scrobbling
- Auto discovery of sonos devices
- Discovery of sonos devices using seed IP address
- Auto register bonob service with sonos system
- Multiple registrations within a single household.
- Transcoding performed by Navidrome with specific player for bonob/sonos, customisable by mimeType
- Ability to search by Album, Artist, Track
- Ability to play a playlist
- Ability to add/remove playlists
- Ability to add/remove tracks from a playlist
- Localization (only en-US & nl-NL supported currently, require translations for other languages).  [Sonos localization and supported languages](https://developer.sonos.com/build/content-service-add-features/strings-and-localization/)

## Running

bonob is ditributed via docker and can be run in a number of ways

### Full sonos device auto-discovery and auto-registration using docker --network host

```bash
docker run \
    -e BONOB_SONOS_AUTO_REGISTER=true \
    -e BONOB_SONOS_DEVICE_DISCOVERY=true \
    -p 4534:4534 \
    --network host \
    simojenki/bonob
```

Now open http://localhost:4534 in your browser, you should see sonos devices, and service configuration.  Bonob will auto-register itself with your sonos system on startup.

### Full sonos device auto-discovery and auto-registration on custom port by using a sonos seed device, without requiring docker host networking

```bash
docker run \
    -e BONOB_PORT=3000 \
    -e BONOB_SONOS_SEED_HOST=192.168.1.123 \
    -e BONOB_SONOS_AUTO_REGISTER=true \
    -e BONOB_SONOS_DEVICE_DISCOVERY=true \
    -p 3000:3000 \
    simojenki/bonob
```

Bonob will now auto-register itself with sonos on startup, updating the registration if the configuration has changed.  Bonob should show up in the "Services" list on http://localhost:3000

### Running bonob on a different network to your sonos devices

Running bonob outside of your lan will require registering your bonob install with your sonos devices from within your LAN.  

If you are using bonob over the Internet, you do this at your own risk and should use TLS.

Start bonob outside the LAN with sonos discovery & registration disabled as they are meaningless in this case, ie.

```bash
docker run \
    -e BONOB_PORT=4534 \
    -e BONOB_SONOS_SERVICE_NAME=MyAwesomeMusic \
    -e BONOB_SECRET=changeme \
    -e BONOB_URL=https://my-server.example.com/bonob \
    -e BONOB_SONOS_AUTO_REGISTER=false \
    -e BONOB_SONOS_DEVICE_DISCOVERY=false \
    -e BONOB_NAVIDROME_URL=https://my-navidrome-service.com:4533 \
    -p 4534:4534 \
    simojenki/bonob
```

Now within the LAN that contains the sonos devices run bonob the registration process.

```bash
docker run \
    --rm \
    --network host \
    simojenki/bonob register https://my-server.example.com/bonob
```

### Running bonob and navidrome using docker-compose

```yaml
version: "3"
services:
  navidrome:
    image: deluan/navidrome:latest
    user: 1000:1000 # should be owner of volumes
    ports:
      - "4533:4533"
    restart: unless-stopped
    environment:
      # Optional: put your config options customization here. Examples:
      ND_SCANSCHEDULE: 1h
      ND_LOGLEVEL: info  
      ND_SESSIONTIMEOUT: 24h
      ND_BASEURL: ""
    volumes:
      - "/tmp/navidrome/data:/data"
      - "/tmp/navidrome/music:/music:ro"
  bonob:
    image: simojenki/bonob:latest
    user: 1000:1000 # should be owner of volumes
    ports:
      - "4534:4534"
    restart: unless-stopped
    environment:
      BONOB_PORT: 4534
      # ip address of your machine running bonob
      BONOB_URL: http://192.168.1.111:4534  
      BONOB_SECRET: changeme
      BONOB_SONOS_AUTO_REGISTER: true
      BONOB_SONOS_DEVICE_DISCOVERY: true
      BONOB_SONOS_SERVICE_ID: 246
      # ip address of one of your sonos devices
      BONOB_SONOS_SEED_HOST: 192.168.1.121
      BONOB_NAVIDROME_URL: http://navidrome:4533
```

## Configuration

item | default value | description
---- | ------------- | -----------
BONOB_PORT | 4534 | Default http port for bonob to listen on
BONOB_URL | http://$(hostname):4534 | URL (including path) for bonob so that sonos devices can communicate. **This must be either the public IP or DNS entry of the bonob instance so that the sonos devices can communicate with it.**
BONOB_SECRET | bonob | secret used for encrypting credentials
BONOB_SONOS_AUTO_REGISTER | false | Whether or not to try and auto-register on startup
BONOB_SONOS_DEVICE_DISCOVERY | true | whether or not sonos device discovery should be enabled
BONOB_SONOS_SEED_HOST | undefined | sonos device seed host for discovery, or ommitted for for auto-discovery
BONOB_SONOS_SERVICE_NAME | bonob | service name for sonos
BONOB_SONOS_SERVICE_ID | 246 | service id for sonos
BONOB_NAVIDROME_URL | http://$(hostname):4533 | URL for navidrome
BONOB_NAVIDROME_CUSTOM_CLIENTS | undefined | Comma delimeted mime types for custom navidrome clients when streaming. ie. "audio/flac,audio/ogg" would use client = 'bonob+audio/flac' for flacs, and 'bonob+audio/ogg' for oggs.
BONOB_SCROBBLE_TRACKS | true | Whether to scrobble the playing of a track if it has been played for >30s
BONOB_REPORT_NOW_PLAYING | true | Whether to report a track as now playing

## Initialising service within sonos app

- Open sonos app on your device
- Settings -> Services & Voice -> + Add a Service
- Select your Music Service, default name is 'bonob', can be overriden with configuration BONOB_SONOS_SERVICE_NAME
- Press 'Add to Sonos' -> 'Linking sonos with bonob' -> Authorize
- Your device should open a browser and you should now see a login screen, enter your navidrome credentials
- You should get 'Login successful!'
- Go back into the sonos app and complete the process
- You should now be able to play music from navidrome
- Within navidrome a new player will be created, 'bonob (username)', so you can configure transcoding specifically for sonos

## Implementing a different music source other than navidrome

- Implement the MusicService/MusicLibrary interface
- Startup bonob with your new implementation.

## Credits

- Icons courtesy of: [Navidrome](https://www.navidrome.org/), [Vectornator](https://www.vectornator.io/), and @jicho

## TODO

- Artist Radio

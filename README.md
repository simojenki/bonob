# bonob

A sonos SMAPI implementation to allow registering sources of music with sonos.  

Support for Subsonic API clones (tested against Navidrome and Gonic).

![Build](https://github.com/simojenki/bonob/workflows/Build/badge.svg)

## Features

- Integrates with Subsonic API clones (Navidrome, Gonic)
- Browse by Artist, Albums, Random, Favourites, Top Rated, Playlist, Genres, Recently Added Albums, Recently Played Albums, Most Played Albums
- Artist & Album Art
- View Related Artists via Artist -> '...' -> Menu -> Related Arists
- Now playing & Track Scrobbling
- Search by Album, Artist, Track
- Playlist editing through sonos app.
- Marking of songs as favourites and with ratings through the sonos app.
- Localization (only en-US & nl-NL supported currently, require translations for other languages).  [Sonos localization and supported languages](https://developer.sonos.com/build/content-service-add-features/strings-and-localization/)
- Auto discovery of sonos devices
- Discovery of sonos devices using seed IP address
- Auto registration with sonos on start
- Multiple registrations within a single household.
- Transcoding support for flacs using a specific player for the flac mimeType bonob/sonos

## Running

bonob is distributed via docker and can be run in a number of ways

### Full sonos device auto-discovery and auto-registration using docker --network host

```bash
docker run \
    -e BNB_SONOS_AUTO_REGISTER=true \
    -e BNB_SONOS_DEVICE_DISCOVERY=true \
    -p 4534:4534 \
    --network host \
    simojenki/bonob
```

Now open http://localhost:4534 in your browser, you should see sonos devices, and service configuration.  Bonob will auto-register itself with your sonos system on startup.

### Full sonos device auto-discovery and auto-registration on custom port by using a sonos seed device, without requiring docker host networking

```bash
docker run \
    -e BNB_PORT=3000 \
    -e BNB_SONOS_SEED_HOST=192.168.1.123 \
    -e BNB_SONOS_AUTO_REGISTER=true \
    -e BNB_SONOS_DEVICE_DISCOVERY=true \
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
    -e BNB_PORT=4534 \
    -e BNB_SONOS_SERVICE_NAME=MyAwesomeMusic \
    -e BNB_SECRET=changeme \
    -e BNB_URL=https://my-server.example.com/bonob \
    -e BNB_SONOS_AUTO_REGISTER=false \
    -e BNB_SONOS_DEVICE_DISCOVERY=false \
    -e BNB_SUBSONIC_URL=https://my-navidrome-service.com:4533 \
    -p 4534:4534 \
    simojenki/bonob
```

Now within the LAN that contains the sonos devices run bonob the registration process.

#### Using auto-discovery

```bash
docker run \
    --rm \
    --network host \
    simojenki/bonob register https://my-server.example.com/bonob
```

#### Using a seed host

```bash
docker run \
    --rm \
    -e BNB_SONOS_SEED_HOST=192.168.1.163 \
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
      BNB_PORT: 4534
      # ip address of your machine running bonob
      BNB_URL: http://192.168.1.111:4534  
      BNB_SECRET: changeme
      BNB_SONOS_AUTO_REGISTER: true
      BNB_SONOS_DEVICE_DISCOVERY: true
      BNB_SONOS_SERVICE_ID: 246
      # ip address of one of your sonos devices
      BNB_SONOS_SEED_HOST: 192.168.1.121
      BNB_SUBSONIC_URL: http://navidrome:4533
```

### Running bonob on synology

[See this issue](https://github.com/simojenki/bonob/issues/15)

## Configuration

item | default value | description
---- | ------------- | -----------
BNB_PORT | 4534 | Default http port for bonob to listen on
BNB_URL | http://$(hostname):4534 | URL (including path) for bonob so that sonos devices can communicate. **This must be either the public IP or DNS entry of the bonob instance so that the sonos devices can communicate with it.**
BNB_SECRET | bonob | secret used for encrypting credentials
BNB_AUTH_TIMEOUT | 1h | Timeout for the sonos auth token, described in the format [ms](https://github.com/vercel/ms), ie. '5s' == 5 seconds, '11h' == 11 hours.  In the case of using Navidrome this should be less than the value for ND_SESSIONTIMEOUT
BNB_SONOS_AUTO_REGISTER | false | Whether or not to try and auto-register on startup
BNB_SONOS_DEVICE_DISCOVERY | true | Enable/Disable sonos device discovery entirely.  Setting this to 'false' will disable sonos device search, regardless of whether a seed host is specified.
BNB_SONOS_SEED_HOST | undefined | sonos device seed host for discovery, or ommitted for for auto-discovery
BNB_SONOS_SERVICE_NAME | bonob | service name for sonos
BNB_SONOS_SERVICE_ID | 246 | service id for sonos
BNB_SUBSONIC_URL | http://$(hostname):4533 | URL for subsonic clone
BNB_SUBSONIC_CUSTOM_CLIENTS | undefined | Comma delimeted mime types for custom subsonic clients when streaming. ie. "audio/flac,audio/ogg" would use client = 'bonob+audio/flac' for flacs, and 'bonob+audio/ogg' for oggs.
BNB_SUBSONIC_ARTIST_IMAGE_CACHE | undefined | Path for caching of artist images as are sourced externally.  ie. Navidrome provides spotify URLs
BNB_SCROBBLE_TRACKS | true | Whether to scrobble the playing of a track if it has been played for >30s
BNB_REPORT_NOW_PLAYING | true | Whether to report a track as now playing
BNB_ICON_FOREGROUND_COLOR | undefined | Icon foreground color in sonos app, must be a valid [svg color](https://www.december.com/html/spec/colorsvg.html)
BNB_ICON_BACKGROUND_COLOR | undefined | Icon background color in sonos app, must be a valid [svg color](https://www.december.com/html/spec/colorsvg.html)
TZ | UTC | Your timezone from the [tz database](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) ie. 'Australia/Melbourne'

## Initialising service within sonos app

- Configure bonob, make sure to set BNB_URL. **bonob must be accessible from your sonos devices on BNB_URL, otherwise it will fail to initialise within the sonos app, so make sure you test this in your browser by putting BNB_URL in the address bar and seeing the bonob information page**
- Start bonob
- Open sonos app on your device
- Settings -> Services & Voice -> + Add a Service
- Select your Music Service, default name is 'bonob', can be overriden with configuration BNB_SONOS_SERVICE_NAME
- Press 'Add to Sonos' -> 'Linking sonos with bonob' -> Authorize
- Your device should open a browser and you should now see a login screen, enter your subsonic clone credentials
- You should get 'Login successful!'
- Go back into the sonos app and complete the process
- You should now be able to play music on your sonos devices from you subsonic clone
- Within the subsonic clone a new player will be created, 'bonob (username)', so you can configure transcoding specifically for sonos

## Implementing a different music source other than a subsonic clone

- Implement the MusicService/MusicLibrary interface
- Startup bonob with your new implementation.

## A note on transcoding

tldr; Transcoding to mp3/m4a is not supported as sonos devices will not play the track.  However transcoding to flac does work, use BNB_SUBSONIC_CUSTOM_CLIENTS=audio/flac if you want to transcode flac->flac ie. to downsample HD flacs (see below).

Sonos devices are very particular about how audio streams are presented to them, see [streaming basics](https://developer.sonos.com/build/content-service-add-features/streaming-basics/).  When using transcoding both Navidrome and Gonic report no 'content-length', nor do they support range queries, this will cause the sonos device to fail to play the track.

### Audio File type specific transcoding options within Subsonic

In some situations you may wish to have different 'Players' within you Subsonic server so that you can configure different transcoding options depending on the file type.  For example if you have flacs with a mixture of frequency formats where not all are supported by sonos [See issue #52](https://github.com/simojenki/bonob/issues/52) & [Sonos supported audio formats](https://developer.sonos.com/build/content-service-add-features/supported-audio-formats/)

In this case you could set;

```bash
BNB_SUBSONIC_CUSTOM_CLIENTS="audio/flac"
```

This would result in 2 players in Navidrome, one called 'bonob', the other called 'bonob+audio/flac'.  You could then configure a custom flac transcoder in Navidrome that re-samples the flacs to a sonos supported format, ie [Using something like this](https://stackoverflow.com/questions/41420391/ffmpeg-flac-24-bit-96khz-to-16-bit-48khz);

```bash
ffmpeg -i %s -af aresample=resampler=soxr:out_sample_fmt=s16:out_sample_rate=48000 -f flac -
```

### Changing Icon colors

```bash
-e BNB_ICON_FOREGROUND_COLOR=white \
-e BNB_ICON_BACKGROUND_COLOR=darkgrey
```

![White & Dark Grey](https://github.com/simojenki/bonob/blob/master/docs/images/whiteDarkGrey.png?raw=true)

```bash
-e BNB_ICON_FOREGROUND_COLOR=chartreuse \
-e BNB_ICON_BACKGROUND_COLOR=fuchsia
```

![Chartreuse & Fuchsia](https://github.com/simojenki/bonob/blob/master/docs/images/chartreuseFuchsia.png?raw=true)

```bash
-e BNB_ICON_FOREGROUND_COLOR=lime \
-e BNB_ICON_BACKGROUND_COLOR=aliceblue
```

![Lime & Alice Blue](https://github.com/simojenki/bonob/blob/master/docs/images/limeAliceBlue.png?raw=true)

```bash
-e 'BNB_ICON_FOREGROUND_COLOR=#1db954' \
-e 'BNB_ICON_BACKGROUND_COLOR=#121212'
```

![Spotify-ish](https://github.com/simojenki/bonob/blob/master/docs/images/spotify-ish.png?raw=true)

## Credits

- Icons courtesy of: [Navidrome](https://www.navidrome.org/), [Vectornator](https://www.vectornator.io/icons), and @jicho

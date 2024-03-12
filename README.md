# bonob

A sonos SMAPI implementation to allow registering sources of music with sonos.  

Support for Subsonic API clones (tested against Navidrome and Gonic).

![Build](https://github.com/simojenki/bonob/workflows/Build/badge.svg)

## Features

- Integrates with Subsonic API clones (Navidrome, Gonic)
- Browse by Artist, Albums, Random, Favourites, Top Rated, Playlist, Genres, Years, Recently Added Albums, Recently Played Albums, Most Played Albums
- Artist & Album Art
- View Related Artists via Artist -> '...' -> Menu -> Related Arists
- Now playing & Track Scrobbling
- Search by Album, Artist, Track
- Playlist editing through sonos app.
- Marking of songs as favourites and with ratings through the sonos app.
- Localization (only en-US, da-DK, nl-NL & fr-FR supported currently, require translations for other languages).  [Sonos localization and supported languages](https://docs.sonos.com/docs/localization)
- Auto discovery of sonos devices
- Discovery of sonos devices using seed IP address
- Auto registration with sonos on start
- Multiple registrations within a single household.
- Transcoding within subsonic clone
- Custom players by mime type, allowing custom transcoding rules for different file types

## Running

bonob is packaged as an OCI image to both the docker hub registry and github registry.

ie. 
```bash
docker pull docker.io/simojenki/bonob
```
or
```bash
docker pull ghcr.io/simojenki/bonob
```

tag | description
--- | ---
latest | Latest release, intended to be stable
master | Lastest build from master, probably works, however is currently under test
vX.Y.Z | Fixed release versions from tags, for those that want to pin to a specific release


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
      BNB_SONOS_AUTO_REGISTER: "true"
      BNB_SONOS_DEVICE_DISCOVERY: "true"
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
BNB_LOG_LEVEL | info | Log level. One of ['debug', 'info', 'warn', 'error']
BNB_SERVER_LOG_REQUESTS | false | Whether or not to log http requests
BNB_SONOS_AUTO_REGISTER | false | Whether or not to try and auto-register on startup
BNB_SONOS_DEVICE_DISCOVERY | true | Enable/Disable sonos device discovery entirely.  Setting this to 'false' will disable sonos device search, regardless of whether a seed host is specified.
BNB_SONOS_SEED_HOST | undefined | sonos device seed host for discovery, or ommitted for for auto-discovery
BNB_SONOS_SERVICE_NAME | bonob | service name for sonos
BNB_SONOS_SERVICE_ID | 246 | service id for sonos
BNB_SUBSONIC_URL | http://$(hostname):4533 | URL for subsonic clone
BNB_SUBSONIC_CUSTOM_CLIENTS | undefined | Comma delimeted mime types for custom subsonic clients when streaming. <P>Must specify the source mime type and optionally the transcoded mime type. <p>For example; <p>If you want to simply re-encode some flacs, then you could specify just "audio/flac".  <p>However; <p>if your subsonic server will transcode the track then you need to specify the resulting mime type, ie. "audio/flac>audio/mp3" <p>If you want to specify many something like; "audio/flac>audio/mp3,audio/ogg" would use client = 'bonob+audio/flac' for flacs, and 'bonob+audio/ogg' for oggs.  <p>Disclaimer: Getting this configuration wrong will cause sonos to refuse to play your music, by all means experiment, however know that this may well break your setup.
BNB_SUBSONIC_ARTIST_IMAGE_CACHE | undefined | Path for caching of artist images that are sourced externally. ie. Navidrome provides spotify URLs. Remember to provide a volume-mapping for Docker, when enabling this cache.
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

## Re-registering your bonob service with sonos App

Generally speaking you will not need to do this very often.  However on occassion bonob will change the implementation of the authentication between sonos and bonob, which will require a re-registration.  Your sonos app will complain about not being able to browse the service, to re-register execute the following steps (taken from the iOS app);

- Open the sonos app
- Settings -> Services & Voice
- Your bonob service, will likely have name of either 'bonob' or $BNB_SONOS_SERVICE_NAME
- Reauthorize Account
- Authorize
- Enter credentials, you should see 'Login Successful!'
- Done

Service should now be registered and everything should work as expected.

## Multiple registrations within a single household.

It's possible to register multiple Subsonic clone users for the bonob service in Sonos.
Basically this consist of repeating the Sonos app ["Add a service"](#initialising-service-within-sonos-app) steps for each additional user.
Afterwards the Sonos app displays a dropdown underneath the service, allowing to switch between users.

## Implementing a different music source other than a subsonic clone

- Implement the MusicService/MusicLibrary interface
- Startup bonob with your new implementation.

## Transcoding

### Transcode everything

The simplest transcoding solution is to simply change the player ('bonob') in your subsonic server to transcode all content to something sonos supports (ie. mp3 & flac)

### Audio file type specific transcoding

Disclaimer: The following configuration is more complicated, and if you get the configuration wrong sonos will refuse to play your content.

In some situations you may wish to have different 'Players' within your Subsonic server so that you can configure different transcoding options depending on the file type.  For example if you have flacs with a mixture of frequency formats where not all are supported by sonos [See issue #52](https://github.com/simojenki/bonob/issues/52) & [Sonos supported audio formats](https://docs.sonos.com/docs/supported-audio-formats)

In this case you could set;

```bash
# This is equivalent to setting BNB_SUBSONIC_CUSTOM_CLIENTS="audio/flac>audio/flac"
BNB_SUBSONIC_CUSTOM_CLIENTS="audio/flac"
```

This would result in 2 players in Navidrome, one called 'bonob', the other called 'bonob+audio/flac'.  You could then configure a custom flac transcoder in Navidrome that re-samples the flacs to a sonos supported format, ie [Using something like this](https://stackoverflow.com/questions/41420391/ffmpeg-flac-24-bit-96khz-to-16-bit-48khz) or [this](https://stackoverflow.com/questions/52119489/ffmpeg-limit-audio-sample-rate):

```bash
ffmpeg -i %s -af aformat=sample_fmts=s16|s32:sample_rates=8000|11025|16000|22050|24000|32000|44100|48000 -f flac -
```

**Note for Sonos S1:** [24-bit depth is only supported by Sonos S2](https://support.sonos.com/s/article/79?language=en_US), so if your system is still on Sonos S1, transcoding should convert all FLACs to 16-bit:

```bash
ffmpeg -i %s -af aformat=sample_fmts=s16:sample_rates=8000|11025|16000|22050|24000|32000|44100|48000 -f flac -
```

Alternatively perhaps you have some aac (audio/mpeg) files that will not play in sonos (ie. voice recordings from an iPhone), however you do not want to transcode all everything, just those audio/mpeg files.  Let's say you want to transcode them to mp3s, you could set the following;

```bash
BNB_SUBSONIC_CUSTOM_CLIENTS="audio/mpeg>audio/mp3"
```

And then configure the 'bonob+audio/mpeg' player in your subsonic server.


## Changing Icon colors

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

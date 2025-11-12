# bonob

A Sonos SMAPI implementation to allow registering sources of music with Sonos.  

Support for Subsonic API clones (tested against Navidrome and Gonic).


## Features

- Integrates with Subsonic API clones (Navidrome, Gonic)
- Browse by Artist, Albums, Random, Favourites, Top Rated, Playlist, Genres, Years, Recently Added Albums, Recently Played Albums, Most Played Albums
- Artist & Album Art
- View Related Artists via Artist -> '...' -> Menu -> Related Arists
- Now playing & Track Scrobbling
- Search by Album, Artist, Track
- Playlist editing through Sonos app.
- Marking of songs as favourites and with ratings through the Sonos app.
- Transcoding within subsonic clone
- Custom players by mime type, allowing custom transcoding rules for different file types
- Localization (only en-US, da-DK, nl-NL & fr-FR supported currently, require translations for other languages).  [Sonos localization and supported languages](https://docs.sonos.com/docs/localization)
- Auto discovery of Sonos devices
- Discovery of Sonos devices using seed IP address
- Multiple registrations within a single household.
- SONOS S1 and S2 support
- Auto registration with Sonos on start for Sonos S1 devices


## Running bonob

bonob is packaged as an OCI image to both the docker hub registry and github registry.

ie. 
```bash
docker run docker.io/simojenki/bonob
```
or
```bash
docker run ghcr.io/simojenki/bonob
```

tag | description
--- | ---
latest | Latest release, intended to be stable
master | Lastest build from master, probably works, however is currently under test
vX.Y.Z | Fixed release versions from tags, for those that want to pin to a specific release


## Sonos S1 vs S2

Unfortunately in May 2024 Sonos released an update to the Sonos S2 app that required bonob be exposed to the internet to continue to work on S2. S1 devices continue to work locally within youur network.  There is a lengthy thread on the issue [here](https://github.com/simojenki/bonob/issues/205).

The tldr; is:
- If you have devices that can be down graded to Sonos S1 then you can continue to use bonob within your network without exposing anything to the internet, support for this mode of operation will continue until Sonos themselves EOL S1.  
- If you have devices that cannot be downgraded to S1 then you must use S2, in which case you need to expose bonob to the internet so that it can be called by Sonos itself.  Exposing services to the internet comes with additional risk, tread carefully.

See below for instructions on how to set up bonob for S1 or S2.


## Sonos S1 setup:

See [here](./docs/sonos-s1-setup.md)


## Sonos S2 setup:

See [here](./docs/sonos-s2-setup.adoc)


## Configuration

General configuration items
item | default value | description
---- | ------------- | -----------
BNB_PORT | 4534 | Default http port for bonob to listen on
BNB_URL | http://$(hostname):4534 | **S1:** <p> URL (including path) for bonob so that Sonos devices can communicate. **This can be an IP address or hostname on your local network, it must however be accessible by your Sonos S1 devices** <p>  **S2:** <p> This must be the publicly available DNS entry for your bonob instance, ie. https://bonob.example.com
BNB_SECRET | undefined | Secret used for encrypting credentials, must be provided, make it long, make it secure
BNB_AUTH_TIMEOUT | 1h | Timeout for the Sonos auth token, described in the format [ms](https://github.com/vercel/ms), ie. '5s' == 5 seconds, '11h' == 11 hours.  In the case of using Navidrome this should be less than the value for ND_SESSIONTIMEOUT
BNB_LOG_LEVEL | info | Log level. One of ['debug', 'info', 'warn', 'error']
BNB_SERVER_LOG_REQUESTS | false | Whether or not to log http requests
BNB_SUBSONIC_URL | http://$(hostname):4533 | URL for subsonic clone
BNB_SUBSONIC_CUSTOM_CLIENTS | undefined | Comma delimeted mime types for custom subsonic clients when streaming. <P>Must specify the source mime type and optionally the transcoded mime type. <p>For example; <p>If you want to simply re-encode some flacs, then you could specify just "audio/flac".  <p>However; <p>if your subsonic server will transcode the track then you need to specify the resulting mime type, ie. "audio/flac>audio/mp3" <p>If you want to specify many something like; "audio/flac>audio/mp3,audio/ogg" would use client = 'bonob+audio/flac' for flacs, and 'bonob+audio/ogg' for oggs.  <p>Disclaimer: Getting this configuration wrong will cause Sonos to refuse to play your music, by all means experiment, however know that this may well break your setup.
BNB_SUBSONIC_ARTIST_IMAGE_CACHE | undefined | Path for caching of artist images that are sourced externally. ie. Navidrome provides spotify URLs. Remember to provide a volume-mapping for Docker, when enabling this cache.
BNB_SCROBBLE_TRACKS | true | Whether to scrobble the playing of a track if it has been played for >30s
BNB_REPORT_NOW_PLAYING | true | Whether to report a track as now playing
BNB_ICON_FOREGROUND_COLOR | undefined | Icon foreground color in Sonos app, must be a valid [svg color](https://www.december.com/html/spec/colorsvg.html)
BNB_ICON_BACKGROUND_COLOR | undefined | Icon background color in Sonos app, must be a valid [svg color](https://www.december.com/html/spec/colorsvg.html)
BNB_LOGIN_THEME | classic | Theme for login page. Options are: <p>'classic' for the original styless bonob login page.<p>'navidrome-ish' for a simplified navidrome login page courtesy of [@deluan](https://github.com/deluan))<p>'wkulhanek' for more 'modernized login page' courtesy of [@wkulhanek](https://github.com/wkulhanek)
TZ | UTC | Your timezone from the [tz database](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) ie. 'Australia/Melbourne'


Additional configuration for S1 setups.
item | default value | description
---- | ------------- | -----------
BNB_SONOS_DEVICE_DISCOVERY | true | Enable/Disable Sonos device discovery entirely.  Setting this to 'false' will disable Sonos device search, regardless of whether a seed host is specified.
BNB_SONOS_SEED_HOST | undefined | Sonos device seed host for discovery, or ommitted for for auto-discovery
BNB_SONOS_SERVICE_NAME | bonob | S1 service name for Sonos, doesn't seem to apply for S2 setups
BNB_SONOS_SERVICE_ID | 246 | service id for Sonos
BNB_SONOS_AUTO_REGISTER | false | Whether or not to try and auto-register with S1 devices on startup.  **For S2 ensure that this is false.**


## Transcoding

### Transcode everything

The simplest transcoding solution is to simply change the player ('bonob') in your subsonic server to transcode all content to something Sonos supports (ie. mp3 & flac)

### Audio file type specific transcoding

Disclaimer: The following configuration is more complicated, and if you get the configuration wrong Sonos will refuse to play your content.

In some situations you may wish to have different 'Players' within your Subsonic server so that you can configure different transcoding options depending on the file type.  For example if you have flacs with a mixture of frequency formats where not all are supported by Sonos [See issue #52](https://github.com/simojenki/bonob/issues/52) & [Sonos supported audio formats](https://docs.sonos.com/docs/supported-audio-formats)

In this case you could set;

```bash
# This is equivalent to setting BNB_SUBSONIC_CUSTOM_CLIENTS="audio/flac>audio/flac"
BNB_SUBSONIC_CUSTOM_CLIENTS="audio/flac"
```

This would result in 2 players in Navidrome, one called 'bonob', the other called 'bonob+audio/flac'.  You could then configure a custom flac transcoder in Navidrome that re-samples the flacs to a Sonos supported format, ie [Using something like this](https://stackoverflow.com/questions/41420391/ffmpeg-flac-24-bit-96khz-to-16-bit-48khz) or [this](https://stackoverflow.com/questions/52119489/ffmpeg-limit-audio-sample-rate):

```bash
ffmpeg -i %s -af aformat=sample_fmts=s16|s32:sample_rates=8000|11025|16000|22050|24000|32000|44100|48000 -f flac -
```

**Note for Sonos S1:** [24-bit depth is only supported by Sonos S2](https://support.sonos.com/s/article/79?language=en_US), so if your system is still on Sonos S1, transcoding should convert all FLACs to 16-bit:

```bash
ffmpeg -i %s -af aformat=sample_fmts=s16:sample_rates=8000|11025|16000|22050|24000|32000|44100|48000 -f flac -
```

Alternatively perhaps you have some aac (audio/mpeg) files that will not play in Sonos (ie. voice recordings from an iPhone), however you do not want to transcode all everything, just those audio/mpeg files.  Let's say you want to transcode them to mp3s, you could set the following;

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


## Notes on running bonob with various integrations:

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


### Running bonob behind Cloudflare/cloudflared tunnels.
As discussed [here](https://github.com/simojenki/bonob/issues/101#issuecomment-1471635855) and [here](https://github.com/simojenki/bonob/issues/205#issuecomment-3461453809), there is an issue playing tracks via cloudflare.  Until otherwise resolved the current 'solution' is to "disable CF proxy feature and leave DNS-only for bonob.example.com record".  (Note you may need to wait some time for DNS caches to propogate)


## Credits

- Icons courtesy of [Navidrome](https://www.navidrome.org/), [Vectornator](https://www.vectornator.io/icons), and [@jicho](https://github.com/jicho)
- Sonos S2 support courtest of everyone involved in issue [205](https://github.com/simojenki/bonob/issues/205)

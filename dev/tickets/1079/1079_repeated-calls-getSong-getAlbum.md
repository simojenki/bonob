When a call to search is made, bonob makes repeated calls to getTrack and getAlbum on the Subsonic server.

```
POST {{host}}/ws/sonos 	
<soap:Body>
    <ns:search
        xmlns="http://www.sonos.com/Services/1.1">
        <id>tracks</id>
    <term>awesome</term>
        <index>0</index>
        <count>100</count>
    </ns:search>
</soap:Body>
```

The logs then show:

```
{"level":"debug","message":"test@elstensoftware.com /rest/search3 {\"f\":\"json\",\"artistCount\":0,\"albumCount\":0,\"songCount\":20,\"query\":\"awesome\"}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getSong {\"f\":\"json\",\"id\":25068666}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getSong {\"f\":\"json\",\"id\":25095665}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getSong {\"f\":\"json\",\"id\":26201250}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getSong {\"f\":\"json\",\"id\":26201251}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getSong {\"f\":\"json\",\"id\":26201252}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getSong {\"f\":\"json\",\"id\":25095674}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getSong {\"f\":\"json\",\"id\":26201253}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getSong {\"f\":\"json\",\"id\":26201254}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getSong {\"f\":\"json\",\"id\":26201255}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getSong {\"f\":\"json\",\"id\":26201256}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getSong {\"f\":\"json\",\"id\":26093797}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getSong {\"f\":\"json\",\"id\":26201257}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getSong {\"f\":\"json\",\"id\":25068264}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getAlbum {\"f\":\"json\",\"id\":25073921}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getAlbum {\"f\":\"json\",\"id\":25073921}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getAlbum {\"f\":\"json\",\"id\":25073921}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getAlbum {\"f\":\"json\",\"id\":25073921}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getAlbum {\"f\":\"json\",\"id\":25073921}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getAlbum {\"f\":\"json\",\"id\":25073921}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getAlbum {\"f\":\"json\",\"id\":25073921}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getAlbum {\"f\":\"json\",\"id\":25073921}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getAlbum {\"f\":\"json\",\"id\":25073921}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getAlbum {\"f\":\"json\",\"id\":25073921}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getAlbum {\"f\":\"json\",\"id\":25073921}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getAlbum {\"f\":\"json\",\"id\":25073921}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
{"level":"debug","message":"test@elstensoftware.com /rest/getAlbum {\"f\":\"json\",\"id\":25073921}","service":"bonob","timestamp":"2025-11-11 09:46:53"}
```

This shows repeated calls to `getAlbum(\"id\":25073921)`. The calls to getSong are also not ideal. These calls are made to provide extra data for the response to the original SMAPI search call. 

We would like to minimise the downstream calls back to the Subsonic server.

### Data flow
Sonos search (`{{host}}/ws/sonos <soap:Body><ns:search>...</soap:Body>`) -> bonob SMAPI (`app/smapi.ts`) -> bonob Subsonic client (`app/subsonic.ts`) -> Subsonic server (`/rest/search3`)

#### Sonos search
The client makes a search using the SMAPI SOAP API, passing a `<search>` element with the query.

- The search has a _category_:
 - tracks
 - albums
 - artists

#### bonob SMAPI
bonob calls the MusicLibrary.search<category>

Converts the `track` results to `trackMetadata`.

Example SMAPI result:

```
    <soap:Body>
        <searchResponse xmlns="http://www.sonos.com/Services/1.1">
            <searchResult>
                <count>13</count>
                <index>0</index>
                <total>13</total>
                <mediaCollection>
                    <itemType>track</itemType>
                    <id>track:25068666</id>
                    <mimeType>audio/flac</mimeType>
                    <title>Intro</title>
                    <trackMetadata>
                        <album>An Awesome Wave</album>
                        <albumId>album:25073921</albumId>
                        <albumArtist>alt-J</albumArtist>
                        <albumArtistId>artist:415089</albumArtistId>
                        <albumArtURI>http://192.168.0.9:4534/art/bnb%3As%3Aart%3A103815/size/180?bat=bbd75cdf1bf416fe4e3c4fb1725274b03a8fbab6424a84f89112ed75b546ac56</albumArtURI>
                        <artist>alt-J</artist>
                        <artistId>artist:415089</artistId>
                        <duration>157</duration>
                        <trackNumber>1</trackNumber>
                    </trackMetadata>
                    <dynamic>
                        <property>
                            <name>rating</name>
                            <value>100</value>
                        </property>
                    </dynamic>
                </mediaCollection>
                ... more results
```

#### bonob Subsonic client
This is where the multiple calls are made

First calls /search3. Example response:

```
<song id="25068666" title="Intro" genre="" size="20913360" contentType="audio/x-flac" suffix="flac" duration="157" path="scratch/An_Awesome_Wave/1-Intro.flac" type="music" isDir="false" bitRate="1060" created="2025-11-11T09:56:01" coverArt="103815" parent="28246219" album="An Awesome Wave" albumId="28246219" artist="alt-J" artistId="415089" year="2012" track="1" discNumber="0"/>
```

Then calls `subsonic.getTrack` for each of the above `<song>` results.

** TO MINIMISE **: `getTrack` calls the Subsonic rest/getSong and rest/getAlbum endpoints which are seen in the original logs above.

`asTrack` is called to convert the album back to a track.

The calls to rest/getSong and rest/getAlbum don't seem to be required because all the data for the response is already provided.

### Process
- Develop a plan to remove the calls to rest/getAlbum and rest/getSong
- Identify any missing data we don't provide currently in the original rest/search3 result
- If necessary, as the user to provide that data, if it can be within the Subsonic API specification

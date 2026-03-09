I restarted the bonob server with the latest changes - 2e801c22310346061b2cd41586ba7fd9e3757725

My existing registration is now failing to authenticate:

    2026-03-09T16:52:01.931941344+01:00 stdout F {"level":"debug","message":"Handling POST on /ws/sonos","service":"bonob","timestam
    p":"2026-03-09 15:52:01"}
    2026-03-09T16:52:01.931941344+01:00 stdout F {"level":"debug","message":"<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/
    soap/envelope/\" xmlns:ns=\"http://www.sonos.com/Services/1.1\"><soap:Header><credentials xmlns=\"http://www.sonos.com/Services/
    1.1\"><deviceProvider>Sonos</deviceProvider><loginToken><token>eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlVG9rZW4iOiJleUox
    YzJWeWJtRnRaU0k2SW1SaGJrQmxiSE4wWlc1emIyWjBkMkZ5WlM1amIyMGlMQ0p3WVhOemQyOXlaQ0k2SWtSelpEVk5aSGRQV2tkWFRURjRWalJJYzA1dEluMD0iLCJp
    YXQiOjE3NzI4MTEwOTksImV4cCI6MTc3MjgxNDY5OX0.ZTQJhKNS1V8cPgQ7WjWuOFDUsgDD-kSDTUKrCAPi6u8</token><householdId>Sonos_P6KlfSihgITEL6
    hU0bYXYb8dg7_6ed60bd3</householdId></loginToken></credentials></soap:Header><soap:Body><ns:getMetadata xmlns=\"http://www.sonos.
    com/Services/1.1\"><id>favouriteAlbums</id><index>0</index><count>100</count></ns:getMetadata></soap:Body></soap:Envelope>","ser
    vice":"bonob","timestamp":"2026-03-09 15:52:01"}
    2026-03-09T16:52:01.931941344+01:00 stdout F {"level":"debug","message":"Attempting to bind to /ws/sonos","service":"bonob","tim
    estamp":"2026-03-09 15:52:01"}
    2026-03-09T16:52:01.931941344+01:00 stdout F {"level":"debug","message":"Trying SonosSoap from path /about","service":"bonob","t
    imestamp":"2026-03-09 15:52:01"}
    2026-03-09T16:52:01.935670154+01:00 stdout F {"error":{"code":"NoSuchKey","message":"Key not found","name":"S3Error","region":"garage","resource":"/astiga-sonos-tokens/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlVG9rZW4iOiJleUoxYzJWeWJtRnRaU0k2SW1SaGJrQmxiSE4wWlc1emIyWjBkMkZ5WlM1amIyMGlMQ0p3WVhOemQyOXlaQ0k2SWtSelpEVk5aSGRQV2tkWFRURjRWalJJYzA1dEluMD0iLCJpYXQiOjE3NzI4MTEwOTksImV4cCI6MTc3MjgxNDY5OX0.ZTQJhKNS1V8cPgQ7WjWuOFDUsgDD-kSDTUKrCAPi6u8"},"level":"warn","message":"S3 get(eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlVG9rZW4iOiJleUoxYzJWeWJtRnRaU0k2SW1SaGJrQmxiSE4wWlc1emIyWjBkMkZ5WlM1amIyMGlMQ0p3WVhOemQyOXlaQ0k2SWtSelpEVk5aSGRQV2tkWFRURjRWalJJYzA1dEluMD0iLCJpYXQiOjE3NzI4MTEwOTksImV4cCI6MTc3MjgxNDY5OX0.ZTQJhKNS1V8cPgQ7WjWuOFDUsgDD-kSDTUKrCAPi6u8) failed (attempt 1/3), retrying in 500ms","service":"bonob","timestamp":"2026-03-09 15:52:01"}
    2026-03-09T16:52:02.437859983+01:00 stdout F {"error":{"code":"NoSuchKey","message":"Key not found","name":"S3Error","region":"garage","resource":"/astiga-sonos-tokens/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlVG9rZW4iOiJleUoxYzJWeWJtRnRaU0k2SW1SaGJrQmxiSE4wWlc1emIyWjBkMkZ5WlM1amIyMGlMQ0p3WVhOemQyOXlaQ0k2SWtSelpEVk5aSGRQV2tkWFRURjRWalJJYzA1dEluMD0iLCJpYXQiOjE3NzI4MTEwOTksImV4cCI6MTc3MjgxNDY5OX0.ZTQJhKNS1V8cPgQ7WjWuOFDUsgDD-kSDTUKrCAPi6u8"},"level":"warn","message":"S3 get(eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlVG9rZW4iOiJleUoxYzJWeWJtRnRaU0k2SW1SaGJrQmxiSE4wWlc1emIyWjBkMkZ5WlM1amIyMGlMQ0p3WVhOemQyOXlaQ0k2SWtSelpEVk5aSGRQV2tkWFRURjRWalJJYzA1dEluMD0iLCJpYXQiOjE3NzI4MTEwOTksImV4cCI6MTc3MjgxNDY5OX0.ZTQJhKNS1V8cPgQ7WjWuOFDUsgDD-kSDTUKrCAPi6u8) failed (attempt 2/3), retrying in 1000ms","service":"bonob","timestamp":"2026-03-09 15:52:02"}
    2026-03-09T16:52:03.440261390+01:00 stdout F {"level":"warn","message":"Couldn't lookup token","service":"bonob","stack":"Error: Couldn't lookup token\n    at /bonob/src/smapi.js:348:27\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\n    at async login (/bonob/src/smapi.js:369:27)\n    at async /bonob/src/smapi.js:429:32","timestamp":"2026-03-09 15:52:03"}
    2026-03-09T16:52:03.441085818+01:00 stdout F {"durationMs":1511,"failed":true,"level":"info","message":"2bc2e559-c359-422a-b79d-77d26e4f9eed [TIMING] SMAPI getMetadata 1511ms FAILED","method":"getMetadata","service":"bonob","timestamp":"2026-03-09 15:52:03"}
    2026-03-09T16:52:03.441309660+01:00 stdout F {"level":"debug","message":"<?xml version=\"1.0\" encoding=\"utf-8\"?><soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"  xmlns:tns=\"http://www.sonos.com/Services/1.1\"><soap:Body><soap:Fault><faultcode>Client.LoginUnauthorized</faultcode><faultstring>Failed to authenticate, try Re-Authorising your account in the sonos app</faultstring></soap:Fault></soap:Body></soap:Envelope>","service":"bonob","timestamp":"2026-03-09 15:52:03"}
    2026-03-09T16:52:03.441385736+01:00 stdout F ::ffff:192.168.14.22 - - [09/Mar/2026:15:52:03 +0000] "POST /ws/sonos HTTP/1.1" 200 - "-" "pdsw-app-passport-android/81.0.51 (Android 13; Pixel 4a; google; sunfish) (Sonos/Universal-Content-Service 1.1.1088)"

Indeed, the key isn't there:

    $ aws --profile garage --region garage --endpoint-url http://192.168.14.25:3900 s3 ls astiga-sonos-tokens/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlVG9rZW4iOiJleUoxYzJWeWJtRnRaU0k2SW1SaGJrQmxiSE4wWlc1emIyWjBkMkZ5WlM1amIyMGlMQ0p3WVhOemQyOXlaQ0k2SWtSelpEVk5aSGRQV2tkWFRURjRWalJJYzA1dEluMD0iLCJpYXQiOjE3NzI4MTEwOTksImV4cCI6MTc3MjgxNDY5OX0.ZTQJhKNS1V8cPgQ7WjWuOFDUsgDD-kSDTUKrCAPi6u8
    gravelld@study-workstation:~/git-repo/bonob$ 

Other connections seem to be working:

    2026-03-09T14:41:11.470619281+01:00 stdout F {"level":"debug","message":"Handling POST on /ws/sonos","service":"bonob","timestam
    p":"2026-03-09 13:41:11"}
    2026-03-09T14:41:11.471538130+01:00 stdout F {"level":"debug","message":"<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/e
    nvelope/\"><s:Header><credentials xmlns=\"http://www.sonos.com/Services/1.1\"><deviceId>5C-AA-FD-44-43-AA:E</deviceId><devicePro
    vider>Sonos</deviceProvider><loginToken><token>eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlVG9rZW4iOiJleUoxYzJWeWJtRnRaU0k2
    SW1Ga1prQjBhV05wYm04dVkyOXRJaXdpY0dGemMzZHZjbVFpT2lKYWFrMXJWMVJMYkdodVdFUnFWbGhqUTJacFl5SjkiLCJpYXQiOjE3NzMwNjAyODIsImV4cCI6MTc3
    MzA2Mzg4Mn0.KDjBt52ZNJKi4ykwUIa-393owSuPQn9U6CbJrjBYzY8</token><key>620949a8-7f86-47c0-8c92-97446a87f541</key><householdId>Sonos
    _gBy2nYtKQm5AmXLIOyQWqBFswF</householdId></loginToken></credentials></s:Header><s:Body><getMediaURI xmlns=\"http://www.sonos.com
    /Services/1.1\"><id>track:31785873</id><action>IMPLICIT</action><secondsSinceExplicit>10417</secondsSinceExplicit></getMediaURI>
    </s:Body></s:Envelope>","service":"bonob","timestamp":"2026-03-09 13:41:11"}
    2026-03-09T14:41:11.474396518+01:00 stdout F {"level":"debug","message":"Attempting to bind to /ws/sonos","service":"bonob","tim
    estamp":"2026-03-09 13:41:11"}
    2026-03-09T14:41:11.474690103+01:00 stdout F {"level":"debug","message":"Trying SonosSoap from path /about","service":"bonob","t
    imestamp":"2026-03-09 13:41:11"}
    2026-03-09T14:41:11.481530375+01:00 stdout F {"durationMs":6,"level":"info","message":"57b21904-a2a9-45cd-8f40-3d0cf8baed7b [TIM
    ING] SMAPI getMediaURI 6ms","method":"getMediaURI","service":"bonob","timestamp":"2026-03-09 13:41:11"}
    2026-03-09T14:41:11.484255131+01:00 stdout F {"level":"debug","message":"<?xml version=\"1.0\" encoding=\"utf-8\"?><soap:Envelop
    e xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"  xmlns:tns=\"http://www.sonos.com/Services/1.1\"><soap:Body><getMedia
    URIResponse xmlns=\"http://www.sonos.com/Services/1.1\"><getMediaURIResult>https://sonos.asti.ga/stream/track/31785873</getMedia
    URIResult><httpHeaders><httpHeader><header>bnbt</header><value>eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlVG9rZW4iOiJleUox
    YzJWeWJtRnRaU0k2SW1Ga1prQjBhV05wYm04dVkyOXRJaXdpY0dGemMzZHZjbVFpT2lKYWFrMXJWMVJMYkdodVdFUnFWbGhqUTJacFl5SjkiLCJpYXQiOjE3NzMwNjAy
    ODIsImV4cCI6MTc3MzA2Mzg4Mn0.KDjBt52ZNJKi4ykwUIa-393owSuPQn9U6CbJrjBYzY8</value></httpHeader></httpHeaders><httpHeaders><httpHead
    er><header>bnbk</header><value>620949a8-7f86-47c0-8c92-97446a87f541</value></httpHeader></httpHeaders></getMediaURIResponse></so
    ap:Body></soap:Envelope>","service":"bonob","timestamp":"2026-03-09 13:41:11"}
    2026-03-09T14:41:11.484692111+01:00 stdout F ::ffff:192.168.14.26 - - [09/Mar/2026:13:41:11 +0000] "POST /ws/sonos HTTP/1.1" 200
     - "-" "Linux UPnP/1.0 Sonos/86.4-73290 (ZPS1)"

But that key isn't there either:

    $ aws --profile garage --region garage --endpoint-url http://192.168.14.25:3900 s3 ls astiga-sonos-tokens/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlVG9rZW4iOiJleUoxYzJWeWJtRnRaU0k2SW1Ga1prQjBhV05wYm04dVkyOXRJaXdpY0dGemMzZHZjbVFpT2lKYWFrMXJWMVJMYkdodVdFUnFWbGhqUTJacFl5SjkiLCJpYXQiOjE3NzMwNjAyODIsImV4cCI6MTc3MzA2Mzg4Mn0.KDjBt52ZNJKi4ykwUIa-393owSuPQn9U6CbJrjBYzY8
    gravelld@study-workstation:~/git-repo/bonob$

Could be deleted?

You may make forensic specific queries into the `/tmp/astiga_sonos/0bbe1f2a-871a-c6fb-769d-26c3703fc812/bonob.stdout.0` file to look for more. DO NOT load many lines.
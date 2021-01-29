# bonob

A bridge between sonos and ?

![Build](https://github.com/simojenki/bonob/workflows/Build/badge.svg)

## Running

bonob is ditributed via docker and can be run in a number of ways

### Full sonos device auto-discovery by using docker --network host
```
docker run \
    -e PORT=3000 \
    -p 3000 \
    --network host \
    simojenki/bonob
```

### Full sonos device auto-discovery by using a sonos seed device, without requiring docker host networking
```
docker run \
    -e PORT=3000 \
    -e BONOB_SONOS_SEED_HOST=192.168.1.123 \
    -p 3000 \
    simojenki/bonob
```
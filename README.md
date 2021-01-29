# bonob

A bridge between sonos and ?

![Build](https://github.com/simojenki/bonob/workflows/Build/badge.svg)

## Running

bonob is ditributed via docker and can be run in a number of ways

### Full sonos device auto-discovery by using docker --network host
```
docker run \
    -p 4534 \
    --network host \
    simojenki/bonob
```

### Full sonos device auto-discovery on custom port by using a sonos seed device, without requiring docker host networking
```
docker run \
    -e BONOB_SONOS_SEED_HOST=192.168.1.123 \
    -e PORT=3000 \
    -p 3000 \
    simojenki/bonob
```

### Disabling sonos device discovery entirely
```
docker run \
    -e BONOB_SONOS_SEED_HOST=disabled \
    -p 4534 \
    simojenki/bonob
```

## Configuration

item | default value | description 
---- | ------------- | -----------
PORT | 4534 | Default http port for bonob to listen on
BONOB_SONOS_SEED_HOST | undefined | sonos device seed host for auto-discovery, or 'disabled' to turn off device discovery entirely

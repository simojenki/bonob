# Sonos S1 setup:

## Running bonob itself

### Full Sonos device auto-discovery and auto-registration using docker --network host

```bash
docker run \
    -e BNB_SONOS_AUTO_REGISTER=true \
    -e BNB_SONOS_DEVICE_DISCOVERY=true \
    -p 4534:4534 \
    --network host \
    simojenki/bonob
```

Now open http://localhost:4534 in your browser, you should see Sonos devices, and service configuration.  Bonob will auto-register itself with your Sonos system on startup.

### Full Sonos device auto-discovery and auto-registration on custom port by using a Sonos seed device, without requiring docker host networking

```bash
docker run \
    -e BNB_PORT=3000 \
    -e BNB_SONOS_SEED_HOST=192.168.1.123 \
    -e BNB_SONOS_AUTO_REGISTER=true \
    -e BNB_SONOS_DEVICE_DISCOVERY=true \
    -p 3000:3000 \
    simojenki/bonob
```

Bonob will now auto-register itself with Sonos on startup, updating the registration if the configuration has changed.  Bonob should show up in the "Services" list on http://localhost:3000

### Running bonob on a different network to your Sonos devices

Running bonob outside of your lan will require registering your bonob install with your Sonos devices from within your LAN.  

If you are using bonob over the Internet, you do this at your own risk and should use TLS.

Start bonob outside the LAN with Sonos discovery & registration disabled as they are meaningless in this case, ie.

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

Now within the LAN that contains the Sonos devices run bonob the registration process.

### Using auto-discovery

```bash
docker run \
    --rm \
    --network host \
    simojenki/bonob register https://my-server.example.com/bonob
```

### Using a seed host

```bash
docker run \
    --rm \
    -e BNB_SONOS_SEED_HOST=192.168.1.163 \
    simojenki/bonob register https://my-server.example.com/bonob
```

## Initialising service within Sonos app

- Configure bonob, make sure to set BNB_URL. **bonob must be accessible from your Sonos devices on BNB_URL, otherwise it will fail to initialise within the Sonos app, so make sure you test this in your browser by putting BNB_URL in the address bar and seeing the bonob information page**
- Start bonob
- Open Sonos app on your device
- Settings -> Services & Voice -> + Add a Service
- Select your Music Service, default name is 'bonob', can be overriden with configuration BNB_SONOS_SERVICE_NAME
- Press 'Add to Sonos' -> 'Linking Sonos with bonob' -> Authorize
- Your device should open a browser and you should now see a login screen, enter your subsonic clone credentials
- You should get 'Login successful!'
- Go back into the Sonos app and complete the process
- You should now be able to play music on your Sonos devices from you subsonic clone
- Within the subsonic clone a new player will be created, 'bonob (username)', so you can configure transcoding specifically for Sonos

## Re-registering your bonob service with Sonos App

Generally speaking you will not need to do this very often.  However on occassion bonob will change the implementation of the authentication between Sonos and bonob, which will require a re-registration.  Your Sonos app will complain about not being able to browse the service, to re-register execute the following steps (taken from the iOS app);

- Open the Sonos app
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

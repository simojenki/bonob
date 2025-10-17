# Updates for SMAPI

Run Bonob on your server.

Bonob now needs a volume to store OAuth Tokens. In the example below that directory is `/var/containers/bonob`. Adapt as needed.
Also the example below uses a `bonob` user on the system with ID `1210` and group `100`. The directory should be owned by that user.

Example systemd file (`/usr/lib/systemd/system/bonob.service`):
====
[Unit]
Description=bonob Container Service
Wants=network.target
After=network-online.target

[Service]
Environment=PODMAN_SYSTEMD_UNIT=%n
Restart=always
ExecStartPre=-/usr/bin/podman rm -f bonob
ExecStart=/usr/bin/podman run --rm \
  --name bonob \
  --label "io.containers.autoupdate=image" \
  --user 1210:100 \
  --env BNB_SONOS_SERVICE_NAME="Navidrome" \
  --env BNB_PORT=8200 \
  --env BNB_URL="https://bonob.mydomain.com" \
  --env BNB_SECRET="<Some random string>" \
  --env BNB_SONOS_SERVICE_ID=<Your Sonos ID> \
  --env BNB_SUBSONIC_URL=https://music.mydomain.com \
  --env BNB_ICON_FOREGROUND_COLOR="black" \
  --env BNB_ICON_BACKGROUND_COLOR="#65d7f4" \
  --env BNB_SONOS_AUTO_REGISTER=false \
  --env BNB_SONOS_DEVICE_DISCOVERY=false \
  --env BNB_LOG_LEVEL="info" \
  --env TZ="Europe/Vienna" \
  --volume /var/containers/bonob:/config:Z \
  --publish 8200:8200 \
  quay.io/wkulhanek/bonob:latest
ExecStop=/usr/bin/podman rm -f bonob
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=bonob

[Install]
WantedBy=multi-user.target default.target
====

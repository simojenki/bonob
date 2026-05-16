FROM node:22-trixie

ENV DEBIAN_FRONTEND=noninteractive

LABEL maintainer=simojenki

ENV JEST_TIMEOUT=60000
EXPOSE 4534

RUN apt-get update && \
    apt-get -y upgrade && \
    apt-get -y install --no-install-recommends \
        containernetworking-plugins \
        jq \
        g++ \
        git \
        libvips-dev \
        make \
        podman \
        python3 \
        sudo \
        tzdata \
        vim && \
    ln -fs /usr/share/zoneinfo/Australia/Melbourne /etc/localtime && \
    dpkg-reconfigure --frontend noninteractive tzdata && \
    apt-get clean

RUN echo "node ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/node

RUN mkdir -p /home/node/.config/containers

RUN cat > /home/node/.config/containers/storage.conf <<EOF
[storage]
driver = "vfs"
EOF

ENV BUILDAH_ISOLATION=chroot
ENV _CONTAINERS_USERNS_CONFIGURED=""

USER node

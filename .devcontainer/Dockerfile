FROM node:22-bookworm

LABEL maintainer=simojenki

ENV JEST_TIMEOUT=60000
EXPOSE 4534

RUN apt-get update && \
    apt-get -y upgrade && \
    apt-get -y install --no-install-recommends \
        jq \
        libvips-dev \
        python3 \
        make \
        git \
        g++ \
        tzdata \
        vim && \
    ln -fs /usr/share/zoneinfo/Australia/Melbourne /etc/localtime && \
    dpkg-reconfigure --frontend noninteractive tzdata && \
    apt-get clean


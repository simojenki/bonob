FROM node:20-bullseye

LABEL maintainer=simojenki

ENV JEST_TIMEOUT=60000
EXPOSE 4534

RUN apt-get update && \
    apt-get -y upgrade && \
    apt-get -y install --no-install-recommends \
        libvips-dev \
        python3 \
        make \
        git \
        g++ \
        vim

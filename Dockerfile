FROM node:22-trixie-slim AS build

WORKDIR /bonob

COPY .git ./.git
COPY src ./src
COPY docs ./docs
COPY typings ./typings
COPY web ./web
COPY tests ./tests
COPY jest.config.js .
COPY register.js .
COPY .npmrc .
COPY tsconfig.json .
COPY package.json .
COPY package-lock.json .

ENV JEST_TIMEOUT=60000
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get -y upgrade && \
    apt-get -y install --no-install-recommends \
        libvips-dev \
        python3 \
        make \
        git \
        g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    npm install && \
    npm test && \
    npm run gitinfo && \
    npm run build && \
    rm -Rf node_modules && \
    NODE_ENV=production npm install --omit=dev


FROM node:22-trixie-slim

LABEL   maintainer="simojenki" \
        org.opencontainers.image.source="https://github.com/simojenki/bonob" \
        org.opencontainers.image.description="bonob SONOS SMAPI implementation" \
        org.opencontainers.image.licenses="GPLv3"

ENV BNB_PORT=4534
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

EXPOSE $BNB_PORT

WORKDIR /bonob

COPY package.json .
COPY package-lock.json .

COPY --from=build /bonob/build/src ./src
COPY --from=build /bonob/node_modules ./node_modules
COPY --from=build /bonob/.gitinfo ./
COPY web ./web
COPY src/Sonoswsdl-1.19.6-20231024.wsdl ./src/Sonoswsdl-1.19.6-20231024.wsdl

RUN apt-get update && \
    apt-get -y upgrade && \
    apt-get -y install --no-install-recommends \
        libvips \
        tzdata \
        wget && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

USER nobody 
WORKDIR /bonob/src

HEALTHCHECK CMD wget -O- http://localhost:${BNB_PORT}/about || exit 1   

CMD ["node", "app.js"]
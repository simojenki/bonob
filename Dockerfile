FROM node:16-bullseye-slim as build

WORKDIR /bonob

COPY .git ./.git
COPY src ./src
COPY docs ./docs
COPY typings ./typings
COPY web ./web
COPY tests ./tests
COPY jest.config.js .
COPY package.json .
COPY register.js .
COPY tsconfig.json .
COPY yarn.lock .
COPY .yarnrc.yml .
COPY .yarn/releases ./.yarn/releases

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
    yarn config set network-timeout 600000 -g && \
    yarn install \
        --prefer-offline \
        --frozen-lockfile \
        --non-interactive \
        --production=false && \
    yarn test --no-cache && \
    yarn gitinfo && \
    yarn build && \
    rm -Rf node_modules && \
    NODE_ENV=production yarn install \
        --prefer-offline \
        --pure-lockfile \
        --non-interactive \
        --production=true


FROM node:16-bullseye-slim

LABEL maintainer=simojenki

ENV BNB_PORT=4534
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

EXPOSE $BNB_PORT

WORKDIR /bonob

COPY package.json .
COPY yarn.lock .

COPY --from=build /bonob/build/src ./src
COPY --from=build /bonob/node_modules ./node_modules
COPY --from=build /bonob/.gitinfo ./
COPY web ./web
COPY src/Sonoswsdl-1.19.4-20190411.142401-3.wsdl ./src/Sonoswsdl-1.19.4-20190411.142401-3.wsdl

RUN apt-get update && \
    apt-get -y upgrade && \
    apt-get -y install --no-install-recommends \
        libvips \
        tzdata && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

USER nobody 
WORKDIR /bonob/src

HEALTHCHECK CMD wget -O- http://localhost:${BNB_PORT}/about || exit 1   

CMD ["node", "app.js"]
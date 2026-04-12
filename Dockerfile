FROM node:22-bookworm-slim AS build

WORKDIR /bonob

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
    rm -rf /var/lib/apt/lists/*

# Install dependencies first so this layer caches when only source changes
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# Now copy source and build
COPY tsconfig.json jest.config.js register.js ./
COPY src ./src
COPY typings ./typings
COPY .git ./.git

RUN npm run gitinfo && \
    npm run build && \
    npm prune --omit=dev


FROM node:22-bookworm-slim

LABEL   maintainer="simojenki" \
        org.opencontainers.image.source="https://github.com/simojenki/bonob" \
        org.opencontainers.image.description="bonob SONOS SMAPI implementation" \
        org.opencontainers.image.licenses="GPLv3"

ENV BNB_PORT=4534
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

EXPOSE $BNB_PORT

WORKDIR /bonob

RUN apt-get update && \
    apt-get -y upgrade && \
    apt-get -y install --no-install-recommends \
        libvips \
        tzdata \
        wget && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY --from=build /bonob/build/src ./src
COPY --from=build /bonob/node_modules ./node_modules
COPY --from=build /bonob/.gitinfo ./
COPY web ./web
COPY src/Sonoswsdl-1.19.6-20231024.wsdl ./src/Sonoswsdl-1.19.6-20231024.wsdl

USER nobody
WORKDIR /bonob/src

HEALTHCHECK CMD wget -O- http://localhost:${BNB_PORT}/about || exit 1

CMD ["node", "app.js"]

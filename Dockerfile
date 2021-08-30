FROM node:16.6-alpine as build

WORKDIR /bonob

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

RUN apk add --no-cache --update --virtual .gyp \
        vips-dev \
        python3 \
        make \
        g++ && \
    yarn install --immutable && \
    yarn test --no-cache && \
    yarn build



FROM node:16.6-alpine

ENV BONOB_PORT=4534

EXPOSE $BONOB_PORT

WORKDIR /bonob

COPY package.json .
COPY yarn.lock .

COPY --from=build /bonob/build/src ./src
COPY --from=build /bonob/node_modules ./node_modules
COPY web ./web
COPY src/Sonoswsdl-1.19.4-20190411.142401-3.wsdl ./src/Sonoswsdl-1.19.4-20190411.142401-3.wsdl

RUN apk add --no-cache --update vips

USER nobody 

CMD ["node", "/bonob/src/app.js"]
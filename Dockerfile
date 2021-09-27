FROM node:16.6-alpine as build

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

RUN apk add --no-cache --update --virtual .gyp \
        vips-dev \
        python3 \
        make \
        git \
        g++ && \
    yarn install --immutable && \
    yarn gitinfo && \
    yarn test --no-cache && \
    yarn build



FROM node:16.6-alpine

ENV BNB_PORT=4534

EXPOSE $BNB_PORT

WORKDIR /bonob

COPY package.json .
COPY yarn.lock .

COPY --from=build /bonob/build/src ./src
COPY --from=build /bonob/node_modules ./node_modules
COPY --from=build /bonob/.gitinfo ./
COPY web ./web
COPY src/Sonoswsdl-1.19.4-20190411.142401-3.wsdl ./src/Sonoswsdl-1.19.4-20190411.142401-3.wsdl

RUN apk add --no-cache --update vips

USER nobody 
WORKDIR /bonob/src

CMD ["node", "app.js"]
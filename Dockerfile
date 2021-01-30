FROM node:14.15-alpine as build

WORKDIR /bonob

COPY package.json .
COPY yarn.lock .
COPY tsconfig.json .
COPY src .

RUN yarn install && \
    yarn build



FROM node:14.15-alpine

EXPOSE 4534

WORKDIR /bonob

COPY package.json .
COPY yarn.lock .
COPY --from=build /bonob/build/* ./
COPY web web

RUN yarn install --prod

USER nobody 

CMD ["node", "./app.js"]
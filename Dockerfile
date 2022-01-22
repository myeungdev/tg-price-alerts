FROM node:16.13.0

WORKDIR /usr/app
COPY ./.npmrc .
COPY ./package.json .
RUN npm install
COPY . .
RUN npm run build

CMD ["node", "build/src/main.js"]

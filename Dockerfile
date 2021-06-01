FROM node:14
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm i
COPY . .

RUN npm run build && npx tsc

CMD ["node", "server/index.js"]

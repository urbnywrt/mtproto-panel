FROM node:20-alpine

# Required for running update.sh from inside the container. Without the compose plugin
# the script failed on its first `docker compose` call.
RUN apk add --no-cache bash git docker-cli docker-cli-compose \
    || (sed -i 's|https://|http://|g' /etc/apk/repositories \
        && apk add --no-cache bash git docker-cli docker-cli-compose)

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY tsconfig.json ./
COPY src ./src

RUN npm run build
RUN npm prune --production

EXPOSE 3000

CMD ["node", "dist/index.js"]

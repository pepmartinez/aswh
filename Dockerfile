# docker build -t pepmartinez/aswh:1.3.0 .
# docker push pepmartinez/aswh:1.3.0

FROM node:14.15.2-buster-slim as builder

RUN apt-get update && \
    apt-get install -y build-essential python && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production


# final image
FROM node:14.15.2-buster-slim

WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/node_modules ./node_modules

COPY . .

EXPOSE 8080
CMD ["node", "index.js"]

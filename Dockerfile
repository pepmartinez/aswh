# docker build -t pepmartinez/aswh:2.0.1 .
# docker push pepmartinez/aswh:2.0.1

FROM node:20-slim as builder

RUN apt-get update && \
    apt-get install -y build-essential python3 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production


# final image
FROM node:20-slim

WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/node_modules ./node_modules

COPY . .

EXPOSE 8080
CMD ["node", "index.js"]

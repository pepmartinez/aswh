# docker build -t pepmartinez/aswh:0.0.0 .
# docker push pepmartinez/aswh:0.0.0 .

FROM node:14.15.1-alpine

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --only=production

COPY . .

EXPOSE 8080
CMD ["node", "index.js"]

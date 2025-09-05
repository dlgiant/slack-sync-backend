FROM node:18-alpine

WORKDIR /app

# Install SQLite3 dependencies
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3001

# Use production command for Railway
CMD ["node", "src/index.js"]
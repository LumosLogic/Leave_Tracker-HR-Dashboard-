FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Cloud Run injects PORT env var (default 8080); app already reads process.env.PORT
EXPOSE 8080

CMD ["node", "backend/src/server.js"]

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY api/package*.json ./api/
COPY bot/package*.json ./bot/
COPY frontend/package*.json ./frontend/
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY api/package*.json ./api/
COPY bot/package*.json ./bot/
RUN npm install --omit=dev --workspace=api --workspace=bot
COPY --from=builder /app/api ./api
COPY --from=builder /app/bot ./bot
COPY --from=builder /app/bin ./bin
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/.env.example ./.env.example
EXPOSE 3002
VOLUME ["/app/data"]
CMD ["node", "bin/whasender.js"]

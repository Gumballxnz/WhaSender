FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /app
COPY package*.json ./
COPY api/package*.json ./api/
COPY bot/package*.json ./bot/
COPY frontend/package*.json ./frontend/
RUN npm ci
COPY frontend/ ./frontend/
RUN npm run build --workspace=frontend

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3002
ENV PORT_API=3002
ENV DB_PATH=/app/data/whasender.db
ENV FILES_PATH=/app/data/arquivos
ENV SESSION_PATH=/app/data/sessions

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY api/package*.json ./api/
COPY bot/package*.json ./bot/
COPY frontend/package*.json ./frontend/

RUN npm ci --omit=dev

COPY api/ ./api/
COPY bot/ ./bot/
COPY bin/ ./bin/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/data/arquivos /app/data/sessions

VOLUME /app/data

EXPOSE 3002

CMD ["node", "bin/whasender.js"]

FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @wenhe/contracts build \
  && pnpm --filter @wenhe/document build \
  && pnpm --filter @wenhe/ai build \
  && pnpm --filter @wenhe/api build \
  && mkdir -p /data/generated \
  && chown -R node:node /data
USER node
EXPOSE 3100
CMD ["node", "apps/api/dist/server.js"]

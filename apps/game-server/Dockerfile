# Game server image. Build from the repo root:
#   docker build -f apps/game-server/Dockerfile .
FROM node:24-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm
WORKDIR /repo
COPY . .
# Only the game server and the workspace packages it depends on (SDK, shared, games).
RUN pnpm install --frozen-lockfile --filter "@games/game-server..."
# A self-contained copy with production dependencies only.
RUN pnpm --filter @games/game-server deploy --prod --legacy /out

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 2567
CMD ["node", "--import", "tsx", "src/index.ts"]

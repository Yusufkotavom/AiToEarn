FROM node:24-alpine AS deps

RUN npm install -g pnpm

WORKDIR /app

COPY . ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm nx build aitoearn-server

FROM node:24-alpine AS production

ARG APP_NAME

RUN apk add --no-cache curl ffmpeg

WORKDIR /app

COPY assets/ ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/dist ./dist

ENV NODE_ENV=production
ENV APP_NAME=$APP_NAME

CMD ["sh", "-c", "node dist/apps/aitoearn-server/src/main.js -c config.js"]

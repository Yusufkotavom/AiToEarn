FROM node:24-alpine AS deps

RUN npm install -g pnpm

WORKDIR /app

COPY . ./

<<<<<<< HEAD
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile
=======
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --no-frozen-lockfile
>>>>>>> 74b990a94a619a6faa6cc0157e3efb1b1c898300

FROM node:24-alpine AS production

ARG APP_NAME

RUN apk add --no-cache curl ffmpeg

WORKDIR /app

COPY assets/ ./
COPY --from=deps /app/ ./

COPY apps/ ./apps/
COPY libs/ ./libs/

ENV NODE_ENV=production
ENV APP_NAME=$APP_NAME

CMD ["sh", "-c", "node apps/${APP_NAME}/src/main.js -c config.js"]

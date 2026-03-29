FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

COPY package.json ./
RUN corepack enable && pnpm install --prod

COPY src ./src

EXPOSE 4310
CMD ["pnpm", "start"]

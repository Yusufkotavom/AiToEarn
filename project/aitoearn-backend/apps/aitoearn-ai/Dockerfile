FROM node:24-alpine AS deps

RUN npm install -g pnpm

WORKDIR /app

COPY . ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm nx build aitoearn-ai

FROM node:24-alpine AS production

ARG APP_NAME

RUN apk add --no-cache curl ffmpeg

WORKDIR /app

COPY assets/ ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/dist ./dist
RUN node -e "const fs=require('fs');const path=require('path');const libs='dist/libs';if(fs.existsSync(libs)){for(const lib of fs.readdirSync(libs)){const pkgPath=path.join(libs,lib,'package.json');if(!fs.existsSync(pkgPath)) continue;const name=JSON.parse(fs.readFileSync(pkgPath,'utf8')).name;const target=path.join('node_modules',...name.split('/'));fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(path.join(libs,lib),target,{recursive:true});}}"

ENV NODE_ENV=production
ENV APP_NAME=$APP_NAME

CMD ["sh", "-c", "echo 'nameserver 8.8.8.8' >> /etc/resolv.conf && echo 'nameserver 1.1.1.1' >> /etc/resolv.conf && node dist/apps/aitoearn-ai/src/main.js -c config.js"]

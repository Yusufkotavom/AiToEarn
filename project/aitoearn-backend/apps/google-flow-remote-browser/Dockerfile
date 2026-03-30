FROM mcr.microsoft.com/playwright:v1.58.2-jammy

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

RUN apt-get update \
  && apt-get install -y --no-install-recommends wget gnupg ca-certificates xvfb x11vnc fluxbox novnc websockify socat \
  && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-linux.gpg \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN corepack enable && pnpm install --prod

COPY scripts ./scripts
COPY src ./src
RUN chmod +x ./scripts/start.sh

EXPOSE 4320 6080 9222
CMD ["./scripts/start.sh"]

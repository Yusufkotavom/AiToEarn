#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:99}"
export VNC_PORT="${VNC_PORT:-5900}"
export NOVNC_PORT="${NOVNC_PORT:-6080}"
export CDP_PROXY_PORT="${CDP_PROXY_PORT:-9223}"

Xvfb "$DISPLAY" -screen 0 1440x900x24 -ac +extension RANDR &
fluxbox >/tmp/fluxbox.log 2>&1 &
x11vnc -display "$DISPLAY" -forever -shared -rfbport "$VNC_PORT" -nopw >/tmp/x11vnc.log 2>&1 &
websockify --web=/usr/share/novnc/ "$NOVNC_PORT" "127.0.0.1:${VNC_PORT}" >/tmp/novnc.log 2>&1 &
socat TCP-LISTEN:"$CDP_PROXY_PORT",fork,reuseaddr TCP:127.0.0.1:9222 >/tmp/cdp-proxy.log 2>&1 &

exec pnpm start

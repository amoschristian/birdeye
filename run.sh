#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_PYTHON="$PROJECT_DIR/server/.venv/bin/python3"
VENV_UVICORN="$PROJECT_DIR/server/.venv/bin/uvicorn"

echo "=== Birdeye Launcher ==="

# Restart: gracefully stop existing service on port 9732
OLD_PID=$(lsof -ti :9732 2>/dev/null)
if [ -n "$OLD_PID" ]; then
  echo "Restarting existing service (PID $OLD_PID)..."
  kill $OLD_PID 2>/dev/null
  # Wait for it to shut down
  for i in $(seq 1 10); do
    if ! kill -0 $OLD_PID 2>/dev/null; then break; fi
    sleep 0.3
  done
fi

# ── Step 1: Build dashboard ──
echo "[1/2] Building dashboard..."
cd "$PROJECT_DIR/dashboard"
npm run build --silent
echo "  ✓ dashboard/dist/ ready"

# ── Step 2: Start server ──
echo "[2/2] Starting server (uvicorn on 0.0.0.0:9732)..."
cd "$PROJECT_DIR/server"

# Pass through display and session environment for wmctrl / D-Bus / ydotool
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-}"
export DISPLAY="${DISPLAY:-}"
export XDG_SESSION_TYPE="${XDG_SESSION_TYPE:-}"
export XDG_CURRENT_DESKTOP="${XDG_CURRENT_DESKTOP:-}"

if [ -x "$VENV_UVICORN" ]; then
  exec "$VENV_UVICORN" main:app --host 0.0.0.0 --port 9732
elif command -v uvicorn &>/dev/null; then
  exec uvicorn main:app --host 0.0.0.0 --port 9732
else
  echo "ERROR: uvicorn not found. Install it with:"
  echo "  cd server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi

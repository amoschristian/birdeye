# Birdeye

**Notification dashboard for your LAN** — a 1024×600 touchscreen companion that shows notifications from browser tabs and native desktop apps, system resources, and Spotify now-playing. All always visible, no tab switching.

```
┌───────────── 1024px ──────────────────────────────────────┐
│ BirdEye ●   │  CPU ██ 42%  RAM ██ 6.3/31  ↓12 ↑4.5      │  header 56px
├──────────────┬────────────────────────────────────────────┤
│  All apps    │  Active (3)    All (12)                    │
│  ─────────── │                                            │
│  💬 Discord  │  ┌──────────────────────────────────────┐  │
│  ✉️ G Chat   │  │ 💬 Discord · just now         ✓     │  │
│  📱 Telegram │  │ New message from Alice               │  │
│              │  └──────────────────────────────────────┘  │
│              │  ┌──────────────────────────────────────┐  │
│              │  │ 📱 Telegram · 2m ago          (read) │  │
│              │  │ New message in #general              │  │
│              │  └──────────────────────────────────────┘  │
├──────────────┴────────────────────────────────────────────┤
│ 🎵 [art]  Bohemian Rhapsody — Queen   ═══●═══  ▶️  ⏭    │  64px
└──────────────────────────────────────────────────────────┘
```

## Features

- **🔔 Notifications** — Browser tabs (Discord, Google Chat) via Chrome extension + native apps (Telegram) via D-Bus
- **📊 System monitor** — CPU, RAM, network I/O as compact header chips, updating every 2 seconds
- **🎵 Spotify** — Persistent bottom strip with album art, track info, progress bar, and play/pause/next controls
- **👆 Touch-first** — All interactive elements ≥ 44px, swipe-left to mark read, active-state feedback
- **🔊 Sound** — Notification chime on new notifications (plays `default.mp3`)
- **🎯 Focus** — Tap an app button to jump to the browser tab or native window (even across workspaces)
- **🗄️ Persistence** — Notifications stored in SQLite with 7-day retention, survives server restarts
- **🔌 Always-on** — Dashboard connects via WebSocket, reconnects automatically

## Architecture

```
Chrome Extension (MV3) ──┐
                          ├── WebSocket ──► FastAPI Server ──► Preact Dashboard
D-Bus (native apps) ─────┘                   port 9732          1024×600 touchscreen
```

The server is the hub. It aggregates notifications from the Chrome extension (browser tabs) and D-Bus (native desktop apps), polls system resources via `psutil`, listens to Spotify via MPRIS, and pushes everything to the dashboard over WebSocket.

## Prerequisites

- **Python 3.10+** with `python3-venv`
- **Node.js 18+** with npm
- **Chrome/Chromium** for the extension
- **Ubuntu/Debian** with GNOME (for D-Bus notifications and banner suppression)
- `wmctrl` (for native app window focusing): `sudo apt install wmctrl`
- `python3-dbus` (for D-Bus integration): `sudo apt install python3-dbus`
- GNOME desktop notifications (default on Ubuntu)

## Setup

```bash
# Clone
git clone git@github.com:your-org/birdeye.git
cd birdeye

# Python dependencies
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
deactivate

# Dashboard dependencies
cd ../dashboard
npm install

# Build dashboard
npm run build
cd ..
```

## Run

```bash
./run.sh
```

This builds the dashboard and starts the server on `http://0.0.0.0:9732`.

For development with hot-reload on the dashboard:

```bash
cd dashboard && npm run dev    # Terminal 1: Vite dev server
cd server && uvicorn main:app --host 0.0.0.0 --port 9732  # Terminal 2
```

## Chrome extension

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `extension/` directory
4. The extension connects to `ws://localhost:9732/ws/extension` automatically

## Dashboard

Open `http://<server-ip>:9732` on your touchscreen device (or any browser on the LAN). The dashboard auto-connects via WebSocket.

### Notification sound

Place a `default.mp3` file at `dashboard/public/sounds/default.mp3`. Any short (~500ms) notification chime works. Browser autoplay policy requires one user interaction before sounds play — the first tap on the dashboard unlocks audio.

## Supported apps

| App | Source | Badge detection | Focus |
|-----|--------|-----------------|-------|
| Discord | Browser tab | Title regex `(@N)` | Chrome tab focus |
| Google Chat | Browser tab | MutationObserver content script | Chrome tab focus |
| Telegram | Native (D-Bus) | D-Bus `Notify` signal | `wmctrl -x -a TelegramDesktop` |

To add more apps, see [AGENTS.md](AGENTS.md) — "Provider system" and `server/config.json`.

## Files

```
extension/       Chrome MV3 extension
server/          FastAPI + WebSocket server
dashboard/       Preact + Vite + Tailwind v4 dashboard
docs/            Design plans (all implemented)
run.sh           Build + start script
```

## Notes

- The dashboard is designed for **1024×600** resolution (7-inch touchscreens). It works on larger screens but won't scale gracefully.
- Server state is mostly in-memory. Tabs are lost on restart; notifications survive in SQLite.
- All three design plans in `docs/` are fully implemented.

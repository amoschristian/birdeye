# Birdeye

**Attention center for a 7-inch touchscreen** — notifications from browser tabs and native apps, todos, system resources, Spotify, and calendar events. All always visible on a dedicated secondary panel. No tab switching, no phone checking.

```
┌──────────────────────────────────────────────────────┐
│ 14:22  SUN 27 JUL  ● ONLINE   HOME/TODOS   WORKSP   │
├────────┬─────────────────────────────┬──────────────┤
│ CHAN-  │ ACTIVE/ALL     READ ALL    │ ● DO FIRST   │
│ NELS   │────────────────────────────│              │
│        │ DISCORD — general    2m    │ ☐ Fix login  │
│ [ALL]  │   Alice: "check this"      │ ☐ Deploy     │
│ [DISC] │                            │              │
│ [GCht] │ GOOGLE CHAT — team  12m    │              │
│ [TELE] │   Design review notes      │              │
├────────┴─────────────────────────────┴──────────────┤
│ ♪ Song — Artist                     CPU 42% RAM 65% │
└──────────────────────────────────────────────────────┘
```

## Features

- **🔔 Notifications** — Browser tabs (Discord, Google Chat, WhatsApp) via Chrome extension + native apps (Telegram, Discord) via D-Bus
- **✅ Todos** — Eisenhower matrix (Do First / Schedule / Decide / Eliminate) with drag-and-drop, priority tags, due dates, and natural language input. Do First items surface on the Home screen alongside notifications
- **📊 System monitor** — CPU and RAM gauges in the bottom bar, updating every 2 seconds with green/amber/red thresholds
- **🎵 Spotify** — Persistent bottom strip with album art, track info, progress bar, and transport controls
- **📅 Calendar** — Upcoming event ticker strip with now-playing and imminent event pins
- **👆 Touch-first** — All elements ≥ 44px, tap-to-complete todos, swipe-left to mark notifications read, active-state press feedback
- **🔊 Sound** — Notification chime on new notifications (plays `default.mp3`)
- **🎯 Focus** — Tap a notification to jump to the source browser tab or native window
- **🗄️ Persistence** — Notifications and todos stored in SQLite with 7-day retention

## Design

**Mission Control** aesthetic — deep navy backgrounds, amber telemetry values, cyan active states. Solid-lit status indicators. Large type scaled for arm's-length reading on a 7-inch panel. Zero glow, zero bloom, zero drop shadows. See `DESIGN.md` for full design system.

## Architecture

```
Chrome Extension (MV3) ──┐
                          ├── WebSocket ──► FastAPI Server ──► Preact Dashboard
D-Bus (native apps) ─────┘                   port 9732          1024×600 touchscreen
```

The server is the hub: aggregates notifications from the Chrome extension and D-Bus, polls system resources via `psutil`, listens to Spotify via MPRIS, reads calendar events via D-Bus, persists todos in SQLite, and pushes everything to the dashboard over WebSocket.

## Prerequisites

- **Python 3.10+** with `python3-venv`
- **Node.js 18+** with npm
- **Chrome/Chromium** for the extension
- **Ubuntu/Debian** with GNOME (for D-Bus notifications, banner suppression, and calendar)
- `wmctrl`: `sudo apt install wmctrl`
- `python3-dbus`: `sudo apt install python3-dbus`

## Quick start

```bash
git clone git@github.com:amoschristian/birdeye.git
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
npm run build
cd ..

# Run
./run.sh
```

Open `http://<server-ip>:9732` on your touchscreen. Load the Chrome extension from `extension/` unpacked.

## Chrome extension

1. Chrome → `chrome://extensions` → Developer mode → Load unpacked
2. Select the `extension/` directory
3. Connects to `ws://localhost:9732/ws/extension` automatically

## Supported apps

| App | Source | Focus method |
|-----|--------|-------------|
| Discord Work | Browser tab (title regex) | Extension tab focus |
| Google Chat | Browser tab (MutationObserver) | Extension tab focus |
| Calendar | D-Bus notifications | — (strip only) |
| Telegram | D-Bus notifications | `wmctrl` by window class |
| WhatsApp | Browser tab | Extension tab focus |
| Discord Personal | D-Bus notifications | `wmctrl` by window class |

## Files

```
extension/       Chrome MV3 extension
server/          FastAPI + WebSocket server
dashboard/       Preact + Vite + Tailwind v4 dashboard
DESIGN.md        Mission Control design system
PRODUCT.md       Product context and principles
docs/            Historical implementation plans
run.sh           Build + start script
```

## Notes

- Designed for **1024×600** at arm's length — not responsive to smaller/larger viewports
- Tab state is in-memory (lost on restart); notifications and todos survive in SQLite
- Server gracefully degrades: no D-Bus → extension-only; no Spotify → "AUDIO OFFLINE"
- No tests, no linter, no CI — personal tool, manual verification

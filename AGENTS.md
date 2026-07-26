# Birdeye

Notification dashboard for browser tabs and native desktop apps — Chrome extension (MV3) + FastAPI server + Preact dashboard.

## Architecture

```
                         ┌── D-Bus (native apps: Telegram, etc.)
                         ▼
Chrome Extension MV3 ──WebSocket──► FastAPI ◄──WebSocket── Preact Dashboard
     │                              port 9732                    (Vite + Tailwind v4)
     │                              in-memory tab state
     │                              SQLite notifications (7-day)
     │                              psutil monitor (2s poll)
     │                              Spotify MPRIS listener
     │                              serves dashboard/dist/
```

Server binds `0.0.0.0:9732`. Dashboard at `http://<ip>:9732` on LAN (1024×600 touchscreen target).

## Quick start

```
./run.sh   # builds dashboard + starts server
```

Or manually:

```
cd dashboard && npm run build     # must build BEFORE starting server
cd server && uvicorn main:app --host 0.0.0.0 --port 9732
```

Load the Chrome extension unpacked from `extension/`. Extension connects to `ws://localhost:9732/ws/extension`.

Vite dev server (`npm run dev` in dashboard/) proxies `/ws` and `/api` to `localhost:9732` — useful for local UI iteration.

## Commands

| Task | Command |
|------|---------|
| Build + start (one command) | `./run.sh` |
| Build dashboard | `cd dashboard && npm run build` |
| Dev dashboard (hot reload) | `cd dashboard && npm run dev` |
| Start server | `cd server && uvicorn main:app --host 0.0.0.0 --port 9732` |
| Type-check dashboard | `cd dashboard && npx tsc --noEmit` |
| Syntax-check Python | `cd server && python3 -c "import py_compile; py_compile.compile('state.py', doraise=True)"` |

There are **no tests, no linter, no CI**. Verification is manual.

## Stack quirks

- **Preact, not React** — import `h` from `'preact'`, hooks from `'preact/hooks'`. JSX pragma is `h`, configured in tsconfig.json (`jsxImportSource: "preact"`).
- **Pydantic v2** — use `.model_dump()`, not `.dict()`.
- **Tailwind v4** — uses `@tailwindcss/vite` plugin. No `tailwind.config.js` needed.
- **Chrome MV3 service worker** — `importScripts()` paths are relative to `background.js`, not the extension root. `chrome.alarms` is used for keepalive (survives worker termination); `setInterval` is dead after worker kill.
- **D-Bus threading** — `dbus-python` signal handlers run in a GLib thread, bridge to asyncio via `queue.Queue` → `asyncio.Queue`.
- **State** — Tab states are in-memory only (server restart loses them). Notifications are persisted in SQLite (7-day retention).

## File structure

```
extension/
├── manifest.json          # MV3, permissions: tabs,storage,scripting,alarms
├── background.js          # thin message router — wires lib modules together (+ focus_ack)
├── content.js             # ISOLATED-world bridge — forwards MAIN-world postMessage to extension
├── content-notif.js       # MAIN-world Notification API interceptor (all hosts, document_start)
├── content-gchat.js       # Google Chat MutationObserver (chat.google.com only, document_end)
└── lib/
    ├── websocket.js       # WebSocketClient — connect/reconnect/send/receive
    ├── tab-tracker.js     # TabTracker — event-driven tab registry (no polling)
    └── providers.js       # ProviderRegistry + discordProvider + googleChatProvider

server/
├── main.py                # FastAPI entry, lifespan, CORS, static files
├── ws.py                  # /ws/extension + /ws/dashboard — full protocol
├── state.py               # TabState model, in-memory dict, update/remove/get_all
├── wm.py                  # focus_browser() + focus_window_by_class()
├── config.json            # app registry with type/icon/windowClass fields
├── config_loader.py       # AppConfig dataclass + Config loader
├── db.py                  # SQLite persistence (notifications table, 7-day cleanup)
├── dbus_listener.py       # D-Bus notification listener thread (filters browsers)
├── monitor.py             # SystemMonitor — psutil CPU/RAM/Disk/Network polling (2s)
├── spotify.py             # SpotifyListener — MPRIS D-Bus track info + controls
├── notif_banner.py        # GNOME gsettings banner suppress/restore
└── requirements.txt       # fastapi, uvicorn, websockets, dbus-python, psutil

dashboard/
├── public/
│   ├── icons/             # app icons (discord.png, google-chat.png, telegram.png)
│   └── sounds/            # place default.mp3 here
├── src/
│   ├── App.tsx            # two-column layout: app filter sidebar + notification feed
│   ├── types.ts           # TabState, AppConfig, Notification, MonitorData, SpotifyState, protocol messages
│   ├── hooks/
│   │   ├── useWebSocket.ts  # state/apps/notifications/monitor/spotify + actions
│   │   └── useSound.ts      # notification chime player
│   └── components/
│       ├── AppButton.tsx     # touch-friendly app button with unread badge + filter
│       ├── NotificationCard.tsx  # swipeable notification card (pointer events)
│       ├── ConnectionStatus.tsx  # green/red dot
│       ├── ResourceBar.tsx   # CPU/RAM/Network inline chips (header)
│       └── SpotifyStrip.tsx  # persistent bottom mini-player
├── vite.config.ts         # proxies /ws and /api to localhost:9732
└── package.json           # preact, vite, tailwindcss v4

docs/
├── Major Overhaul.md                # Notification center transformation (Phase 1)
├── Expansion monitor and spotify.md # Monitor + Spotify widgets (Phase 2)
└── Layout Revision.md               # Inline resources + Spotify strip (Phase 3)
```

## Supported apps

| App | Type | Badge sourcing | Focus method |
|-----|------|---------------|--------------|
| Discord | browser | Title parse `(@N)` | Extension tab focus |
| Google Chat | browser | Content script MutationObserver | Extension tab focus |
| Telegram | native | D-Bus notifications | wmctrl by window class |

All three plans (`docs/`) are **fully implemented**.

## Provider system

Each platform is a provider object registered into `ProviderRegistry`. There are two badge sourcing modes:

| `badgeSource` | How badge count arrives | Example |
|---|---|---|
| `'title'` | TabTracker fires on title change → background calls `parseBadgeFromTitle()` | Discord |
| `'content-script'` | Content script sends `{type:'badge-update', appId, unread}` via `chrome.runtime.sendMessage()` | Google Chat |

To add a new app:
1. Define a provider object in `providers.js` with `id`, `name`, `urlPattern`, `badgeSource`, and `parseBadgeFromTitle()`
2. Register it in `background.js` via `registry.register(yourProvider)`
3. Add host permissions and content_script entry to `manifest.json`
4. If `badgeSource` is `'content-script'`, write a content script that detects badges and sends `{type:'badge-update', appId:'...', unread:N}` via `chrome.runtime.sendMessage()`
5. Add the app to `server/config.json` with `type`, `icon`, `windowClass`, `matchKeywords`

## WebSocket protocol

### Extension↔Server (unchanged from original)
Extension→Server messages: `{type, appId, appName, tabId, windowId, unread?, title?, body?}`
- `type: 'update'` — badge or title change
- `type: 'notification'` — intercepted `new Notification()` call
- `type: 'remove'` — tab closed/navigated away
- `type: 'ping'` — keepalive (every ~6s via chrome.alarms)

Server→Extension: `{type:'focus', tabId, windowId}` — triggered by dashboard focus click.
Extension→Server (ack): `{type:'focus_ack', tabId, success}`

### Dashboard↔Server
Dashboard→Server:
- `{action:'focus', appId}` — focus browser tab or native window
- `{action:'mark_read', id}` — mark notification as read
- `{action:'clear_read'}` — delete all read notifications
- `{action:'spotify', command:'play_pause'|'next'|'previous'}` — control Spotify

Server→Dashboard:
- `{type:'state', tabs, notifications, apps}` — full snapshot on connect
- `{type:'notification', notification:{id, app_id, app_name, summary, body, is_read, created_at}}` — new notification
- `{type:'notification_read', id}` — echo after mark_read
- `{type:'focus_ack', appId, success}` — focus result
- `{type:'monitor', cpu, ram, disk, net, ts}` — system resources (every 2s)
- `{type:'spotify', available, playing, title, artist, album, artUrl, duration, position}` — Spotify state

## D-Bus notification flow

1. `dbus_listener.py` subscribes to `org.freedesktop.Notifications.Notify` signal
2. Filters out browser-sourced notifications by checking `desktop-entry` hint
3. Matches remaining notifications to apps in `config.json` via `app_name` → windowClass → matchKeywords
4. Persists to SQLite and broadcasts to all dashboards
5. On startup, `notif_banner.py` runs `gsettings set show-banners false` to suppress native popups; restores on shutdown

## System monitor

`monitor.py` polls `psutil` every 2 seconds:
- CPU: `psutil.cpu_percent(interval=0)` (seeded once at startup)
- RAM: `psutil.virtual_memory()`
- Disk: `psutil.disk_usage('/')`
- Network: `psutil.net_io_counters()` delta from previous sample (↓/↑ rates)

Displayed as compact inline chips in the header bar (`ResourceBar.tsx`). Green/yellow/red thresholds at 60%/85%.

## Spotify

`spotify.py` listens to MPRIS D-Bus (`org.mpris.MediaPlayer2.spotify`):
- Tracks `PropertiesChanged` signal for playback state and metadata
- Provides `play_pause`, `next`, `previous` controls
- Handles Spotify not running (broadcasts `available: false`)
- Handles ad playback (minimal metadata)

Dashboard shows a persistent 64px bottom strip (`SpotifyStrip.tsx`) with album art thumbnail, track info, progress bar, and transport controls.

## Notes

- **MV3 world split**: `content-notif.js` runs in `MAIN` world at `document_start` — this is the only world that can intercept page-level `new Notification()` calls. It uses `window.postMessage` to bridge back to `content.js` which runs in `ISOLATED` world (the only world with `chrome.runtime.sendMessage` access). `content-gchat.js` runs at `document_end` (needs DOM body).
- Google Chat badge detection uses `document.body.innerText` with regex `/(\d+)\s*Notification/`. Fragile — if GChat DOM changes, update `content-gchat.js`.
- Focus for browser apps uses extension tab routing; for native apps uses `wmctrl -x -a <WM_CLASS>`. Requires `wmctrl` installed.
- Default branch is `release` (per repo convention).
- Server gracefully degrades: no D-Bus session → extension-only mode; no `gsettings` → banner suppression skipped; no Spotify → shows "not running".

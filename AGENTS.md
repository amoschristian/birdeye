# Birdeye

Attention center for a 7-inch secondary touchscreen — Chrome extension (MV3) + FastAPI server + Preact dashboard.

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
     │                              Calendar D-Bus listener
     │                              Todo SQLite persistence
     │                              serves dashboard/dist/
```

Server binds `0.0.0.0:9732`. Dashboard at `http://<ip>:9732` on LAN (1024×600 touchscreen target).

## Design system

**Mission Control** — navy/amber/cyan telemetry console aesthetic. Deep navy (`#0B1120`) backgrounds, amber (`#FFB800`) data values, cyan (`#00D4FF`) active states. Solid-lit status indicators (no glow, no bloom, no drop shadows). Large type scaled for arm's-length reading on a 7-inch panel (14px floor, 18-20px data, 32px clock). System mono for data, system sans for structure. See `DESIGN.md` for full token reference.

## Quick start

The server runs as a **systemd user service** (`birdeye.service`):

```
systemctl --user restart birdeye   # restart after changes
systemctl --user start birdeye     # start
systemctl --user stop birdeye      # stop
systemctl --user status birdeye    # check status
journalctl --user -u birdeye -f    # follow logs
```

Build the dashboard before restarting:

```
cd dashboard && npm run build
systemctl --user restart birdeye
```

**After every dashboard update**: rebuild and restart — `cd dashboard && npm run build`, then `systemctl --user restart birdeye`. The server serves the built `dist/`, so source changes are not live until rebuilt.

Or for development with hot reload:

```
cd dashboard && npm run dev        # Vite dev server on :5173, proxies /ws + /api to server
```

Load the Chrome extension unpacked from `extension/`. Extension connects to `ws://localhost:9732/ws/extension`.

Server unit: `~/.config/systemd/user/birdeye.service`.

## Commands

| Task | Command |
|------|---------|
| Build dashboard | `cd dashboard && npm run build` |
| Dev dashboard (hot reload) | `cd dashboard && npm run dev` |
| Restart service | `systemctl --user restart birdeye` |
| Follow logs | `journalctl --user -u birdeye -f` |
| Type-check dashboard | `cd dashboard && npx tsc --noEmit` |
| Syntax-check Python | `cd server && python3 -c "import py_compile; py_compile.compile('cal_listener.py', doraise=True)"` |

There are **no tests, no linter, no CI**. Verification is manual.

## Stack quirks

- **Preact, not React** — import `h` from `'preact'`, hooks from `'preact/hooks'`. JSX pragma is `h`, configured in tsconfig.json (`jsxImportSource: "preact"`).
- **Pydantic v2** — use `.model_dump()`, not `.dict()`.
- **Tailwind v4** — uses `@tailwindcss/vite` plugin. No `tailwind.config.js` needed.
- **Chrome MV3 service worker** — `importScripts()` paths are relative to `background.js`, not the extension root. `chrome.alarms` is used for keepalive (survives worker termination); `setInterval` is dead after worker kill.
- **D-Bus threading** — `dbus-python` signal handlers run in a GLib thread, bridge to asyncio via `queue.Queue` → `asyncio.Queue`.
- **State** — Tab states are in-memory only (server restart loses them). Notifications and todos are persisted in SQLite (7-day retention).

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
├── db.py                  # SQLite persistence (notifications + todos tables, 7-day cleanup)
├── dbus_listener.py       # D-Bus notification listener thread (filters browsers)
├── monitor.py             # SystemMonitor — psutil CPU/RAM/Disk/Network polling (2s)
├── spotify.py             # SpotifyListener — MPRIS D-Bus track info + controls
├── cal_listener.py        # CalendarListener — D-Bus calendar event listener
├── notif_banner.py        # GNOME gsettings banner suppress/restore
└── requirements.txt       # fastapi, uvicorn, websockets, dbus-python, psutil

dashboard/
├── public/
│   ├── icons/             # app icons (discord.png, google-chat.png, telegram.png, whatsapp.png)
│   └── sounds/            # place default.mp3 here
├── src/
│   ├── App.tsx            # main layout: status bar, channel sidebar, telemetry feed, DO FIRST panel, bottom bar
│   ├── types.ts           # TabState, AppConfig, Notification, MonitorData, SpotifyState, CalendarEvent, TodoItem
│   ├── style.css          # marquee animation, custom scrollbar
│   ├── hooks/
│   │   ├── useWebSocket.ts  # state/apps/notifications/todos/monitor/spotify/calendar + actions
│   │   └── useSound.ts      # notification chime player
│   ├── utils/
│   │   └── groupKey.ts      # notification grouping by app + sender
│   └── components/
│       ├── AppButton.tsx        # channel selector button with unread badge
│       ├── AppIcon.tsx          # app icon with image/emoji fallback
│       ├── BottomBar.tsx        # Spotify strip + CPU/RAM gauges
│       ├── CalendarStrip.tsx    # upcoming event marquee ticker
│       ├── Clock.tsx            # time (32px amber mono) + date
│       ├── ConnectionStatus.tsx # solid indicator + ONLINE/NO SIGNAL label
│       ├── NotificationCard.tsx # swipeable notification row with focus feedback
│       ├── NotificationGroup.tsx # grouped notifications with expand/collapse
│       └── TodoPage.tsx         # 2×2 Eisenhower matrix with drag-and-drop
├── vite.config.ts         # proxies /ws and /api to localhost:9732
└── package.json           # preact, vite, tailwindcss v4, sortablejs, lucide-preact

DESIGN.md                  # Mission Control design system — palette, typography, components, rules
PRODUCT.md                 # product context — users, purpose, constraints, principles
docs/                      # historical implementation plans (all fully implemented)
```

## Supported apps

| App | Type | Group | Badge sourcing | Focus method |
|-----|------|-------|---------------|--------------|
| Discord Work | browser | work | Title parse `(@N)` | Extension tab focus |
| Google Chat | browser | work | Content script MutationObserver | Extension tab focus |
| Calendar | native | work | D-Bus notifications | — (strip only) |
| Telegram | native | personal | D-Bus notifications | wmctrl by window class |
| WhatsApp | browser | personal | Title parse | Extension tab focus |
| Discord Personal | native | personal | D-Bus notifications | wmctrl by window class |

Calendar is hidden from the channel sidebar — upcoming events appear in the calendar ticker strip instead.

## Dashboard layout

```
┌──────────────────────────────────────────────────────┐
│ 14:22  SUN 27 JUL  ● ONLINE   HOME/TODOS   WORKSP   │ 56px status bar
├────────┬─────────────────────────────┬──────────────┤
│ CHAN-  │ ACTIVE/ALL  READ ALL/CLEAR  │ ● DO FIRST   │
│ NELS   │─────────────────────────────│              │
│ 88px   │ Notifications (full height) │ ☐ Fix login  │ 224px
│        │                             │ ☐ Deploy     │
│ [ALL]  │ DISCORD — general     2m    │              │
│ [DISC] │   Alice: "check this"       │              │
│ [GCht] │                             │              │
│ [TELE] │ GOOGLE CHAT — team   12m    │              │
│ [WHAT] │   Design review notes       │              │
├────────┴─────────────────────────────┴──────────────┤
│ ♪ Song — Artist                          CPU ██ RAM  │ 56px bottom bar
└──────────────────────────────────────────────────────┘
```

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
5. Add the app to `server/config.json` with `type`, `icon`, `windowClass`, `matchKeywords`, `group`

## WebSocket protocol

### Extension↔Server (unchanged from original)
Extension→Server messages: `{type, appId, appName, tabId, windowId, unread?, title?, body?}`
- `type: 'update'` — badge or title change
- `type: 'notification'` — intercepted `new Notification()` call
- `type: 'remove'` — tab closed/navigated away
- `type: 'ping'` — keepalive (every ~6s via chrome.alarms)

Server→Extension: `{type:'focus', tabId, windowId, appId}` — triggered by dashboard focus click.
Extension→Server (ack): `{type:'focus_ack', tabId, success}`

### Dashboard↔Server
Dashboard→Server:
- `{action:'focus', appId}` — focus browser tab or native window
- `{action:'mark_read', id}` — mark notification as read
- `{action:'mark_all_read', appId?}` — mark all unread as read (optionally per app)
- `{action:'clear_read'}` — delete all read notifications
- `{action:'spotify', command:'play_pause'|'next'|'previous'}` — control Spotify
- `{action:'switch_workspace', workspace}` — switch to numbered workspace
- `{action:'todo_add', text}` — add todo with natural language parsing
- `{action:'todo_toggle', id}` — toggle completion
- `{action:'todo_edit', id, text}` — edit todo text
- `{action:'todo_delete', id}` — delete todo
- `{action:'todo_priority', id, priority}` — set priority (high/medium/low)
- `{action:'todo_date', id, due_date}` — set due date
- `{action:'todo_reorder', id, order_index}` — reorder todo

Server→Dashboard:
- `{type:'state', tabs, notifications, apps}` — full snapshot on connect
- `{type:'notification', notification}` — new notification
- `{type:'notification_read', id}` — echo after mark_read
- `{type:'focus_ack', appId, success}` — focus result
- `{type:'monitor', cpu, ram, disk, net, ts}` — system resources (every 2s)
- `{type:'spotify', available, playing, title, artist, album, artUrl, duration, position}` — Spotify state
- `{type:'calendar', events}` — upcoming calendar events
- `{type:'todos', todos}` — todo list
- `{type:'workspace_ack', workspace, success}` — workspace switch result

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

Displayed as CPU/RAM gauges in the bottom bar. Green/amber/red thresholds at 60%/85%.

## Spotify

`spotify.py` listens to MPRIS D-Bus (`org.mpris.MediaPlayer2.spotify`):
- Tracks `PropertiesChanged` signal for playback state and metadata
- Provides `play_pause`, `next`, `previous` controls
- Handles Spotify not running (broadcasts `available: false`)
- Handles ad playback (minimal metadata)

Dashboard shows a persistent 56px bottom strip with album art, track info, progress bar, and transport controls.

## Calendar

`cal_listener.py` listens to D-Bus calendar notifications:
- Matches Evolution/GNOME Calendar alarm notifications
- Broadcasts upcoming events to dashboards
- Dashboard shows events in a conditional 24px marquee ticker strip below the status bar
- Now-playing and imminent events are pinned with amber/green status

## Todos

Todo items are persisted in SQLite with support for:
- Natural language parsing (priority tags, date recognition)
- Eisenhower matrix (2×2: Do First / Schedule / Decide / Eliminate)
- Drag-and-drop between quadrants (SortableJS)
- Priority cycling (H/M/L glyph)
- Due dates with quick-set picker (today/tomorrow/next week/custom)
- The "DO FIRST" quadrant (urgent + important) surfaces in the Home view's right panel

## Notes

- **MV3 world split**: `content-notif.js` runs in `MAIN` world at `document_start` — this is the only world that can intercept page-level `new Notification()` calls. It uses `window.postMessage` to bridge back to `content.js` which runs in `ISOLATED` world (the only world with `chrome.runtime.sendMessage` access). `content-gchat.js` runs at `document_end` (needs DOM body).
- Google Chat badge detection uses `document.body.innerText` with regex `/(\d+)\s*Notification/`. Fragile — if GChat DOM changes, update `content-gchat.js`.
- Focus for browser apps uses extension tab routing; for native apps uses `wmctrl -x -a <WM_CLASS>`. Requires `wmctrl` installed.
- Default branch is `main`.
- Server gracefully degrades: no D-Bus session → extension-only mode; no `gsettings` → banner suppression skipped; no Spotify → shows "AUDIO OFFLINE".
- Touch-only design: all interactive elements ≥ 44px, hover states replaced with `active:` press feedback, no keyboard shortcuts (this is a touchscreen panel, not a desktop app).

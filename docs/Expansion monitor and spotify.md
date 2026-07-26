# PLAN — Birdeye Monitor & Spotify Expansion

## Goal

Expand Birdeye from a notification center into a multi-function dashboard: Notifications + System Resource Monitor + Spotify Now Playing. All on a 7-inch 1024×600 touch screen, navigable via bottom tab bar.

## Status

implemented

---

## Architecture Overview

```
                    ┌──────────────────────────────────────┐
                    │           FastAPI Server             │
                    │                                      │
                    │  ws.py          (existing WS router) │
                    │  state.py       (existing tab state) │
                    │  db.py          (existing SQLite)    │
                    │  dbus_listener.py (existing notifs)  │
                    │  monitor.py     ★ NEW — psutil poll  │
                    │  spotify.py     ★ NEW — MPRIS listen │
                    └──────┬───────────────────────────────┘
                           │  WebSocket (port 9732)
              ┌────────────┴────────────┐
              ▼                         ▼
     Chrome Extension          Preact Dashboard (1024×600)
     (unchanged)               ┌──────────────────────────┐
                               │  Header (48px)           │
                               ├──────────────────────────┤
                               │                          │
                               │  Tab Content Area        │
                               │  (~540px tall)           │
                               │                          │
                               ├──────────────────────────┤
                               │  Bottom Tab Bar (~56px)  │
                               │  🔔 Notif │ 📊 Monitor  │
                               │           │ 🎵 Spotify   │
                               └──────────────────────────┘
```

---

## Step 1 — Bottom Tab Navigation (Dashboard)

### Goal
Replace the single-view layout with a tabbed layout: Notifications, Monitor, Spotify. The existing notification view stays intact as one tab.

### Status
implemented

### Files created
- `dashboard/src/components/TabBar.tsx`

### Files changed
- `dashboard/src/App.tsx` — added tab state, conditional rendering, bottom tab bar

### Explanation
- **Bottom tab bar**: 3 icon+label buttons, ~56px tall. Touch-friendly (mobile pattern). Uses the same Tokyo Night color scheme (`#1a1b26` bg, `#7aa2f7` active, `#565f89` inactive).
- **Tab state**: `useState<'notifications' | 'monitor' | 'spotify'>` in App.tsx.
- **Existing views unchanged**: The current notification two-column layout (sidebar + feed) renders only when `tab === 'notifications'`. No refactoring needed — just wrap it in a conditional.
- **Empty states**: Each new tab needs a loading/empty state for when no data has arrived yet.

### Files to change
- `dashboard/src/App.tsx` — add tab state, conditional rendering, bottom tab bar
- `dashboard/src/components/AppButton.tsx` — unchanged
- `dashboard/src/components/NotificationCard.tsx` — unchanged

### Files to create
- None for this step (new components come in later steps)

### Edge cases
- Tab bar must not clip content; subtract 48px header + 56px tabs from 600px = ~496px usable. Leave some breathing room.
- Active tab state is local (not persisted). Reset to 'notifications' on page reload — acceptable, no localStorage needed for now.
- Touch targets: each tab button should be at least 44×44px (accessibility minimum).

---

## Step 2 — System Resource Monitor (Server)

### Goal
Poll system resources via `psutil` every 2 seconds and broadcast to dashboard clients via the existing WebSocket.

### Status
implemented

### Files created
- `server/monitor.py` — `SystemMonitor` class with singleton `system_monitor`

### Explanation

**Data collected:**
- CPU: usage percent (overall)
- RAM: used, total, percent
- Disk: used, total, percent (root partition `/`)
- Timestamp: for the dashboard to show "last updated"

**Polling strategy:**
- Use `asyncio.create_task` in the lifespan, similar to the D-Bus bridge task.
- `asyncio.sleep(2)` loop — psutil calls are fast, no thread needed.
- `psutil.cpu_percent()` needs at least one previous sample to return meaningful data. Call it once with `interval=None` on startup to seed, then `interval=0` (non-blocking) in the loop.
- `psutil.virtual_memory()` and `psutil.disk_usage('/')` are instantaneous.

**WS protocol:**
- New message type: `{type: "monitor", cpu: float, ram: {used, total, percent}, disk: {used, total, percent}, ts: float}`
- Broadcast to all dashboard connections (reuse `_broadcast` from ws.py).
- Only broadcast if at least one dashboard is connected (skip work when nobody's watching).

### Files to create
- `server/monitor.py` — `SystemMonitor` class with `start()`, `stop()`, `get_snapshot()`

### Files to change
- `server/main.py` — start monitor in lifespan, import monitor module
- `server/ws.py` — add `broadcast_monitor()` helper

### Edge cases
- `/` disk might not be the only relevant one, but it's the simplest start. Future: make configurable.
- `psutil.cpu_percent(interval=0)` returns 0.0 on first call after startup; send a `null` or omit cpu on the first push, or seed with `percpu=False, interval=0.1` on init.
- Network I/O adds complexity and visual noise — skip for Phase 1.
- If psutil is somehow missing, fail gracefully at import with a log warning, monitor tab shows "unavailable".

---

## Step 3 — System Resource Monitor (Dashboard)

### Goal
Render CPU, RAM, and Disk as visual gauges/cards in the Monitor tab.

### Status
implemented

### Files created
- `dashboard/src/components/MonitorPanel.tsx`
- `dashboard/src/components/MetricCard.tsx`

### Explanation

**Layout (1024 × ~496px):**
```
┌─────────────────────────────────────────────┐
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │   CPU    │  │   RAM    │  │   DISK   │  │
│  │  42%     │  │  6.3 GB  │  │  157 GB  │  │
│  │  ██░░░░  │  │  ██░░░░  │  │  █████░  │  │
│  │          │  │ /31.2 GB │  │ /232 GB  │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                             │
│  Updated 2s ago                            │
└─────────────────────────────────────────────┘
```

**Each metric card:**
- Icon + label (CPU / RAM / Disk)
- Percentage as a large number
- Progress bar (colored: green → yellow → red at thresholds)
- Absolute values (used/total) where applicable
- No external charting library — simple div-based bars with Tailwind

**Threshold colors (Tokyo Night inspired):**
- < 60%: `#9ece6a` (green)
- 60-85%: `#e0af68` (yellow)
- > 85%: `#f7768e` (red)

### Files to create
- `dashboard/src/components/MonitorPanel.tsx`
- `dashboard/src/components/MetricCard.tsx`

### Files to change
- `dashboard/src/hooks/useWebSocket.ts` — add `monitorData` state, handle `monitor` message type
- `dashboard/src/types.ts` — add `ServerMonitorMessage`, `MonitorData` types
- `dashboard/src/App.tsx` — render `<MonitorPanel>` in monitor tab

### Edge cases
- **Loading**: Before first data arrives, show skeleton/pulse placeholders.
- **Stale data**: If no update for >10s, show "disconnected" overlay on the monitor panel.
- **Small numbers**: Percentages are always readable at large font sizes. Absolute values use `toFixed(1)` GB.
- **Overflow**: Values like RAM in MB won't fit nicely; always display in GB with one decimal.

---

## Step 4 — Spotify MPRIS Listener (Server)

### Goal
Listen to Spotify's MPRIS D-Bus interface for playback state and metadata changes. Broadcast to dashboard. Accept control commands (play/pause, next, previous) from dashboard.

### Status
implemented

### Files created
- `server/spotify.py` — `SpotifyListener` class with singleton `spotify_listener`

### Explanation

**MPRIS interface:**
- Service: `org.mpris.MediaPlayer2.spotify`
- Object path: `/org/mpris/MediaPlayer2`
- Player interface: `org.mpris.MediaPlayer2.Player`
- Signal: `PropertiesChanged` on the Player interface — fires on track change, play/pause, seek, volume

**Data extracted from Metadata dict:**
| MPRIS key | Field | Example |
|-----------|-------|---------|
| `xesam:title` | title | "Bohemian Rhapsody" |
| `xesam:artist` | artist (string[]) | ["Queen"] |
| `xesam:album` | album | "A Night at the Opera" |
| `mpris:artUrl` | artUrl | `https://i.scdn.co/image/...` |
| `mpris:length` | duration (μs) | 354000000 |
| — | position (μs) | from `Get('Position')` |
| `PlaybackStatus` | playing | "Playing" / "Paused" / "Stopped" |

**Implementation approach:**
- Reuse `dbus-python` (already in requirements.txt, already used by `dbus_listener.py`).
- Subscribe to the `PropertiesChanged` signal on `org.mpris.MediaPlayer2.Player`.
- On signal: extract Metadata and PlaybackStatus, broadcast via WS.
- Also do an initial poll when dashboard connects (call `GetAll` on the Player interface) so the dashboard has immediate state.
- Handle Spotify not running: gracefully report "Spotify not available".

**Control commands from dashboard:**
- Dashboard sends: `{action: "spotify", command: "play_pause" | "next" | "previous"}`
- Server calls: `org.mpris.MediaPlayer2.Player.PlayPause`, `.Next`, `.Previous` via D-Bus

**WS protocol — server→dashboard:**
```json
{
  "type": "spotify",
  "available": true,
  "playing": true,
  "title": "Bohemian Rhapsody",
  "artist": "Queen",
  "album": "A Night at the Opera",
  "artUrl": "https://i.scdn.co/image/ab67616d0000b273...",
  "duration": 354000,
  "position": 127000
}
```

**WS protocol — dashboard→server:**
```json
{
  "action": "spotify",
  "command": "play_pause"
}
```

### Files to create
- `server/spotify.py` — `SpotifyListener` class with D-Bus signal subscription, initial state fetch, control methods, async generator or callback pattern

### Files to change
- `server/main.py` — start spotify listener in lifespan
- `server/ws.py` — add `broadcast_spotify()`, handle `spotify` action from dashboard

### Edge cases
- **Spotify not running**: Listener starts, detects no `org.mpris.MediaPlayer2.spotify` on bus. Broadcast `{type: "spotify", available: false}`. Dashboard shows "Spotify not running" state.
- **Spotify starts later**: Listen for `NameOwnerChanged` on D-Bus to detect when Spotify appears.
- **Spotify quits**: Same signal in reverse. Broadcast `available: false`.
- **Ads**: During ads, Metadata fields are mostly empty (title may say ad text, album="" , artUrl=""). Don't treat as error — just render what we get. Dashboard can show "Ad playing" or simply show the (potentially blank) data.
- **Multiple MPRIS players**: If other media players exist, always target `spotify` specifically by service name. Don't try to be a generic MPRIS controller.
- **D-Bus threading**: `dbus-python`'s signal handling can block. Use `asyncio` event loop integration (same pattern as `dbus_listener.py`).

---

## Step 5 — Spotify Player (Dashboard)

### Goal
Render now-playing card with album art, track info, and transport controls in the Spotify tab.

### Status
implemented

### Files created
- `dashboard/src/components/SpotifyPanel.tsx`

### Explanation

**Layout (1024 × ~496px):**
```
┌─────────────────────────────────────────┐
│                                         │
│        ┌───────────────────┐            │
│        │                   │            │
│        │   Album Art       │            │
│        │   280×280         │            │
│        │                   │            │
│        └───────────────────┘            │
│                                         │
│        Bohemian Rhapsody                │
│        Queen — A Night at the Opera     │
│                                         │
│        ─────────●──────────  2:07/3:54  │
│                                         │
│        ⏮     ▶️/⏸     ⏭               │
│                                         │
└─────────────────────────────────────────┘
```

**Component tree:**
- `<SpotifyPanel>` — top-level for the tab
  - `<AlbumArt>` — `<img>` with fallback placeholder when no art
  - `<TrackInfo>` — title, artist, album text
  - `<ProgressBar>` — position/duration bar, read-only (no seek for now)
  - `<TransportControls>` — prev, play/pause, next buttons

**States:**
| State | What shows |
|-------|------------|
| **Loading / connecting** | Skeleton pulse on art + text |
| **Spotify not running** | Icon + "Spotify not running" message + no controls |
| **Playing** | Full art, info, progress, active controls |
| **Paused** | Same as playing but pause icon shown, progress static |
| **Ad playing** | Whatever Spotify gives us — likely blank art, ad title. Show "Advertisement" subtitle. No progress bar (ads don't report meaningful duration). |
| **No track** | "Nothing playing" placeholder |

**Touch-friendly controls:**
- Buttons must be ≥48×48px for finger taps
- Play/pause is the largest, centered
- Prev/next flank it

### Files to create
- `dashboard/src/components/SpotifyPanel.tsx`
- Utility for formatting duration (μs → "2:07")

### Files to change
- `dashboard/src/hooks/useWebSocket.ts` — add `spotifyData` state, handle `spotify` message, add `spotifyCommand()` action
- `dashboard/src/types.ts` — add `ServerSpotifyMessage`, `SpotifyState`, `ClientSpotifyAction` types
- `dashboard/src/App.tsx` — render `<SpotifyPanel>` in spotify tab

### Edge cases
- **Album art URL can be empty** (ads, or track without art). Show a default music note icon as fallback.
- **Artist is an array** (MPRIS `xesam:artist` is always `as` — array of strings). Join with ", ".
- **Long titles**: Use `truncate` with CSS `text-overflow: ellipsis`, or marquee for very long ones.
- **Position updates**: MPRIS emits `PropertiesChanged` for `Position` updates roughly every second while playing. We can also poll with `Get('Position')` every 1s from the server, but prefer signal-driven approach to reduce traffic. If position signal is unreliable, fall back to 1s polling when playing.
- **No seek for now**: The progress bar is display-only. Seeking requires `Set('Position', ...)` which is complex on touch screens. Add later if needed.

---

## Step 6 — Integration & Polish

### Goal
Wire everything together, test, and handle edge cases across tabs.

### Status
implemented

### Changes
- `server/ws.py` — imports monitor/spotify, `broadcast_monitor()`, `broadcast_spotify()`, handles `spotify` action, sends initial state on connect
- `server/main.py` — starts monitor/spotify in lifespan, bridge tasks broadcast updates
- `dashboard/src/hooks/useWebSocket.ts` — `monitorData`, `spotifyData` state, `spotifyCommand()` action
- `dashboard/src/types.ts` — all new types for monitor and spotify
- `dashboard/src/App.tsx` — tab routing with TabBar

### Explanation

**WebSocket hook changes:**
- `useWebSocket` currently handles `state`, `notification`, `notification_read`, `focus_ack`. Need to add handlers for `monitor` and `spotify`.
- Each new data type gets its own `useState` — no mega state object.
- The hook return expands: `{apps, tabs, notifications, monitorData, spotifyData, connected, markRead, clearRead, spotifyCommand}`

**Initial state snapshot:**
- When a dashboard connects, `broadcast_state()` currently sends tabs + notifications + apps.
- Extend it to also include latest `monitor` snapshot and `spotify` state, so the dashboard doesn't start blank.
- `ws.py` will call `monitor.get_snapshot()` and `spotify.get_state()` on connect.

**Performance:**
- Monitor polling (2s) and Spotify position updates (1s when playing) are low-traffic. The WS already handles this fine.
- The Chrome extension WS connection is unaffected — these new message types only go to dashboard connections.

### Files to change
- `server/ws.py` — wire monitor/spotify broadcasts, handle control actions, extend initial state
- `server/main.py` — integrate monitor and spotify into lifespan
- `dashboard/src/hooks/useWebSocket.ts` — new handlers and return values
- `dashboard/src/types.ts` — all new types
- `dashboard/src/App.tsx` — tab routing

---

## Summary of new files

```
server/
├── monitor.py          ★ NEW — psutil polling, SystemMonitor class
└── spotify.py          ★ NEW — MPRIS D-Bus listener, SpotifyListener class

dashboard/src/
├── components/
│   ├── MonitorPanel.tsx    ★ NEW — resource monitor tab content
│   ├── MetricCard.tsx      ★ NEW — single metric gauge/card
│   ├── SpotifyPanel.tsx    ★ NEW — now-playing tab content
│   └── TabBar.tsx          ★ NEW — bottom tab navigation
└── (App.tsx, types.ts, useWebSocket.ts modified)
```

## What does NOT change

- Chrome Extension — zero changes
- `state.py`, `db.py`, `dbus_listener.py` — zero changes
- `config.json`, `config_loader.py` — zero changes
- Existing Dashboard components (`AppButton`, `NotificationCard`, `ConnectionStatus`, `AppIcon`) — zero or minimal changes
- Build pipeline, startup order — unchanged

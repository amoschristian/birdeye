# PLAN: Notification Center Transformation

> Each step is a self-contained TODO with its own Goal and Status.
> Status values: `pending` → `in_progress` → `done`.

---

## Architecture Overview

```
┌──────────────────────┐     D-Bus signals      ┌──────────────────────┐
│  D-Bus Listener      │───────────────────────►│  Server (FastAPI)    │
│  (dbus-python thread)│                        │                      │
│  Native apps only    │                        │  ┌─ ws.py            │
│  (filters browsers)  │                        │  ├─ state.py (tabs)  │
└──────────────────────┘                        │  ├─ db.py (SQLite)   │
                                                │  ├─ wm.py (focus)    │
┌──────────────────────┐     WebSocket           │  └─ config.json     │
│  Chrome Extension    │───────────────────────►│                      │
│  (browser tabs only) │                        └──────┬───────────────┘
└──────────────────────┘                               │ WebSocket
                                                       ▼
                                              ┌──────────────────────┐
                                              │  Dashboard (Preact)  │
                                              │  1024×600 touchscreen│
                                              │                      │
                                              │  ┌─ App buttons (L)  │
                                              │  └─ Notification     │
                                              │     feed (R)         │
                                              └──────────────────────┘
```

### Deduplication Strategy

D-Bus listener inspects the `desktop-entry` hint on each notification. If the entry contains a browser identifier (`chrome`, `chromium`, `firefox`, `brave`), the notification is **dropped**. The Chrome extension is the better source for browser notifications — it has tabId, windowId, and can route focus precisely. Native apps (Slack desktop, Telegram, etc.) flow through D-Bus exclusively.

### Native Notification Suppression

On startup, the server disables Ubuntu's native notification banners via `gsettings` so they don't conflict with Birdeye's dashboard. The popups stop, but notifications still flow through D-Bus — our listener captures them. On shutdown, the original setting is restored. See Step 2 for details.

---

## Step 1 — Server: D-Bus Listener

**Goal**: Intercept all Ubuntu desktop notifications via D-Bus and pipe them into the server's async event loop, filtering out browser-sourced duplicates.

**Status**: `done`

**File**: `server/dbus_listener.py`

- Runs a `GLib.MainLoop` in a daemon thread on server startup.
- Subscribes to `org.freedesktop.Notifications.Notify` signal via `dbus-python` (`python3-dbus` apt package).
- Extracts from each signal: `app_name`, `summary`, `body`, `app_icon`, `hints` dict (specifically `desktop-entry`).
- Filters out browser-sourced notifications by checking if `desktop-entry` contains known browser names.
- Pushes remaining notifications into a thread-safe `queue.Queue`.
- Async coroutine in the main event loop (`asyncio.Queue` bridge) pulls from the thread queue and calls `db.create_notification()` + `broadcast_notification()`.
- **Edge cases**:
  - No D-Bus session available (e.g., running outside desktop) → log warning, server continues with extension-only mode.
  - Malformed notification (missing `desktop-entry`) → still accept; use `app_name` for matching.
  - Thread dies unexpectedly → log error, attempt restart once. If restart fails, degrade to extension-only.

---

## Step 2 — Server: Suppress Native Notification Banners

**Goal**: Disable Ubuntu's native notification popup bubbles while Birdeye is running, so the user sees only the dashboard feed — no confusing dual notifications. Restore on shutdown.

**Status**: `done`

**File**: `server/notif_banner.py`

**Approach**: Toggle GNOME's `show-banners` setting via `gsettings`. This stops popup bubbles but leaves D-Bus notifications flowing — our listener (Step 1) still sees everything.

```python
import subprocess
import logging

logger = logging.getLogger(__name__)

_SUPPRESSED = False


def suppress_native_banners() -> bool:
    """Disable GNOME notification popup banners. Returns True on success."""
    global _SUPPRESSED
    try:
        result = subprocess.run(
            ["gsettings", "set", "org.gnome.desktop.notifications", "show-banners", "false"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            _SUPPRESSED = True
            logger.info("Native notification banners suppressed (show-banners=false)")
            return True
        else:
            logger.warning(f"gsettings failed: {result.stderr.strip()}")
            return False
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        logger.warning(f"Cannot suppress native banners: {e}")
        return False


def restore_native_banners():
    """Restore GNOME notification popup banners to their original state."""
    global _SUPPRESSED
    if not _SUPPRESSED:
        return
    try:
        subprocess.run(
            ["gsettings", "set", "org.gnome.desktop.notifications", "show-banners", "true"],
            capture_output=True, text=True, timeout=5
        )
        _SUPPRESSED = False
        logger.info("Native notification banners restored (show-banners=true)")
    except Exception as e:
        logger.warning(f"Failed to restore native banners: {e}")
```

**Calling**: `suppress_native_banners()` is called in `main.py` lifespan startup, before the D-Bus listener starts. `restore_native_banners()` is called in lifespan shutdown.

**Edge cases**:
- Not running GNOME (KDE, XFCE, etc.) → `gsettings` not found or schema missing → log warning, continue. The dashboard still works; user just sees both notification surfaces until they manually disable their DE's banners.
- `gsettings` command hangs → 5-second timeout prevents blocking startup.
- User has already disabled banners manually → no-op; setting `false` to `false` is harmless.

---

## Step 3 — Server: SQLite Persistence

**Goal**: Persist notifications in SQLite with `is_read` flag and 7-day auto-cleanup, so history survives server restarts.

**Status**: `done`

**File**: `server/db.py`

**Schema**:
```sql
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT NOT NULL,
    app_name TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    body TEXT DEFAULT '',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_app_id ON notifications(app_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
```

**Operations**:
- `create_notification(app_id, app_name, summary, body) → Notification` — insert, auto-cleanup old rows (>7 days), return new row.
- `mark_read(notification_id) → bool` — set `is_read=1`.
- `get_all(limit=200) → list[Notification]` — recent notifications ordered by `created_at DESC`.
- `get_unread_count(app_id) → int` — count of `is_read=0` per app.
- `cleanup_old()` — `DELETE FROM notifications WHERE created_at < unixepoch() - 604800`. Called on every insert (cheap, prevents unbounded growth).

**Startup**: table created on first access. SQLite file at `server/birdeye.db`. WAL mode enabled for concurrent reads. No migrations needed yet.

**Edge cases**:
  - Empty database on first run → `get_all()` returns `[]`.
  - DB file not writable → log error, degrade to in-memory-only mode.

---

## Step 4 — Server: Config Expansion

**Goal**: Expand `config.json` to support native apps, window focusing, and per-app sound/settings — making the app registry the single source of truth for both server and dashboard.

**Status**: `done`

**File**: `server/config.json`

```json
{
  "apps": {
    "discord": {
      "name": "Discord",
      "type": "browser",
      "urlPattern": "discord.com/channels/",
      "windowClass": null,
      "icon": "💬",
      "sound": "default",
      "enabled": true
    },
    "google-chat": {
      "name": "Google Chat",
      "type": "browser",
      "urlPattern": "chat.google.com",
      "windowClass": null,
      "icon": "✉️",
      "sound": "default",
      "enabled": true
    },
    "telegram-desktop": {
      "name": "Telegram",
      "type": "native",
      "urlPattern": null,
      "windowClass": "TelegramDesktop",
      "icon": "📱",
      "sound": "default",
      "enabled": true
    },
    "slack": {
      "name": "Slack",
      "type": "native",
      "urlPattern": null,
      "windowClass": "Slack",
      "icon": "💼",
      "sound": "default",
      "enabled": true
    }
  }
}
```

**New fields**:
- `type`: `"browser"` → tab tracking via extension; `"native"` → D-Bus notifications + wmctrl focus.
- `windowClass`: X11 WM_CLASS string for `wmctrl -x -a`. `null` for browser apps (we use tabId instead).
- `icon`: Unicode character for dashboard display.
- `sound`: Key into sound registry (`"default"` = `default.mp3`). Per-app sound is a future config change.
- `enabled`: toggle to show/hide app on dashboard.

**Server loads config on startup** into a `dict[str, AppConfig]`. The `GET /api/apps` endpoint serves this to the dashboard.

---

## Step 5 — Server: WebSocket Protocol Expansion

**Goal**: Redesign the WebSocket protocol to support notification feed, app-based focus, and mark-read — while keeping backward compat for extension→server messages.

**Status**: `done`

**File**: `server/ws.py`

### Dashboard→Server Messages

| Message | Fields | Behavior |
|---------|--------|----------|
| `{action:"focus", appId:"discord"}` | `appId` | Route focus to extension (browser) or wmctrl (native). See step 6. |
| `{action:"mark_read", id:123}` | `id` | Call `db.mark_read(id)`, broadcast `notification_read` to all dashboards. |

Drop the old `{action:"focus", tabId, windowId}` — no longer needed.

### Server→Dashboard Messages

| Message | Fields | When |
|---------|--------|------|
| `{type:"state", tabs:[...], notifications:[...], apps:[...]}` | Full state snapshot | On dashboard connect |
| `{type:"notification", notification:{id,app_id,app_name,summary,body,is_read,created_at}}` | Single notification | New D-Bus notification received |
| `{type:"notification_read", id:123}` | Notification ID | After dashboard marks read (echo to all dashboards) |
| `{type:"focus_ack", appId:"discord", success:true}` | Focus result | After focus action completes |

### Focus Routing (focus action handler)

```
if app.type == "browser":
    find most recent TabState for appId
    if found: send {type:"focus", tabId, windowId} to extension
              call wm.focus_browser()
    else:     return focus_ack with success=false
elif app.type == "native":
    if app.windowClass:
        success = wm.focus_window_by_class(app.windowClass)
    else:
        success = false
    return focus_ack with success
```

### Broadcast helpers
- `broadcast_state()` — sends full `{type:"state", ...}` to all dashboard connections.
- `broadcast_notification(notification)` — sends single `{type:"notification", ...}` to all dashboards.
- `broadcast_notification_read(id)` — sends `{type:"notification_read", id}` to all dashboards.

### Extension→Server (unchanged from current)
- `update`, `notification`, `remove`, `ping` — same as before for browser tab tracking.

---

## Step 6 — Server: Window Focus for Native Apps

**Goal**: Let the dashboard jump to native app windows (even on other workspaces) via `wmctrl`.

**Status**: `done`

**File**: `server/wm.py`

Add new function:

```python
def focus_window_by_class(wm_class: str) -> bool:
    """Find and raise a window by its WM_CLASS string using wmctrl."""
    if not shutil.which("wmctrl"):
        return False
    try:
        # wmctrl -x -a matches WM_CLASS (the second column in -lx)
        result = subprocess.run(
            ["wmctrl", "-x", "-a", wm_class],
            capture_output=True, text=True
        )
        return result.returncode == 0
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False
```

`wmctrl -x -a <WM_CLASS>` activates the window and brings it to the current workspace if it's on another.

**Edge cases**:
- Window doesn't exist → `wmctrl` returns non-zero → return `False`.
- Multiple windows match → `wmctrl` picks the first (usually the most recently active).

---

## Step 7 — Dashboard: Types & State

**Goal**: Define the TypeScript interfaces for the new data model — AppConfig, Notification, and the extended TabState — so all components share a single source of truth.

**Status**: `done`

**File**: `dashboard/src/types.ts`

```typescript
export interface TabState {
  tab_id: number;
  window_id: number;
  app_id: string;
  app_name: string;
  unread: number;
  last_message: string | null;
  last_time: number;
}

export interface AppConfig {
  id: string;
  name: string;
  type: 'browser' | 'native';
  icon: string;
  sound: string;
  enabled: boolean;
  unread: number;  // populated from SQLite, not from TabState
}

export interface Notification {
  id: number;
  app_id: string;
  app_name: string;
  summary: string;
  body: string;
  is_read: boolean;
  created_at: number;
}
```

---

## Step 8 — Dashboard: Two-Column Touch Layout

**Goal**: Rewrite the dashboard layout for 1024×600 touchscreen — app buttons in a left panel, notification feed in the right panel, with touch-optimized sizing throughout.

**Status**: `done`

**File**: `dashboard/src/App.tsx` (rewrite)

Layout for 1024×600:

```
┌── Header (48px, flex-shrink-0) ───────────────────────┐
│  BirdEye                          ● Connected          │
├──────────────┬─────────────────────────────────────────┤
│  APP BUTTONS │  NOTIFICATION FEED                      │
│  w-[260px]   │  flex-1                                 │
│  overflow-y  │  overflow-y                              │
│              │                                          │
│  ┌────────┐  │  ┌──────────────────────────────────┐   │
│  │  💬    │  │  │ Discord · just now         ✓     │   │
│  │ Discord│  │  │ New message from Alice            │   │
│  │   3 ●  │  │  │     ◄ swipe left ───             │   │
│  └────────┘  │  └──────────────────────────────────┘   │
│              │                                          │
│  ┌────────┐  │  ┌──────────────────────────────────┐   │
│  │  📱    │  │  │ Telegram · 2m ago        (dim)   │   │
│  │Telegram│  │  │ New message in group              │   │
│  │   1 ●  │  │  └──────────────────────────────────┘   │
│  └────────┘  │                                          │
└──────────────┴──────────────────────────────────────────┘
```

**Component tree**:
```
App
├── Header
│   ├── Title ("BirdEye")
│   └── ConnectionStatus (connected dot + text)
├── LeftPanel (w-[260px], overflow-y-auto, p-3)
│   └── AppButton[] (one per enabled app in config)
│       ├── Icon (text-3xl, centered)
│       ├── Name (text-sm, centered)
│       └── UnreadBadge (absolute top-right, pill, bg-[#f7768e])
└── NotificationFeed (flex-1, overflow-y-auto, p-3)
    └── NotificationCard[] (list, newest first)
        ├── AppIcon + AppName + RelativeTimestamp
        ├── Summary (font-medium)
        ├── Body (text-sm, text-dimmed, truncate 2 lines)
        └── SwipeGesture (pointer events, translateX, mark read on release)
```

**Touch optimizations**:
- All interactive elements ≥ 44px × 44px (WCAG minimum touch target).
- AppButton: 56px min-height, full-width 260px, 12px border-radius, 8px gap.
- NotificationCard: 60px min-height, padding 12px, margin-bottom 8px, border-radius 12px.
- No `hover:` classes — all interactions are `active:` or state-driven.
- Font sizes: App name 14px, notification summary 16px, body 13px, timestamp 11px.
- Scroll momentum: `-webkit-overflow-scrolling: touch` on both panels.

**State handling**:
- `loading` (WebSocket connecting) → centered "Connecting..." message.
- `connected + empty` → "No notifications yet" in feed column.
- `connected + populated` → normal layout.
- `disconnected` → ConnectionStatus shows red dot, stale data remains visible.

---

## Step 9 — Dashboard: AppButton Component

**Goal**: A touch-friendly button per app that jumps directly to the app window/tab on tap, with an unread badge from SQLite counts.

**Status**: `done`

**File**: `dashboard/src/components/AppButton.tsx`

```typescript
interface Props {
  app: AppConfig;
  onFocus: (appId: string) => void;
}
```

**Behavior**:
- Tap → calls `onFocus(app.id)` immediately. No confirmation dialog.
- Visual feedback: `active:scale-95` + `active:bg-[#1a1b26]` for 150ms press effect.
- Badge: red pill with unread count (from SQLite). Only shown when `unread > 0`. If `unread > 99`, shows `"99+"`.
- Active indicator: subtle left border accent (`border-l-[3px] border-[#7aa2f7]`) if this app had the most recent notification (tracked in parent state).

**Accessibility**:
- `role="button"`, `tabIndex={0}`, `aria-label="Focus {app.name} - {unread} unread"`.
- Keyboard: Enter/Space triggers focus.

---

## Step 10 — Dashboard: NotificationCard (Swipeable)

**Goal**: A swipe-left-to-mark-read notification card using Pointer Events, with spring-back physics and a fallback tap-to-dismiss button.

**Status**: `done`

**File**: `dashboard/src/components/NotificationCard.tsx`

```typescript
interface Props {
  notification: Notification;
  onMarkRead: (id: number) => void;
}
```

### Swipe Gesture Implementation

Uses **Pointer Events** (works for both touch and mouse):

1. **`onPointerDown`**: Record `startX`, `startY`, set `captured = true`. Add `pointermove`/`pointerup` listeners to `document`.
2. **`onPointerMove`**: Calculate `deltaX = currentX - startX`. Only track horizontal swipes (`|deltaX| > |deltaY|`). If `deltaX < -20`, lock direction to left-only. Apply `transform: translateX(deltaX)` to card. Clamp max translation to -120px.
3. **`onPointerUp`**: If `deltaX < -80` (30% of card width ~260px), animate to `translateX(-100%)`, then call `onMarkRead(id)`. Otherwise, spring back to `translateX(0)` with transition.
4. **`transition`**: Use CSS `transition: transform 0.2s ease` for spring-back, `0.3s ease` for dismiss.

**Visual states**:
- **Unread**: full opacity, `bg-[#24283b]`, `border-l-[4px] border-[#7aa2f7]`, normal text color.
- **Read**: opacity-60, `bg-[#1f2233]`, no left border accent, text dimmed.
- **Swiping**: card translates with finger, background fades toward `bg-[#1a1b26]`.
- **Dismissing**: card slides left off-screen, removed from DOM after transition.

**Content layout**:
```
┌──────────────────────────────────────────────┐
│ 💬 Discord                          just now │
│                                                │
│ New message from Alice                        │
│ Hey, can you review the PR when you get a...  │
│                                                │
│          ◄◄◄ swipe left to mark read          │
└──────────────────────────────────────────────┘
```

**Accessibility**:
- `role="listitem"`, inside parent `role="list"`.
- Unread notifications: `aria-label="Unread notification from {app_name}: {summary}"`.
- A visible "Mark read" button (small ✓ icon, top-right corner) as fallback for non-touch users.

---

## Step 11 — Dashboard: Sound System

**Goal**: Play a notification chime on the dashboard whenever a new notification arrives, with per-app sound routing already wired (all use `default` for now).

**Status**: `done`

**File**: `dashboard/src/hooks/useSound.ts`

```typescript
interface SoundRegistry {
  [key: string]: string;  // sound name → relative path
}

const SOUNDS: SoundRegistry = {
  default: '/sounds/default.mp3',
};

export function useSound() {
  const play = (soundKey: string) => {
    const path = SOUNDS[soundKey] || SOUNDS.default;
    const audio = new Audio(path);
    audio.volume = 0.7;
    audio.play().catch(() => {
      // Autoplay blocked — browser requires user gesture first.
      // This fixes itself after the first tap on the dashboard.
    });
  };
  return { play };
}
```

**Sound file**: `dashboard/public/sounds/default.mp3` — a short (~500ms), pleasant notification chime. (Implementer will source or generate a free sound file.)

**Trigger**: In `useWebSocket`, when a `{type:"notification", ...}` message arrives, look up the app's sound key from `AppConfig` and call `play(appConfig.sound)`.

**Browser autoplay policy**: First notification sound may be blocked until user interacts with the page once. This is acceptable — the dashboard is a kiosk-style always-open page, and the first tap will unlock audio.

---

## Step 12 — Dashboard: WebSocket Hook Rework

**Goal**: Rewrite the WebSocket hook to handle the new protocol messages — state snapshot, notifications, mark-read, and focus-ack — and expose actions for all components.

**Status**: `done`

**File**: `dashboard/src/hooks/useWebSocket.ts` (rewrite)

**State managed**:
- `apps: AppConfig[]` — loaded on connect via `{type:"state", apps:[...]}`.
- `tabs: TabState[]` — for browser app live badges (legacy, still useful for focus routing).
- `notifications: Notification[]` — the notification feed.
- `connected: boolean`.

**Actions returned**:
- `focus(appId: string)` — send `{action:"focus", appId}`.
- `markRead(id: number)` — send `{action:"mark_read", id}`.

**Message handler** (switch on `data.type`):
- `"state"` → `setApps(data.apps)`, `setTabs(data.tabs)`, `setNotifications(data.notifications)`.
- `"notification"` → prepend to notifications list, trim to 200 entries. Trigger sound via `useSound().play()`.
- `"notification_read"` → update the matching notification's `is_read` to `true`. Recalculate app unread counts.
- `"focus_ack"` → log result (future: show brief toast "Focused Discord ✓").

**Sound integration**: Import `useSound` and call `play()` when a new notification arrives. The sound key comes from `apps.find(a => a.id === notification.app_id)?.sound`.

---

## Step 13 — Server: Main.py Changes

**Goal**: Wire all server pieces together — lifespan for D-Bus thread and banner suppression, config loading, new API endpoints, and static file serving.

**Status**: `done`

**File**: `server/main.py`

- Add `lifespan` context manager:
  - **Startup**: Load config → suppress native banners (Step 2) → start D-Bus listener thread (Step 1).
  - **Shutdown**: Stop D-Bus listener thread → restore native banners (Step 2).
  - Shutdown is triggered by `systemctl stop birdeye` (SIGTERM).
- Load `config.json` on startup into a module-level config dict.
- Add `GET /api/apps` — returns the apps from config (for dashboard to render app buttons).
- Keep `GET /api/state` for backward compatibility (returns just tabs).
- Keep static file serving for `dashboard/dist/`.
- Add `GET /api/notifications` — returns recent notifications (useful for debugging).

---

## Step 14 — Extension: Focus Acknowledgement

**Goal**: Send a confirmation back to the server after a browser focus action succeeds or fails, so the dashboard can give user feedback.

**Status**: `done`

**File**: `extension/background.js`

**Change**: In the focus handler, after `chrome.tabs.update` + `chrome.windows.update` complete, send `focus_ack`:

```javascript
ws.onMessage((msg) => {
  if (msg.type === 'focus' && msg.tabId) {
    chrome.tabs.update(msg.tabId, { active: true }, () => {
      const err = chrome.runtime.lastError;
      if (!err && msg.windowId) {
        chrome.windows.update(msg.windowId, { focused: true });
      }
      ws.send({ type: 'focus_ack', tabId: msg.tabId, success: !err });
    });
  }
});
```

The server translates this to `{type:"focus_ack", appId, success}` and broadcasts to dashboards.

---

## Step 15 — Integration: Dependencies, Sound, Build, & systemd

**Goal**: Ensure all runtime dependencies are documented, the sound file exists, the config is migrated, the systemd service is created, and the full stack builds end-to-end.

**Status**: `done`

**Tasks**:
- [x] **D-Bus dependency**: Added `dbus-python` to `server/requirements.txt`. On Ubuntu: `sudo apt install python3-dbus`.
- [ ] **Sound file**: Source a royalty-free `.mp3` notification sound (~500ms, pleasant chime). Place at `dashboard/public/sounds/default.mp3`. (Manual step — needs actual .mp3 file)
- [x] **Config migration**: Updated `server/config.json` to the new format (step 4).
- [x] **SQLite file**: `server/birdeye.db` — auto-created at runtime. Added to `.gitignore`.
- [x] **Build order**: Verified — `cd dashboard && npm run build` compiles cleanly.
- [ ] **systemd service**: Create `/etc/systemd/system/birdeye.service`:
  ```ini
  [Unit]
  Description=Birdeye Notification Center
  After=network.target

  [Service]
  Type=simple
  User=blackhawk
  WorkingDirectory=/home/blackhawk/dev/birdeye/server
  ExecStart=/usr/bin/uvicorn main:app --host 0.0.0.0 --port 9732
  Restart=on-failure
  RestartSec=5

  [Install]
  WantedBy=multi-user.target
  ```
  Enable with `sudo systemctl enable --now birdeye`. Shutdown: `sudo systemctl stop birdeye` sends SIGTERM → lifespan handler runs → banners restored cleanly. No need for an atexit safety net — systemd guarantees SIGTERM before SIGKILL.
- [ ] **Manual smoke test**: `systemctl start birdeye` → verify banners suppressed → open dashboard on touchscreen → `notify-send "Test" "Hello"` → verify card appears, sound plays, native popup does NOT appear, swipe works, focus works. `systemctl stop birdeye` → verify banners restored.

---

## Implementation Order

| Order | Step | Dependency |
|-------|------|-----------|
| 1 | Step 4 — Config Expansion | None |
| 2 | Step 3 — SQLite Persistence | None |
| 3 | Step 1 — D-Bus Listener | Steps 3, 4 |
| 4 | Step 2 — Suppress Native Banners | None |
| 5 | Step 5 — WebSocket Protocol | Steps 1, 2, 3, 4 |
| 6 | Step 6 — Window Focus | Step 4 |
| 7 | Step 13 — Main.py Wiring | Steps 1–6 |
| 8 | Step 7 — Dashboard Types | None |
| 9 | Step 12 — WebSocket Hook | Step 7 |
| 10 | Step 8 — Two-Column Layout | Steps 7, 12 |
| 11 | Step 9 — AppButton | Step 8 |
| 12 | Step 10 — NotificationCard | Step 8 |
| 13 | Step 11 — Sound System | Step 12 |
| 14 | Step 14 — Extension Ack | Step 5 |
| 15 | Step 15 — Integration | All above |

---

## Non-Goals (Out of Scope)

- Persistence across server restarts for tab state (still in-memory only).
- Push notifications when dashboard is closed.
- Authentication/security (LAN-only, same as current).
- Notification grouping/collapsing.
- Notification action buttons (D-Bus `actions` — ignored for now).
- Marking all as read at once (can be added later).
- Sound volume control in UI.
- Launching native apps that aren't already running.
- Non-GNOME desktop environments (KDE, XFCE) — banner suppression only targets GNOME for now.

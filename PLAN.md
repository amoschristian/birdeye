# Birdeye

Consolidated notification dashboard for browser tabs. Monitor Discord, Google Chat,
and other web apps from a single dashboard — accessible from desktop and iPhone on
the same LAN.

---

## Architecture

```
Chrome Extension (MV3)                  FastAPI Server               Dashboard (Preact)
     │                                      │                              │
     │  WebSocket ─────────────────────────►│◄── WebSocket + REST ─────────┤
     │  (title badges, notifications)        │   (state, control)           │
     │                                      │                              │
     │◄─ WebSocket ─────────────────────────│◄── WebSocket ────────────────┤
     │  (focus tab, switch workspace)        │   (focus, switch workspace)  │
     │                                      │                              │
     │                              wmctrl / xdotool
     │                              (workspace switch,
     │                               window focus)
```

Server binds `0.0.0.0:9732`. Dashboard accessible at `http://<linux-ip>:9732` on LAN.

---

## File Structure

```
birdeye/
├── extension/
│   ├── manifest.json
│   ├── background.js
│   └── content.js
├── server/
│   ├── main.py
│   ├── state.py
│   ├── ws.py
│   ├── wm.py
│   ├── config.json
│   └── requirements.txt
├── dashboard/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── types.ts
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts
│   │   └── components/
│   │       ├── AppCard.tsx
│   │       ├── WorkspaceGroup.tsx
│   │       └── ConnectionStatus.tsx
│   └── public/
│       ├── manifest.json
│       └── sw.js
├── start.sh
└── PLAN.md
```

---

## Phase 1 — Chrome Extension (MV3)

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "Birdeye Bridge",
  "version": "0.1.0",
  "permissions": ["tabs", "storage", "scripting"],
  "host_permissions": ["*://discord.com/*", "*://mail.google.com/*"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["*://discord.com/*", "*://mail.google.com/*"],
    "js": ["content.js"],
    "run_at": "document_start"
  }]
}
```

### background.js (service worker)

- On install/start: connect to `ws://localhost:9732/ws/extension`
- Listen `chrome.tabs.onUpdated` — match URL against configured apps, parse title badge
- Push `{type: "update", appId, tabId, windowId, unread, title}` to server
- Listen for WS messages: `{type: "focus", tabId, windowId}` → `chrome.tabs.update` + `chrome.windows.update`
- Reconnect on disconnect with 2s backoff

### content.js (Notification API interceptor)

- Override `window.Notification` constructor before page scripts run
- On `new Notification(title, opts)` → send `{type: "notification", appId, title, body}` via `chrome.runtime.sendMessage`
- Pass through original constructor so native notifications still fire

### Badge parsing

- Discord: `•` = any unread, `(@N)` = mentions
- Google Chat: `(N)` in title
- Generic: `(N)`, `[N]`, `N ` prefix, `•` bullet

---

## Phase 2 — Server (Python/FastAPI)

### config.json

```json
{
  "apps": {
    "discord": {
      "name": "Discord",
      "urlPattern": "discord.com/channels/",
      "workspace": 1
    },
    "google-chat": {
      "name": "Google Chat",
      "urlPattern": "mail.google.com/chat",
      "workspace": 1
    }
  },
  "port": 9732,
  "host": "0.0.0.0"
}
```

### main.py

- FastAPI app, CORS for LAN access
- Serve `dashboard/dist/` as static files (catch-all to `index.html` for SPA)
- Routes: `/ws/extension`, `/ws/dashboard`, `GET /api/state`, `POST /api/control`
- uvicorn with `host="0.0.0.0"`, `port=9732`

### state.py

- `TabState` model: `tab_id`, `window_id`, `app_id`, `app_name`, `workspace`, `unread`, `last_message`, `last_time`
- In-memory `dict[str, TabState]` keyed by `f"{app_id}:{tab_id}"`
- `update_tab(state)` → store → `broadcast()`
- `broadcast()` — JSON-encode full state, push to all dashboard WS connections

### ws.py

- `/ws/extension` — authenticate by localhost origin. Incoming: title updates, notifications. Outgoing: focus/workspace commands.
- `/ws/dashboard` — on connect push current state snapshot. Incoming: `{action: "focus", tabId, windowId}` or `{action: "workspace", workspace}` → forward to extension WS + execute wmctrl.

### wm.py

- `focus_window(window_id: str)` — `wmctrl -i -a {window_id}` or `xdotool windowactivate {window_id}`
- `switch_workspace(n: int)` — `wmctrl -s {n}`
- Graceful fallback if tools not installed

---

## Phase 3 — Dashboard (Preact + Vite + Tailwind)

### Stack

Preact, TypeScript, Vite, Tailwind CSS v4 (`@tailwindcss/vite`). Matches `ai-jira-monitoring` conventions. No external state lib — raw `useState` in hooks as per user's existing projects.

### types.ts

```ts
interface TabState {
  tab_id: number;
  window_id: number;
  app_id: string;
  app_name: string;
  workspace: number;
  unread: number;
  last_message: string | null;
  last_time: number;
}
```

### useWebSocket.ts

- `useWebSocket(host: string)` — connects to `ws://{host}:9732/ws/dashboard`
- Returns `{tabs: TabState[], connected: boolean, focus: fn, switchWorkspace: fn}`
- Reconnect on disconnect with 2s backoff, exponential max 30s

### Components

| Component | Props | Description |
|---|---|---|
| `App` | — | Shell. Groups tabs by workspace. Renders `ConnectionStatus` + `WorkspaceGroup` list. |
| `WorkspaceGroup` | `{workspace: number, tabs: TabState[], onFocus, onSwitch}` | Heading "Workspace N" + grid of `AppCard`s |
| `AppCard` | `{tab: TabState, onFocus}` | App icon, name, unread badge (red pill), last message preview, timestamp, "Focus" button |
| `ConnectionStatus` | `{connected: boolean}` | Green/red dot + text |

### Mobile layout

- Single column, full-width cards
- 48px+ touch targets
- Cards: icon + name left, badge right, preview below
- Swipe-friendly spacing (gap-3)
- Viewport meta for iPhone scaling
- Dark Tokyo Night palette matching other projects

### PWA

- `public/manifest.json` — `name: "Birdeye"`, `display: "standalone"`, theme color dark
- `public/sw.js` — minimal cache-first service worker
- Add to Home Screen on iPhone → full standalone app

---

## Phase 4 — Polish & Delivery

### start.sh

```bash
#!/bin/bash
# Install Python deps
cd server && pip install -r requirements.txt
# Build dashboard
cd ../dashboard && npm install && npm run build
# Start server
cd ../server && uvicorn main:app --host 0.0.0.0 --port 9732
```

### systemd user service

```ini
# ~/.config/systemd/user/birdeye.service
[Unit]
Description=Birdeye notification dashboard

[Service]
Type=simple
WorkingDirectory=%h/dev/birdeye/server
ExecStart=%h/dev/birdeye/server/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 9732
Restart=always

[Install]
WantedBy=default.target
```

### Remaining work

- Extension config UI (chrome-extension options page to add/remove apps)
- Notification history with SQLite
- Favicon extraction for app icons
- Deduplication when both title badge and Notification API fire for same event
- Auto-detect server host IP for dashboard auto-connect

---

## Dependencies

| Package | Purpose |
|---|---|
| `fastapi` | Web framework |
| `uvicorn[standard]` | ASGI server |
| `websockets` | WebSocket library |
| `wmctrl` (apt) | Window/workspace control |
| `preact` | UI framework |
| `vite` + `@preact/preset-vite` | Build tooling |
| `tailwindcss` + `@tailwindcss/vite` | CSS framework |
| `typescript` | Type checking |

---

## Assumptions

- Linux uses X11 (wmctrl). Wayland requires alternative (ydotool or compositor-specific)
- Chrome runs on the same machine as the server
- iPhone and Linux machine are on the same subnet
- Server port 9732 is not blocked by firewall
- Discord and Google Chat use standard title badge patterns (may break on update)

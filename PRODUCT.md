# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single software engineer at a multi-monitor Linux (GNOME/Ubuntu) desktop, with a dedicated 1024×600 touchscreen mounted as a secondary always-on companion display. The dashboard runs in a browser on that panel while the user works across primary monitors.

## Product Purpose

Birdeye is an **attention center** — a persistent, glanceable companion display that aggregates notifications from browser tabs and native desktop apps, plus todos. It surfaces everything competing for the user's attention so they can triage without breaking flow on their primary workspace.

Success means the user never needs to pick up their phone or Alt-Tab through browser tabs to see what needs attention.

## Positioning

An always-visible secondary display dedicated to awareness, not a notification popup tray or a phone. Unlike phone notifications (which demand picking up a device and switching context) or desktop notification toasts (which vanish), Birdeye lives on a permanently mounted touchscreen where everything is glanceable and actionable in-place. It centralizes what would otherwise be scattered across browser tabs, desktop clients, and mobile apps.

## Operating Context

- Linux desktop with GNOME, multiple monitors, and a secondary 1024×600 touchscreen (7-inch class) mounted at the desk
- Used during focused work — the user glances at it while coding or in meetings
- Touch interaction for quick actions: mark notifications read, filter by app, focus a browser tab or native window, control Spotify
- Browser-based apps (Discord, Google Chat, WhatsApp Web) via Chrome extension
- Native apps (Telegram, Discord desktop, calendar notifications) via D-Bus
- Spotify Desktop client via MPRIS D-Bus
- Audio notification chime plays through the dashboard browser on new notifications

## Capabilities and Constraints

**Capabilities:**
- Notification aggregation from browser tabs (Discord, Google Chat, WhatsApp Web) and native apps (Telegram, Discord desktop, calendar reminders)
- Todo list with text, priorities (high/medium/low), due dates, drag-to-reorder
- System resource monitoring: CPU, RAM, disk, network I/O (updates every 2 seconds)
- Spotify now-playing display with album art, track info, progress bar, and transport controls (play/pause, next, previous)
- Upcoming calendar event display
- Touch-first filtering: filter notifications by app, toggle between active/all
- Notification grouping by app + sender/conversation
- Swipe-left to mark individual notifications as read
- Mark all active read, clear all read notifications
- Focus a browser tab or native app window from the dashboard (via Chrome extension or wmctrl/ydotool)
- Workspace switching (emulates keyboard shortcut to move to a numbered workspace)
- Audio chime on new notifications (respects browser autoplay policy — first tap unlocks)
- Notifications persist in SQLite with 7-day retention (survive server restarts)
- Graceful degradation: no D-Bus session → extension-only mode; no gsettings → banner suppression skipped; no Spotify → shows "not running"

**Constraints:**
- Fixed 1024×600 resolution — no responsive scaling to larger/smaller viewports
- Single-user, no authentication, no multi-tenancy
- LAN-only — server binds `0.0.0.0:9732`, no WAN exposure intended
- Tab state is in-memory only (lost on server restart); notification state survives in SQLite
- Chrome/Chromium required for browser-tab notifications (MV3 extension)
- Linux-only D-Bus integration (native notifications, Spotify MPRIS)
- GNOME-specific banner suppression via gsettings
- No tests, no linter, no CI pipeline — verification is manual
- Server is Python/FastAPI; dashboard is Preact + TypeScript + Vite + Tailwind v4
- Workspace switching requires ydotool (Wayland) or wmctrl (X11)

**Terminology:**
- **App** — a notification source (Discord, Telegram, Google Chat, etc.), configured in `server/config.json`
- **Tab** — a browser tab being tracked by the Chrome extension
- **Notification** — a persisted notification event (from D-Bus or intercepted `new Notification()` call)
- **Provider** — a JavaScript object in the extension that defines badge detection for a browser-based app
- **Focus** — bringing a browser tab or native window to the foreground

## Brand Commitments

None binding. The name "Birdeye," the Tokyo Night dark color palette, and emoji app icons are all incidental choices open to change.

## Evidence on Hand

The codebase is the sole evidence — this is a personal project. No testimonials, case studies, press assets, logos, or brand materials exist. The three design docs (`docs/Major Overhaul.md`, `docs/Expansion monitor and spotify.md`, `docs/Layout Revision.md`) record implementation plans that are fully built.

No fabricated evidence is permitted in future design or marketing work.

## Product Principles

1. **Always glanceable** — information must be readable at a glance from across the desk without leaning in or squinting
2. **Touch-first** — every interactive element must be comfortably tappable (≥44px), with active-state feedback
3. **No context switch** — the dashboard surfaces what needs attention; the user should never have to go hunting for it
4. **Self-contained and resilient** — runs on the LAN, degrades gracefully when components are unavailable, survives restarts
5. **Noise reduction** — filters, groups, and read/clear affordances keep the feed focused on actionable items, not a firehose

## Accessibility & Inclusion

Touch-friendly sizing (≥44px targets) for the primary interaction mode. Dark color scheme reduces eye strain on a persistently lit display. No explicit accessibility standard is required — this is a personal tool with a single known user.

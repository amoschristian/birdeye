# PLAN — Layout Revision: Inline Resources + Spotify Strip

## Goal

Remove bottom tab navigation. Put resource monitor inline in the header and Spotify as a persistent bottom strip. Everything is always visible — no tab switching.

## Status

implemented

---

## Layout target

```
┌──────────────────────────────────────────────────────────┐
│ 🔔 Birdeye  ●  │  CPU ██ 42%  RAM ██ 6.3/31  ↓12 ↑4.5  │  header + resources (~56px)
├──────────────────────────────────────────────────────────┤
│ ┌──260px──┐ ┌─────────────────────────────────────────┐ │
│ │ All apps │ │ Active (3)    All             [Clear]  │ │
│ │ Discord  │ │ ┌─────────────────────────────────────┐ │ │
│ │ G Chat   │ │ │ Notification card                   │ │ │
│ │ Telegram │ │ └─────────────────────────────────────┘ │ │
│ └──────────┘ └─────────────────────────────────────────┘ │
│                      notification feed (unchanged)        │
├──────────────────────────────────────────────────────────┤
│ 🎵 [art]  Bohemian Rhapsody — Queen    ═══●═══  ▶️ ⏭   │  Spotify strip (~64px)
└──────────────────────────────────────────────────────────┘
```

---

## Step 1 — Resource strip in header

### Goal
Show CPU, RAM, network ↓↑ as compact inline chips in the header bar.

### Status
implemented

### Files created
- `dashboard/src/components/ResourceBar.tsx`

### Files changed
- `dashboard/src/App.tsx` — replaced header with inline resource bar
- `server/monitor.py` — added network I/O stats (dl/ul rate)
- `dashboard/src/types.ts` — added `net` field to MonitorData
- `dashboard/src/hooks/useWebSocket.ts` — handle `net` field in monitor message

### Explanation

**Header layout:**
```
[BirdEye ●]                          [CPU ██ 42%  RAM ██ 6.3/31  ↓12.3 ↑4.5]
```
- Left: title + connection status dot (green/red)
- Right: three resource chips, separated by thin dividers or gaps
- CPU: small bar (16px) + percentage, color-coded by threshold
- RAM: small bar + used/total in GB
- Network: ↓ download rate + ↑ upload rate (in KB/s or Mbps, whichever fits). No bar.

**Color thresholds (same as before):** green <60%, yellow 60-85%, red >85%

**Network:** Use `psutil.net_io_counters()` — store last sample, compute delta in bytes, divide by poll interval to get bytes/sec, display as KB/s (or Mbps if >1000 KB/s).

**Polling remains 2s** from `monitor.py` — just no changes needed there.

### Files to change
- `dashboard/src/App.tsx` — replace header with new inline resource bar
- `dashboard/src/hooks/useWebSocket.ts` — already has `monitorData`, no change

### Files to create
- None — the resource chips are inline JSX in App.tsx or a small `<ResourceBar>` component

### Edge cases
- Network values might be 0 on first poll (no delta yet). Show "—" or hide until first delta.
- Tight width: if the right side crowds the title, wrap to two rows or abbreviate. At 1024px, ~500px is available for the resource strip — plenty for three chips.
- Stale data: if monitor hasn't updated in >10s, show dimmed values or blink indicator.

---

## Step 2 — Spotify bottom strip

### Goal
Persistent mini-player at the bottom. Shows album art thumbnail, track/artist, thin progress bar, play/pause + next. No previous button (save space). Collapses to "Spotify not running" when unavailable.

### Status
implemented

### Files created
- `dashboard/src/components/SpotifyStrip.tsx`

### Explanation

**Layout (~64px):**
```
│ 🎵 [48×48] Bohemian Rhapsody — Queen   ═══●═══  ▶️  ⏭ │
```

- Left: fixed music note icon (placeholder when no art) or album art thumbnail (48×48, rounded)
- Middle: track title + artist (truncated to ~300px), thin 2px progress bar beneath
- Right: play/pause button (40×40), next button (40×40)
- No previous, no seek, no duration numbers — minimal

**States:**

| State | Shows |
|-------|-------|
| Spotify not running | "🎵 Spotify not running" centered, no controls |
| Nothing playing | "🎵 Nothing playing" centered, no controls |
| Playing | Full strip as described |
| Paused | Same but pause icon, progress static |
| Ad | Show title text + "Ad", no progress, no controls |

### Files to create
- `dashboard/src/components/SpotifyStrip.tsx`

### Files to change
- `dashboard/src/App.tsx` — render `<SpotifyStrip>` at bottom instead of `<SpotifyPanel>` in tab
- `dashboard/src/hooks/useWebSocket.ts` — already has `spotifyData` and `spotifyCommand`, no change

### Files to remove
- `dashboard/src/components/SpotifyPanel.tsx`

### Edge cases
- Long track titles: CSS `text-overflow: ellipsis` with `max-width` on the text container
- The progress bar should be subtle (2px, `#33467c` bg, `#7aa2f7` fill). Don't show time numbers to save space.
- Position polling from the server already works (1s when playing). The strip's progress bar updates in real time.

---

## Step 3 — Remove tab infrastructure

### Goal
Delete the bottom tab bar, monitor panel, and all tab-related state. App.tsx goes back to a single, always-visible notification view.

### Status
implemented

### Files removed
- `dashboard/src/components/TabBar.tsx`
- `dashboard/src/components/MonitorPanel.tsx`
- `dashboard/src/components/MetricCard.tsx`
- `dashboard/src/components/SpotifyPanel.tsx`

### Files changed
- `dashboard/src/App.tsx` — removed tab state, conditional rendering, TabBar import; always shows notification view

### Explanation

**Remove:**
- `TabBar.tsx` component
- `MonitorPanel.tsx` component
- `MetricCard.tsx` component
- `SpotifyPanel.tsx` component
- Tab state (`contentTab`, `setContentTab`) from App.tsx
- Tab routing conditional renders from App.tsx
- `useWebSocket` still keeps `monitorData`, `spotifyData`, `spotifyCommand` — those are still used in the new header strip and Spotify strip

**App.tsx structure after:**
```jsx
<div> {/* full height flex col */}
  <Header> {/* BirdEye title + connection + resource chips */} </Header>
  <div> {/* flex-1 flex, two-column notification layout (unchanged) */} </div>
  <SpotifyStrip> {/* persistent bottom strip */} </SpotifyStrip>
</div>
```

### Files to change
- `dashboard/src/App.tsx`

### Files to remove
- `dashboard/src/components/TabBar.tsx`
- `dashboard/src/components/MonitorPanel.tsx`
- `dashboard/src/components/MetricCard.tsx`
- `dashboard/src/components/SpotifyPanel.tsx`

### Files unchanged
- `dashboard/src/types.ts`
- `dashboard/src/hooks/useWebSocket.ts`
- `dashboard/src/components/AppButton.tsx`
- `dashboard/src/components/NotificationCard.tsx`
- `dashboard/src/components/ConnectionStatus.tsx`
- `dashboard/src/components/AppIcon.tsx`
- All server files (`monitor.py`, `spotify.py`, `ws.py`, `main.py`)

---

## Summary

| Action | Files |
|--------|-------|
| New component | `SpotifyStrip.tsx` |
| Modified | `App.tsx` |
| Deleted | `TabBar.tsx`, `MonitorPanel.tsx`, `MetricCard.tsx`, `SpotifyPanel.tsx` |
| Unchanged | All server code, hooks, types, remaining components |

**Net effect:** Bottom tab bar gone. Resource monitor moves to header. Spotify becomes a persistent bottom strip. Notification view reclaims the full height minus header (56px) and Spotify strip (64px) = ~480px for content. Same layout density as before for the notification feed.

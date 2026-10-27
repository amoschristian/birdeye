---
name: Birdeye Night Shift
description: A warm, tactile attention console for a 1024×600 secondary touchscreen
colors:
  ink: "#121021"
  plum-surface: "#1C1932"
  raised: "#272146"
  rule: "#3A335C"
  rule-subtle: "#2A2447"
  porcelain: "#F4EFE7"
  lavender-gray: "#A79DBE"
  faint-lavender: "#8A81A4"
  marigold: "#FFB65C"
  periwinkle: "#8F86FF"
  mint: "#7BE3A6"
  apricot: "#FFA26B"
  coral: "#FF7186"
typography:
  display:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "2.75rem"
    fontWeight: 500
    lineHeight: 1.0
    letterSpacing: "-0.05em"
  title:
    fontFamily: "Space Grotesk, Noto Sans, sans-serif"
    fontSize: "1.6875rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Space Grotesk, Noto Sans, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 400
    lineHeight: 1.45
  data:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.3
  action:
    fontFamily: "Space Grotesk, Noto Sans, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.2
rounded:
  micro: "4px"
  control: "9px"
  row: "10px"
  panel: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  channel-row:
    backgroundColor: "{colors.plum-surface}"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.row}"
    height: "58px"
  primary-button:
    backgroundColor: "{colors.periwinkle}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
  success-button:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
  destructive-button:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
  data-surface:
    backgroundColor: "{colors.plum-surface}"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.panel}"
    padding: "16px"
---

# Design System: Birdeye Night Shift

## Overview

**Creative North Star: "Night Shift"**

Birdeye is an attention console that lives on a 7-inch touchscreen beside the
desk. It is used at night, between tasks, while the primary monitors hold the
real work. The interface should feel like a warm instrument panel in a quiet
room, not a cold bridge or a notification inbox.

The visual system is built on violet ink and plum surfaces, with porcelain text
for structure and lavender gray for secondary information. Marigold carries
counts and attention data. Periwinkle carries interaction and selection. Mint,
apricot, and coral carry operational states. Space Grotesk gives the panel a
friendly, slightly geometric voice; JetBrains Mono makes counts, times, and
measured values feel exact. Everything is flat. Depth comes from tonal steps,
hairline rules, and spacing, never from shadow or glow.

The app rail is the signature element. Each channel is a row with a brand edge,
an icon plate, a short platform name, its last activity, and an unread count.
The rail can be read in a glance and operated with a thumb. The corgi patrol
overlay remains at the bottom edge as the one deliberately playful, non-blocking
character moment.

**Key characteristics:**

- Violet-ink canvas with plum surfaces and soft 9–14px geometry
- Porcelain structure, lavender secondary text, faint lavender metadata
- Marigold reserved for unread counts, current data, and the clock
- Periwinkle reserved for interaction, selection, and focus
- Brand-colored channel edges, never brand-colored fills
- Sentence case for navigation, actions, and empty states
- Uppercase only for true acronyms (CPU, RAM, DISK, NET)
- Space Grotesk for prose and structure, JetBrains Mono for data
- Solid status dots, thin rules, no shadows, no glow, no gradients

## Colors

### Surfaces

- **Ink** (`#121021`): canvas, status bar, bottom bar, and rail background.
- **Plum surface** (`#1C1932`): inputs, control groups, icon plates, and cards.
- **Raised** (`#272146`): selected channel, active tab, and pressed surfaces.
- **Rule** (`#3A335C`): primary dividers and control borders.
- **Rule subtle** (`#2A2447`): quiet row separators and internal rules.

### Text

- **Porcelain** (`#F4EFE7`): primary content, app names, and active labels.
- **Lavender gray** (`#A79DBE`): secondary copy, metadata, and inactive controls.
- **Faint lavender** (`#8A81A4`): timestamps, quiet labels, and micro data. It is
  deliberately lighter than the previous tertiary color so 14–15px text keeps
  readable contrast on ink.

### Accents

- **Marigold** (`#FFB65C`): unread counts, the clock, progress values, and
  attention data.
- **Periwinkle** (`#8F86FF`): primary actions, selected channels, focus rings,
  seek progress, and active navigation.
- **Mint** (`#7BE3A6`): online state, completion, and mark-read actions.
- **Apricot** (`#FFA26B`): imminent events, waiting tasks, and warning values.
- **Coral** (`#FF7186`): important notifications, overdue work, and destructive
  actions.

### Channel brands

Channel edges use the app's own identity, not a generic accent:

- Discord: `#7C83FF`
- Google Chat: `#4FC3A1`
- WhatsApp: `#63D69B`
- Calendar: `#FFB65C`
- Unknown apps: a stable fallback from the accent set, chosen by app id hash

**The Brand Edge Rule.** A brand color appears as a 3px edge or an icon's own
pixels. It never becomes a row fill, a button fill, or a text color for
unrelated content.

**The Marigold Rule.** Marigold is information. Use it for counts, the clock,
progress, and measured values. Do not use it for decoration or generic borders.

**The Periwinkle Rule.** Periwinkle marks where the user can act or what is
currently selected. It is not a static accent.

## Typography

**Structure and prose:** Space Grotesk, self-hosted from `/fonts/`
(400, 500, 600, 700).

**Data and time:** JetBrains Mono, self-hosted from `/fonts/`
(400, 500, 700).

The pairing is deliberately asymmetric. Space Grotesk is a little geometric and
a little warm; it makes sentences and app names feel approachable. JetBrains
Mono is exact and compact; it makes counts, timestamps, progress, and resource
values feel like instrument readouts. Both are bundled so the panel works
without a network connection.

### Hierarchy

- **Display** (JetBrains Mono 500, 44px, tracking −0.05em): the live clock.
- **Title** (Space Grotesk 600, 27px): view titles such as "Inbox".
- **Data** (JetBrains Mono 500, 17px): notification count totals and key values.
- **Body** (Space Grotesk 400, 19px): notification bodies and supporting copy.
- **Row content** (Space Grotesk 500, 23px): notification summaries and todo text.
- **Action** (Space Grotesk 600, 15–16px, sentence case): tabs, buttons, labels.
- **Micro data** (JetBrains Mono 400, 14–15px): timestamps, recency, counts,
  and gauge labels.

### Named Rules

**The Sentence Case Rule.** Navigation, buttons, empty states, and questions use
sentence case. Uppercase is reserved for acronyms and compact numeric badges.

**The Type Boundary Rule.** Prose is set in Space Grotesk; times, counts,
recency, and measured values are set in JetBrains Mono. Do not set a full
sentence in mono.

**The Arm's-Length Rule.** Primary content stays at 16px or larger. Secondary
data may sit at 14–15px only when its color and position keep it legible from
the panel's normal viewing distance.

## Layout

The composition is fixed to 1024×600 and never responds by reflowing the main
frame. The outer page is clipped; only the feed, rack, and Do First rail scroll
internally.

```
┌──────────────────────────────────────────────────────────────────────┐
│ 14:22  Mon 20 Oct   ● Online   [Home] [Focus] [Todos]   ♪  [Workspace]│ 64
├──────────────────────────────────────────────────────────────────────┤
│ Calendar ticker (conditional)                                        │ 36
├───────────────┬──────────────────────────────────┬───────────────────┤
│ All channels 7│ Inbox  7   Active 7 | All 12     │ Do first        6 │
│ Work       5  │──────────────────────────────────│ ○ Fix login       │
│ ▐ Discord  4  │ [icon] Discord Work · general 2m │   Today 2/5       │
│ ▐ Google Chat1│   Alice: check this              │ ○ Deploy staging  │
│ Personal   2  │ [icon] Telegram · Theo       12m │   Overdue         │
│ ▐ Telegram 2  │   Are you free?                  │                   │
│ ▐ WhatsApp 0  │                                  │                   │
├───────────────┴──────────────────────────────────┴───────────────────┤
│ ♪ Song — Artist  1:20 / 3:45   CPU 12%  RAM 38%  DISK 51%  ↓↑        │ 64
└──────────────────────────────────────────────────────────────────────┘
```

- **Status bar:** 64px. Clock, connection, segmented view navigation, mute, and
  workspace action.
- **Calendar ticker:** 36px when events exist. Now/imminent events park at the
  leading edge; the rest marquee.
- **Channel rack:** 208px. Master row, grouped channel rows, brand edges, last
  activity, unread counts.
- **Feed:** Flexible. A single-row Inbox header holds the title, Active/All
  segmented control, filter chip, and bulk read action. Grouped conversation
  headers and flat notification rows below.
- **Do First rail:** 224px when due work exists. Header count, actionable rows,
  priority and due state, subtask progress.
- **Corgi overlay:** 66px, pointer-transparent, sits above the bottom bar.
- **Audio/comms bar:** 64px. Spotify with progress and transport on the left;
  CPU, RAM, DISK, and NET on the right.

Spacing rhythm: 4px for tight data pairs, 8px for related controls, 12–16px for
row and panel padding, 24px for section boundaries.

## Components

### Channel rack

- **Master row:** 60px. A 2×2 block grid fills one block per active channel
  (capped at four), the label "All channels", the number of active channels, and
  the total unread count. It clears any active filter.
- **Group header:** 12px sentence-case label, a hairline rule, and the group's
  unread total.
- **Channel row:** 58px. 3px brand edge, 36px icon plate, 17px short platform name,
  14px last-activity recency, and a 28px marigold unread block. With no unread,
  the row shows a quiet dash instead of a badge.
- **Active:** Raised surface, full-opacity brand edge, porcelain name.
- **Unread arrival:** The count performs one short scale pop. No loops, no glow.
- **Touch:** The row is a native button, at least 44px high, with `aria-pressed`
  and an accessible name that includes unread count and last activity.

### Notification group header

- Flat group row, not a floating card.
- Brand edge at the left, icon plate, app name, conversation label, latest
  summary, relative time, and an "N new" chip.
- A 44px "Read" action appears when the group has unread items.
- Tapping the header expands the group. Expanded headers use the raised surface
  and expose "Read all" and "Collapse".

### Notification row

- Flat row with a subtle separator and a 3px edge: coral for important, the app
  brand for other unread, none for read.
- 16px app name and 15px mono time on the first line; 23px Space Grotesk
  summary next; 19px body clamped to two lines.
- The 44px check action marks read. Swipe left reveals a mint "Mark read" surface.
- Tap marks read and focuses the source. The row is keyboard operable.

### Empty states

- Centered icon plate, 24px sentence-case title, one line of direction, and at
  most one action.
- Copy names what is happening: "All quiet", "Nothing from Telegram", or
  "Reconnecting". No apology, no vague mood.

### Status controls

- Navigation is a segmented control on a plum surface. The active item uses the
  raised surface with porcelain text; counts use marigold on the active item.
- The mute control is 44×44px with a clear action label. Muting affects Birdeye
  chimes, never Spotify.
- Workspace is a periwinkle fill with ink text.

### Telemetry and audio bar

- Spotify: 36px album art, title, artist, elapsed/total in mono, a 1px seek
  track, and 44px transport targets.
- CPU, RAM, and DISK: 14px label, 17px mono percentage in a fixed-width field,
  and a 4px meter. Mint below 60%, apricot from 60% to below 85%, coral at 85%
  and above.
- NET: stacked download and upload rates in mono, mint and periwinkle, with
  each rate right-aligned in its own fixed-width field. Changing rates never
  resize the block or shift the bar.
- Stale telemetry fades to 40% after 10 seconds without an update.
- Missing data shows an em dash, never a fabricated zero.

### Event audio prompt

- A 14px-radius panel at the top right, below the ticker, with an apricot border.
- Shows "Event started", the event name, the mute question, a live countdown,
  and two 44px actions: "Mute for event" and "Keep sound on".
- Times out to "Keep sound on" after ten seconds.

## Motion

- Press feedback: short scale or brightness change on touch.
- Unread badge: one 420ms scale pop when a count increases.
- Swipe: the row tracks the finger, then snaps or dismisses over 150–200ms.
- Calendar ticker: a slow 60s marquee.
- Corgi: idle, walk, wave, jump, wait, and review behaviors.
- `prefers-reduced-motion` disables the badge pop, toast, row arrival, marquee,
  and transitions.

No looping pulses, glows, ambient gradients, or decorative card animations.

## Do's and Don'ts

### Do

- Keep the 1024×600 frame and 44px touch targets.
- Use tonal steps and hairline rules for separation.
- Let the channel rack carry brand color through edges and icons only.
- Reserve marigold for counts and measured values, periwinkle for action.
- Set prose in Space Grotesk and data in JetBrains Mono.
- Write actions in sentence case and name the result: "Mark all read",
  "Add task", "Show all channels".
- Show empty states with one clear next action.
- Keep the corgi non-blocking and reduced-motion aware.

### Don't

- Don't use shadows, glows, bloom, gradients, or blurred surfaces.
- Don't fill a channel row with its brand color.
- Don't use marigold or periwinkle as decoration.
- Don't set full sentences or task text in mono.
- Don't use all-caps labels outside acronyms and compact numeric badges.
- Don't turn every row into a rounded card with the same radius and shadow.
- Don't fabricate zero values for missing telemetry.
- Don't add page-level scroll or responsive reflow that breaks the fixed panel.

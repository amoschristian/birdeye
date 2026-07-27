---
name: Birdeye Mission Control
description: Launch control telemetry dashboard for a 7-inch secondary touchscreen
colors:
  void-navy: "#0B1120"
  console-gray: "#111827"
  console-hover: "#1A2535"
  console-active: "#1E3A5F"
  rule-line: "#1E3A5F"
  rule-subtle: "#162035"
  telemetry-amber: "#FFB800"
  accent-cyan: "#00D4FF"
  status-green: "#26DE81"
  alert-amber: "#FF9F43"
  critical-red: "#FF4757"
  text-primary: "#E8F0FE"
  text-secondary: "#8BA3C7"
  text-tertiary: "#4A6080"
typography:
  display:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.0
  data:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.3
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.06em"
  caption:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.3
rounded:
  none: "0px"
  sm: "2px"
  md: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  primary-button:
    backgroundColor: "{colors.accent-cyan}"
    textColor: "{colors.void-navy}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  danger-button:
    backgroundColor: "{colors.critical-red}"
    textColor: "{colors.void-navy}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  data-tile:
    backgroundColor: "{colors.console-gray}"
    borderColor: "{colors.rule-line}"
    rounded: "{rounded.sm}"
    padding: "12px"
---

# Design System: Birdeye Mission Control

## Overview

**Creative North Star: "Launch Control Telemetry"**

Birdeye is a mission control console for digital attention — a 7-inch telemetry panel mounted at the desk, read at arm's length. Every pixel serves operational awareness. The aesthetic draws from SpaceX and NASA mission control rooms: deep navy backgrounds, amber telemetry values, cyan active indicators, and large monospaced data readouts designed to be read at 3 meters in low light by someone who hasn't slept.

The design trades the previous panel-grid and indicator-lamp language for a calm, spacious, information-dense telemetry console. Corners are sharp (0–2px). Borders are thin (1px). Status is conveyed through solid-lit indicators and color — never through glow, bloom, drop shadows, or decorative effects. Depth comes from background layering (navy → console gray → active), not elevation.

Type is sized for the physical scene: a 7-inch panel at ~50cm viewing distance. Nothing falls below 14px. The clock is the largest element at 28px. Data values run at 18px, body at 16px. All text uses system fonts (ui-monospace for data, ui-sans-serif for structure) — zero downloads, instant rendering.

**Key Characteristics:**
- Deep navy backgrounds with subtle gray surface layering
- Amber telemetry values on navy — the core contrast pair
- Cyan accent for active/selected/focus states
- Thin 1px rule-line dividers between zones
- Solid-lit rectangular status indicators — no glow, no bloom, no halos
- Sharp corners (0–2px) throughout
- Large monospaced data at 18px minimum
- System UI + system mono font pairing (zero downloads)
- Touch targets ≥44px, press feedback via brightness shift
- Sparse motion: one fade-in on content load, 100ms brightness on press, nothing else

## Colors

### Backgrounds
- **Void Navy** (`#0B1120`): The deepest background. The canvas behind all console surfaces. Deep space blue-black.
- **Console Gray** (`#111827`): Standard console surface. Cards, panels, input fields. Sits above Void Navy.
- **Console Hover** (`#1A2535`): Interactive surface hover state. Buttons, list items on hover.
- **Console Active** (`#1E3A5F`): Selected or active surface. Active app channel, expanded sections.

### Data (telemetry values)
- **Telemetry Amber** (`#FFB800`): Primary data color. Key metrics, unread counts, active notification summaries. The core "this is information" signal.
- **Accent Cyan** (`#00D4FF`): Active/selected indicators, primary action buttons, focus rings. Appears on ≤10% of any panel surface.
- **Status Green** (`#26DE81`): Nominal state. Connected indicator, mark-read confirmation, resource usage below 60%.
- **Alert Amber** (`#FF9F43`): Warning state. Reconnecting, resource usage 60–85%, upcoming calendar events.
- **Critical Red** (`#FF4757`): Critical failure. Disconnected, resource usage > 85%, overdue items.

### Text
- **Text Primary** (`#E8F0FE`): Primary content. Notification summaries, headlines, clock.
- **Text Secondary** (`#8BA3C7`): Labels, descriptors, metadata. Cool blue-gray.
- **Text Tertiary** (`#4A6080`): Timestamps, grid labels, secondary metadata. Lowest contrast — only for non-critical information.

### Named Rules
**The No Glow Rule.** Status indicators are solid-lit rectangles or dots with no glow, no box-shadow, no bloom. Lit = filled with the status color. Unlit = filled with rule-line gray. The only permitted transition is color + background-color at 200ms.

**The No Shadow Rule.** Drop shadows and box-shadows do not exist in this system. Depth comes from background color steps. A visible box-shadow anywhere is a lapse.

**The Amber Rule.** Telemetry Amber is reserved for data values — numbers, counts, percentages, active notification text. It never appears on structural elements (borders, backgrounds, labels). When amber is visible, information has changed.

## Typography

**Character:** Two typefaces, two jobs. Monospace carries all data — timestamps, counts, percentages, durations, notification body text. It signals "this is information, not prose." The UI sans-serif carries structural elements — labels, headings, button text, navigation. Zero web fonts; both stacks render instantly.

### Scale (sized for 7" panel at ~50cm)
- **Display** (bold/700, 1.75rem/28px, line-height 1.0): Clock only. The largest element on screen.
- **Data** (medium/500, 1.125rem/18px, tabular-nums, line-height 1.3): Timestamps, counts, resource values, notification summaries. Monospaced.
- **Body** (normal/400, 1rem/16px, line-height 1.4): Notification body text, todo text, button labels.
- **Label** (semibold/600, 0.875rem/14px, tracking 0.06em): Panel headers, section labels, button text, filter tabs.
- **Caption** (normal/400, 0.875rem/14px, line-height 1.3): Secondary timestamps, metadata. Monospaced.

### Named Rules
**The 14px Floor.** Nothing renders below 14px. The 7-inch panel at arm's length demands it. Timestamps, metadata, and secondary labels all sit at 14px minimum.

**The Type Boundary.** Monospace for data, sans-serif for structure. Never cross the streams. A monospaced label or a sans-serif data value is a lapse.

## Layout

Single-page 1024×600 dashboard organized as a telemetry console with three horizontal bands:

- **Status bar** (48px): Clock (left, 28px display), connection indicator + ONLINE label, workspace button (right). Separated by a 1px rule-line below.
- **Calendar ticker** (24px, conditional): Amber-highlighted upcoming event strip. Only rendered when events exist.
- **Main console** (flex-1): Two-column layout — channel selector (80px left) + telemetry feed (flex-1). Clean divider between.
- **Audio/comms bar** (48px): Spotify telemetry (left) + CPU/RAM mini-instruments (right). Rule-line divider above.

Spacing is calibrated for the physical panel: 4px internal, 8px between related elements, 12px between sections, 16px between distinct panels.

## Components

### Status Indicators
- **Connected:** 8px solid green square, no glow. Green ONLINE label beside it.
- **Reconnecting:** 8px solid amber square, no glow. Amber NO SIGNAL label beside it.
- **Transition:** 200ms color crossfade. No pulse animation.

### Channel Selector (App Buttons)
- **Shape:** 64×52px panel, 2px radius, 1px rule-line border
- **Idle:** Console Gray background, rule-line border, text-secondary icon
- **Active:** Console Active background, accent-cyan border, accent-cyan icon
- **Hover:** Border shifts to accent-cyan
- **Unread badge:** Telemetry amber fill, void-navy text, 18px data size, positioned top-right

### Telemetry Feed (Notification Cards)
- **Shape:** 0px radius. Flat terminal rows with 1px rule-line divider between items.
- **Unread:** Console Gray background, telemetry amber summary text
- **Read:** Void Navy background, text at 60% opacity
- **Layout:** App icon (20px) + label + summary + timestamp (mono, right-aligned)
- **Internal padding:** 10px horizontal, 10px vertical
- **Swipe:** TranslateX with status-green reveal background. Dismiss animation: 200ms.

### Data Tiles (CPU/RAM instruments)
- **Shape:** 2px radius, Console Gray background, 1px rule-line border
- **Layout:** Label (14px, text-secondary) + value (18px, mono, color-coded)
- **Compact bar gauge:** 48px × 4px, rule-line track, color-coded fill
- **Thresholds:** Green (< 60%), amber (60–85%), red (> 85%)
- **Stale data:** 40% opacity after 10 seconds

### Bottom Bar
- **Height:** 48px, top rule-line divider
- **Left (Spotify):** Album art (32px square) + track info + progress bar (2px) + transport controls
- **Right (CPU/RAM):** Two data tiles with gauge bars

### Buttons
- **Shape:** 2px radius, 1px border matching fill
- **Primary:** Accent cyan fill, void-navy text
- **Danger:** Critical red fill, void-navy text
- **Ghost:** Transparent, text-secondary label, console-gray hover
- **Press feedback:** `filter: brightness(1.2)` at 100ms. No scale transform.

### Tabs (Navigation)
- **Shape:** 2px radius, no border
- **Active:** Console Active background, accent-cyan text
- **Inactive:** Console Gray background, text-secondary label

## Motion

Motion is sparse and purposeful — mission control is calm, not animated.

| Event | Duration | Effect |
|-------|----------|--------|
| Content appear | 200ms | Opacity 0→1, ease-out |
| Press feedback | 100ms | Brightness 1.2, ease-in |
| Value change | 150ms | Background flash, ease-out |
| Swipe dismiss | 200ms | TranslateX, ease-in |
| Status transition | 200ms | Color crossfade |

No entrance animations on individual cards. No staggered reveals. No pulse loops. No glow oscillations.

## Do's and Don'ts

### Do:
- Use telemetry amber for data values only — numbers, counts, percentages
- Use accent cyan sparingly — active states, focus rings, primary actions
- Keep text at 14px minimum — the 7-inch panel demands it
- Use solid-lit indicators — a filled square, not a glowing dot
- Maintain ≥44px touch targets
- Use `filter: brightness()` for press feedback

### Don't:
- Use drop shadows, box-shadows, or glow effects anywhere
- Use rounded corners above 4px
- Animate non-state-change elements
- Use monospace for labels or headings
- Use sans-serif for data values
- Leave a panel zone unlabeled
- Use scale transforms for press feedback

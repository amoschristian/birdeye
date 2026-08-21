---
name: Birdeye Mission Control
description: Launch-control telemetry dashboard for a 1024×600 secondary touchscreen
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
    fontSize: "2rem"
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
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "44px"
  success-button:
    backgroundColor: "{colors.status-green}"
    textColor: "{colors.void-navy}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "44px"
  ghost-button:
    backgroundColor: "{colors.console-gray}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "44px"
  channel-button:
    backgroundColor: "{colors.console-gray}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.none}"
    width: "72px"
    height: "60px"
  data-surface:
    backgroundColor: "{colors.console-gray}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
    padding: "12px"
---

# Design System: Birdeye Mission Control

## Overview

**Creative North Star: "Launch Control Telemetry"**

Birdeye is a persistent attention console for a 7-inch-class secondary display. It is designed to be read at arm's length while the user remains focused on work, so the interface behaves like a calm operations panel rather than a notification inbox: time, connection state, channel activity, actionable alerts, todos, calendar status, now-playing data, and system resources occupy clearly separated bands.

The current visual language is a deep navy telemetry deck with tonal surface steps, thin blue rule lines, amber data values, and cyan active states. Structural text uses the system sans stack; measured information uses the system monospace stack. The interface is intentionally flat: status is carried by solid color, labels, and position—not glow, bloom, elevation, or decorative gradients.

The dashboard is touch-first and fixed to a 1024×600 target. It supports three operating views—HOME, FOCUS, and TODOS—while retaining a persistent status bar, optional calendar ticker, animated-but-non-blocking corgi patrol overlay, and audio/comms bar. The status bar places a compact icon-only notification-alert mute control immediately to the left of WORKSPACE; muting alert chimes does not alter Spotify playback.

**Key Characteristics:**
- Deep navy canvas with console-gray surfaces and a darker subtle-rule layer
- Telemetry amber reserved for unread counts, notification summaries, progress, and measured values
- Cyan reserved for active, selected, focused, and primary-action states
- Solid 8px connection indicator and status labels; no glow or pulse
- Sharp, mostly square geometry with 0–2px corner language
- System sans for structure and system mono for data, timestamps, and task text
- 56px status and audio/comms bars, 24px conditional calendar ticker, flexible center console
- Touch targets of at least 44px for actions and controls
- Sparse state motion: brightness press feedback, short transitions, swipe dismissal, and a reduced-motion-aware corgi overlay

## Colors

The palette is restrained and semantic: navy layers establish depth, cyan marks interaction, amber marks attention/data, and green/red/alert amber communicate operational state.

### Primary
- **Accent Cyan** (`#00D4FF`): Active tabs, selected channels, primary actions, focus outlines, and the enabled edge of the alert-mute control.
- **Telemetry Amber** (`#FFB800`): Unread badges and counts, unread notification summaries, task progress, clock emphasis, and other changed data.

### Secondary
- **Status Green** (`#26DE81`): Connected/nominal status, mark-read actions, completed task actions, and the swipe-to-read reveal.
- **Alert Amber** (`#FF9F43`): Reconnecting state, waiting state, imminent calendar events, and warning-level resource values.
- **Critical Red** (`#FF4757`): Important notification marker, overdue/do-first state, destructive actions, and critical resource values.

### Neutral
- **Void Navy** (`#0B1120`): Canvas, root surfaces, empty states, input backgrounds, and the deepest layer.
- **Console Gray** (`#111827`): Notification groups, cards, inactive controls, and task surfaces.
- **Console Hover** (`#1A2535`): Press/hover surface for interactive rows and controls.
- **Console Active** (`#1E3A5F`): Selected channels, expanded groups, active tab surfaces, button backgrounds, and divider tone.
- **Rule Subtle** (`#162035`): Quiet row separators and low-priority internal rules.
- **Text Primary** (`#E8F0FE`): Main notification, todo, and clock-adjacent content.
- **Text Secondary** (`#8BA3C7`): Structural labels, body copy, metadata, and inactive controls.
- **Text Tertiary** (`#4A6080`): Relative timestamps, date labels, empty-state hints, and low-priority annotations.

### Named Rules

**The Amber Rule.** Amber is information, not decoration. Use it for counts, changed values, unread summaries, clock data, and progress—not for generic borders or labels.

**The Solid Status Rule.** A state indicator is a filled square or colored label with no glow, bloom, box-shadow, or pulse.

**The Cyan Budget Rule.** Cyan is reserved for interaction and focus. It should identify where the user can act or what is currently selected, not decorate static content.

## Typography

**Display Font:** `ui-monospace, SF Mono, Menlo, Consolas, monospace`

**Body Font:** `ui-sans-serif, system-ui, -apple-system, sans-serif`

**Label/Mono Font:** The mono stack carries data, while the sans stack carries structure.

**Character:** The pairing is utilitarian and immediate. Sans-serif names zones and actions; monospace makes counts, timestamps, task text, notification subjects, durations, and resource values feel like measurable telemetry. No web fonts are loaded.

### Hierarchy
- **Display** (700, `2rem`/32px, line-height 1.0): The live clock, the largest persistent readout.
- **Data** (500, `1.125rem`/18px, line-height 1.3): Notification summaries, todo text, counts, gauges, and measured values.
- **Body** (400, `1rem`/16px, line-height 1.4): Notification bodies, structural supporting text, and operational copy.
- **Label** (600, `0.875rem`/14px, line-height 1.2, tracking `0.06em`): Uppercase view tabs, app names, section markers, action buttons, and state labels.
- **Caption** (400, `0.875rem`/14px, line-height 1.3): Monospaced timestamps and secondary metadata.
- **Compact status** (600, 10–13px): Only for constrained badges such as `IMP`, `IMPORTANT`, and small task markers; never for primary reading content.

### Named Rules

**The Type Boundary Rule.** Use sans-serif for structure and mono for data. Do not use monospace for headings/labels or sans-serif for measured values.

**The Read-at-Arm's-Length Rule.** Primary interactive and informational content stays at 14px or larger; compact status badges may be smaller only when their adjacent label provides context.

## Layout

Birdeye uses a fixed single-screen composition for the 1024×600 touchscreen. The root fills the viewport, clips page overflow, and keeps the main console flexible rather than allowing the outer page to scroll.

- **Status bar:** 56px high. Clock and connection state sit at left; HOME/FOCUS/TODOS view tabs occupy the center-left; an icon-only alert mute control sits immediately left of the cyan WORKSPACE action at right.
- **Calendar ticker:** Conditional 24px strip below the status bar. Active or imminent events park at the leading edge while other events marquee across the strip. It disappears when there are no events.
- **Home console:** Flexible center region with an 88px channel rail, a scrollable notification feed, and an optional 224px DO FIRST rail when due high/medium-priority todos exist.
- **Focus view:** Replaces the home console with a notification review surface, a task breakdown surface, or a centered all-clear state. Notification and task panels split evenly when both are present.
- **Todos view:** Occupies the full flexible center region and presents inbox, today, upcoming, and matrix workflows with drag-to-reorder and inline task controls.
- **Corgi overlay:** A 66px absolute, pointer-transparent strip above the bottom bar. It consumes no layout space and respects `prefers-reduced-motion`.
- **Audio/comms bar:** 56px high. Spotify occupies the flexible left side and CPU/RAM instruments occupy the right side. The bar does not contain the alert mute control.

The spacing rhythm is 4px for compact gaps, 8px for related controls, 12px for row/card padding, and 16px for panel boundaries. The design does not introduce responsive reflow; the physical target is fixed.

## Elevation & Depth

This is a flat telemetry deck. There are no drop shadows, box shadows, glows, blurred backdrops, or elevation effects in the current implementation. Depth comes from the sequence Void Navy → Console Gray → Console Active and from 1px rule lines. Overlays use position and contrast, not simulated physical lift.

### Named Rules

**The No Shadow Rule.** Drop shadows and box-shadows do not exist in the interface.

**The Tonal Deck Rule.** When a region needs separation, move one step in the navy surface scale or add a thin rule line; do not add elevation.

## Shapes

The silhouette is rectangular and instrument-like. Most controls and containers have square corners; the documented small radius token is reserved for any future 2px instrument treatment. Borders are generally 1px solid `rule-line` or `rule-subtle`. Status lamps, badges, and progress indicators are filled blocks rather than pill-shaped UI. Content rows clip overflow and use truncation or line clamping for constrained width.

## Components

### Buttons and Actions
- **Shape:** Square, typically no radius, with a minimum 44px height for touch actions.
- **Primary:** Accent Cyan fill with Void Navy text; uppercase semibold label; brightness shift on press.
- **Success:** Status Green fill with Void Navy text for READ, DONE, and completion actions.
- **Warning:** Console Active fill with Alert Amber text for WAIT and warning actions.
- **Danger:** Critical Red fill with light text for CLEAR and destructive actions.
- **Ghost:** Console Gray or transparent surface with Text Secondary label; hover changes border/text toward Cyan.
- **Focus:** 2px Cyan or semantic-color outline with a 2px offset; no shadow.

### Channel Selector
- **Shape:** 72×60px square tile, 1px Rule Line border.
- **Idle:** Console Gray background and Text Secondary icon/label.
- **Active:** Console Active background, Cyan border, and Cyan icon/label.
- **Unread:** Amber numeric badge with Void Navy text, squared geometry, and a dark outline against the rail.
- **Interaction:** The tile is keyboard-operable as well as touch-operable and exposes unread count in its accessible name.

### Notification Rows and Groups
- **Shape:** Flat rows with a 1px Rule Subtle bottom divider and a minimum 56px content height.
- **Unread:** Console Gray row, Amber monospace summary, optional 6px Critical Red important marker.
- **Read:** Reduced visual emphasis with Text Secondary summary.
- **Group:** Collapsed groups show app, group key, unread counts, latest summary, timestamp, and a READ action; expanded groups use Console Active header and expose individual rows.
- **Interaction:** Tap focuses the source and marks unread; left swipe reveals a green READ action; explicit mark-read buttons remain available.

### Navigation
- **Style:** HOME, FOCUS, and TODOS are uppercase sans labels in a compact horizontal control group.
- **Active:** Console Active surface with Cyan text.
- **Inactive:** Console Gray surface with Text Secondary text.
- **Workspace:** Cyan filled action in the status bar; it switches to workspace 1.

### Telemetry Gauges
- **Shape:** Compact label/value/gauge group in the bottom bar.
- **Track:** Rule Line, 48px wide and 4px high.
- **Fill:** Status Green below 60%, Alert Amber from 60% to below 85%, Critical Red at 85% and above.
- **Stale:** The full instrument fades to 40% opacity after 10 seconds without fresh data.

### Alert Mute Control
- **Shape:** 44×44px square icon-only button immediately left of WORKSPACE in the status bar, using a Lucide Volume2/VolumeX icon.
- **Enabled:** Console Gray surface with a Text Secondary Volume2 icon; hover border shifts toward Cyan.
- **Muted:** Console Active surface, Cyan border, and VolumeX icon.
- **Behavior:** Toggles notification and todo-reminder chimes and persists the preference locally. Spotify transport and playback are not changed. The icon-only control exposes `aria-pressed`, an accessible action label, and a tooltip.

### Calendar Ticker
- **Shape:** 24px ruled strip with monospace event text and solid 6px status markers.
- **State:** Green for current events, Alert Amber for imminent events, Tertiary text for future events.
- **Behavior:** Current/imminent events park at the leading edge; remaining events scroll in a slow marquee. No ticker renders when the event list is empty.

## Do's and Don'ts

### Do:
- **Do** keep the 1024×600 fixed-target composition intact and make every action comfortable for touch.
- **Do** use Void Navy, Console Gray, and Console Active tonal steps before reaching for extra decoration.
- **Do** reserve Amber for telemetry and attention data, and Cyan for interaction/focus.
- **Do** use system sans for labels and system mono for data, timestamps, summaries, task text, and resource values.
- **Do** keep action targets at least 44px high and provide visible focus outlines.
- **Do** use solid indicators, thin rules, truncation, line clamping, and explicit labels for glanceability.
- **Do** respect `prefers-reduced-motion` for the corgi patrol and keep motion tied to state changes.
- **Do** let the alert mute control silence Birdeye chimes without muting Spotify playback.

### Don't:
- **Don't** use drop shadows, box-shadows, glow, bloom, gradients, or decorative blur.
- **Don't** use rounded cards, pills, or large-radius containers; this is a flat instrument deck.
- **Don't** use Amber for structural borders, generic labels, or decoration.
- **Don't** use Cyan as a static accent unrelated to selection, focus, or action.
- **Don't** replace the system font pairing with downloaded display fonts.
- **Don't** add page-level scrolling or responsive scaling that undermines the fixed touchscreen composition.
- **Don't** animate cards or decorative elements without conveying state; do not add pulse loops.
- **Don't** make the mute control ambiguous: it must say that it affects alert sounds, not Spotify.

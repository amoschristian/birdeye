import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { CalendarEvent } from '../types';

interface Props {
  events: CalendarEvent[];
}

const UPCOMING_THRESHOLD = 15 * 60; // 15 minutes in seconds

function formatParts(start: number, end: number): { dayLabel: string; timeStr: string; highlight: 'now' | 'upcoming' | 'future' | 'none' } {
  const now = Date.now() / 1000;
  const startDate = new Date(start * 1000);
  const endDate = new Date(end * 1000);

  const timeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  // Currently happening
  if (now >= start && now <= end) {
    const endTime = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return { dayLabel: 'Now', timeStr: `until ${endTime}`, highlight: 'now' };
  }

  // Starting within 15 minutes — needs attention
  if (start > now && start - now <= UPCOMING_THRESHOLD) {
    const mins = Math.round((start - now) / 60);
    const dayLabel = mins <= 1 ? 'Imminent' : `${mins}m`;
    return { dayLabel, timeStr, highlight: 'upcoming' };
  }

  const today = new Date();
  if (startDate.toDateString() === today.toDateString()) {
    return { dayLabel: '', timeStr, highlight: 'none' };
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (startDate.toDateString() === tomorrow.toDateString()) {
    return { dayLabel: 'Tomorrow', timeStr, highlight: 'future' };
  }

  const dateLabel = startDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return { dayLabel: dateLabel, timeStr, highlight: 'future' };
}

function EventChip({ ev }: { ev: CalendarEvent }) {
  const { dayLabel, timeStr, highlight } = formatParts(ev.start, ev.end);
  const isUpcoming = highlight === 'upcoming';
  const isNow = highlight === 'now';
  const isFuture = highlight === 'future';
  return (
    <span class={`inline-flex items-center gap-1.5 shrink-0 ${isUpcoming ? 'bg-[#e0af68]/15 rounded-lg px-2 py-0.5 -mx-1' : ''}`}>
      <span class="text-[#33467c] font-medium">·</span>
      <span class="text-sm">📅</span>
      <span class={isUpcoming ? 'text-[#e0af68] font-semibold' : 'text-[#565f89]'}>{ev.summary}</span>
      {dayLabel && (
        <span class={
          isNow ? 'text-[#9ece6a] font-semibold' :
          isUpcoming ? 'text-[#e0af68] font-bold' :
          isFuture ? 'text-[#e0af68] font-semibold' :
          'text-[#565f89]'
        }>
          {dayLabel}
        </span>
      )}
      <span class={
        isNow ? 'text-[#9ece6a] font-semibold' :
        isUpcoming ? 'text-[#e0af68] font-bold' :
        isFuture ? 'text-[#7aa2f7] font-semibold' :
        'text-[#a9b1d6]'
      }>
        {timeStr}
      </span>
    </span>
  );
}

const GRACE_PERIOD = 120; // keep parked event for 2 min after it ends

export function CalendarStrip({ events }: Props) {
  // Sticky parked event — stays visible until its end time passes (+ grace),
  // even if the server temporarily stops sending it between polls.
  const [stickyParked, setStickyParked] = useState<CalendarEvent | null>(null);
  const stickyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Decide which event should be parked based on server data
  const now = Date.now() / 1000;
  const serverParked = (events || []).find((ev) => {
    if (now >= ev.start && now <= ev.end) return true;
    if (ev.start > now && ev.start - now <= UPCOMING_THRESHOLD) return true;
    return false;
  }) ?? null;

  // Sync sticky parked event
  const prevId = useRef<string | null>(null);
  useEffect(() => {
    const parkId = serverParked?.id ?? null;

    if (serverParked) {
      // New or changed parked candidate — adopt it
      setStickyParked(serverParked);
      // Schedule clearing after end + grace
      const remaining = (serverParked.end + GRACE_PERIOD - now) * 1000;
      if (remaining > 0) {
        if (stickyTimer.current) clearTimeout(stickyTimer.current);
        stickyTimer.current = setTimeout(() => setStickyParked(null), remaining);
      }
      prevId.current = parkId;
    } else if (parkId !== prevId.current && stickyParked) {
      // Server no longer has a parked event (it ended). Check if ours expired.
      if (now > stickyParked.end + GRACE_PERIOD) {
        setStickyParked(null);
        if (stickyTimer.current) clearTimeout(stickyTimer.current);
      }
      // else: keep showing sticky — the timeout from earlier will clear it
      prevId.current = null;
    }
  }, [serverParked?.id ?? null, serverParked?.end ?? 0]);

  const parkedEvent = stickyParked;
  const evList = events || [];
  const scrollingEvents = parkedEvent
    ? evList.filter((ev) => ev.id !== parkedEvent.id)
    : evList;

  // Nothing to show — not even a sticky parked event
  if (!parkedEvent && scrollingEvents.length === 0) return null;

  // Render a single copy of events — both copies are identical for seamless loop
  const eventsCopy = scrollingEvents.length > 0 && (
    <span class="inline-flex items-center gap-3">
      {scrollingEvents.map((ev) => (
        <EventChip key={ev.id} ev={ev} />
      ))}
    </span>
  );

  return (
    <div class="shrink-0 border-t border-[#33467c] bg-[#1f2233] py-1.5 text-xs select-none overflow-hidden whitespace-nowrap flex items-center">
      {/* Parked active event — sits above the marquee with solid background */}
      {parkedEvent && (() => {
        const { highlight, timeStr } = formatParts(parkedEvent.start, parkedEvent.end);
        const isNow = highlight === 'now';
        const endTime = new Date(parkedEvent.end * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        return (
          <div class="shrink-0 z-10 flex items-center gap-1.5 bg-[#1f2233] pl-4 pr-3">
            <span class="text-sm">📅</span>
            <span class="text-[#c0caf5] font-semibold max-w-48 truncate">{parkedEvent.summary}</span>
            <span class={isNow ? 'text-[#9ece6a] font-semibold' : 'text-[#e0af68] font-bold'}>
              {isNow ? 'Now' : timeStr}
            </span>
            {isNow && (
              <span class="text-[#9ece6a] font-semibold">until {endTime}</span>
            )}
            {scrollingEvents.length > 0 && (
              <span class="text-[#33467c] font-medium">·</span>
            )}
          </div>
        );
      })()}

      {/* Marquee — scrolls behind the parked event */}
      <div class="flex-1 overflow-hidden">
        <div
          class="inline-flex animate-marquee"
          style={{ animationDuration: '60s', paddingLeft: parkedEvent ? '0' : '16px', paddingRight: '16px' }}
        >
          {eventsCopy}
          {eventsCopy}
        </div>
      </div>
    </div>
  );
}

import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { CalendarEvent } from '../types';

interface Props {
  events: CalendarEvent[];
}

const UPCOMING_THRESHOLD = 15 * 60;
const GRACE_PERIOD = 120;

function formatTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatParts(start: number, end: number): {
  label: string;
  time: string;
  highlight: 'now' | 'upcoming' | 'future' | 'none';
} {
  const now = Date.now() / 1000;
  const startDate = new Date(start * 1000);

  if (now >= start && now <= end) {
    return { label: 'Now', time: `until ${formatTime(end)}`, highlight: 'now' };
  }

  if (start > now && start - now <= UPCOMING_THRESHOLD) {
    const minutes = Math.round((start - now) / 60);
    return {
      label: minutes <= 1 ? 'Starting' : `in ${minutes}m`,
      time: formatTime(start),
      highlight: 'upcoming',
    };
  }

  const today = new Date();
  if (startDate.toDateString() === today.toDateString()) {
    return { label: '', time: formatTime(start), highlight: 'none' };
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (startDate.toDateString() === tomorrow.toDateString()) {
    return { label: 'Tomorrow', time: formatTime(start), highlight: 'future' };
  }

  const dateLabel = startDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return { label: dateLabel, time: formatTime(start), highlight: 'future' };
}

function EventChip({ event }: { event: CalendarEvent }) {
  const { label, time, highlight } = formatParts(event.start, event.end);
  const dotColor =
    highlight === 'now' ? 'var(--color-ok)' : highlight === 'upcoming' ? 'var(--color-warn)' : 'var(--color-faint)';
  const labelColor =
    highlight === 'now' ? 'text-ok' : highlight === 'upcoming' ? 'text-warn' : 'text-faint';

  return (
    <span
      class="inline-flex shrink-0 items-center gap-2"
      title={`${event.summary} — ${formatTime(event.start)} to ${formatTime(event.end)}`}
    >
      <span class="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
      <span class="text-[18px] font-medium text-text">{event.summary}</span>
      {label && <span class={`text-[15px] font-semibold ${labelColor}`}>{label}</span>}
      <span class="font-mono text-[15px] text-faint">{time}</span>
    </span>
  );
}

export function CalendarStrip({ events }: Props) {
  const [stickyParked, setStickyParked] = useState<CalendarEvent | null>(null);
  const stickyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const now = Date.now() / 1000;
  const serverParked = (events || []).find((event) => {
    if (now >= event.start && now <= event.end) return true;
    if (event.start > now && event.start - now <= UPCOMING_THRESHOLD) return true;
    return false;
  }) ?? null;

  const previousId = useRef<string | null>(null);
  useEffect(() => {
    const parkedId = serverParked?.id ?? null;

    if (serverParked) {
      setStickyParked(serverParked);
      const remaining = (serverParked.end + GRACE_PERIOD - now) * 1000;
      if (remaining > 0) {
        if (stickyTimer.current) clearTimeout(stickyTimer.current);
        stickyTimer.current = setTimeout(() => setStickyParked(null), remaining);
      }
      previousId.current = parkedId;
    } else if (parkedId !== previousId.current && stickyParked) {
      if (now > stickyParked.end + GRACE_PERIOD) {
        setStickyParked(null);
        if (stickyTimer.current) clearTimeout(stickyTimer.current);
      }
      previousId.current = null;
    }
  }, [serverParked?.id ?? null, serverParked?.end ?? 0]);

  const parkedEvent = stickyParked;
  const eventList = events || [];
  const scrollingEvents = parkedEvent
    ? eventList.filter((event) => event.id !== parkedEvent.id)
    : eventList;

  if (!parkedEvent && scrollingEvents.length === 0) return null;

  const tickerContent = scrollingEvents.length > 0 && (
    <span class="inline-flex items-center gap-6">
      {scrollingEvents.map((event) => (
        <EventChip key={event.id} event={event} />
      ))}
    </span>
  );

  return (
    <div class="flex h-[36px] shrink-0 select-none items-center overflow-hidden whitespace-nowrap border-b border-line/50 bg-surface/30">
      {parkedEvent && (() => {
        const { highlight } = formatParts(parkedEvent.start, parkedEvent.end);
        const isNow = highlight === 'now';
        const accentColor = isNow ? 'var(--color-ok)' : 'var(--color-warn)';
        const accentText = isNow ? 'text-ok' : 'text-warn';

        return (
          <div class="z-10 flex shrink-0 items-center gap-2 border-r border-line/50 bg-ink/80 py-1 pl-4 pr-3">
            <span class="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} />
            <span class="max-w-64 truncate text-[18px] font-medium text-text">
              {parkedEvent.summary}
            </span>
            <span class={`text-[15px] font-semibold ${accentText}`}>
              {isNow ? 'Now' : formatTime(parkedEvent.start)}
            </span>
            <span class="font-mono text-[14px] text-faint">
              {isNow ? `until ${formatTime(parkedEvent.end)}` : `in ${Math.round((parkedEvent.start - now) / 60)}m`}
            </span>
          </div>
        );
      })()}

      <div class="flex-1 overflow-hidden">
        <div
          class="inline-flex animate-marquee gap-6"
          style={{ paddingLeft: parkedEvent ? '24px' : '16px', paddingRight: '16px' }}
        >
          {tickerContent}
          {tickerContent}
        </div>
      </div>
    </div>
  );
}

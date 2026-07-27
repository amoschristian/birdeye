import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { CalendarEvent } from '../types';

interface Props {
  events: CalendarEvent[];
}

const UPCOMING_THRESHOLD = 15 * 60;

function formatParts(start: number, end: number): { dayLabel: string; timeStr: string; highlight: 'now' | 'upcoming' | 'future' | 'none' } {
  const now = Date.now() / 1000;
  const startDate = new Date(start * 1000);
  const endDate = new Date(end * 1000);

  const timeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  if (now >= start && now <= end) {
    const endTime = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return { dayLabel: 'NOW', timeStr: `${endTime}`, highlight: 'now' };
  }

  if (start > now && start - now <= UPCOMING_THRESHOLD) {
    const mins = Math.round((start - now) / 60);
    const dayLabel = mins <= 1 ? 'IMMINENT' : `T-${mins}M`;
    return { dayLabel, timeStr, highlight: 'upcoming' };
  }

  const today = new Date();
  if (startDate.toDateString() === today.toDateString()) {
    return { dayLabel: '', timeStr, highlight: 'none' };
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (startDate.toDateString() === tomorrow.toDateString()) {
    return { dayLabel: 'TOMORROW', timeStr, highlight: 'future' };
  }

  const dateLabel = startDate.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase();
  return { dayLabel: dateLabel, timeStr, highlight: 'future' };
}

function EventChip({ ev }: { ev: CalendarEvent }) {
  const { dayLabel, timeStr, highlight } = formatParts(ev.start, ev.end);
  const isUpcoming = highlight === 'upcoming';
  const isNow = highlight === 'now';

  const statusColor = isNow ? '#26DE81' : isUpcoming ? '#FF9F43' : '#4A6080';
  const textColor = isUpcoming ? '#FF9F43' : isNow ? '#26DE81' : '#8BA3C7';

  return (
    <span class="inline-flex items-center gap-2 shrink-0">
      <span
        class="w-1.5 h-1.5 shrink-0"
        style={{ backgroundColor: statusColor }}
      />
      <span
        class="font-mono text-[14px] font-medium"
        style={{ color: isUpcoming || isNow ? textColor : '#E8F0FE' }}
      >
        {ev.summary}
      </span>
      {dayLabel && (
        <span class="font-mono text-[14px] font-semibold uppercase tracking-[0.06em]" style={{ color: textColor }}>
          {dayLabel}
        </span>
      )}
      <span class="font-mono text-[14px]" style={{ color: statusColor }}>
        {timeStr}
      </span>
    </span>
  );
}

const GRACE_PERIOD = 120;

export function CalendarStrip({ events }: Props) {
  const [stickyParked, setStickyParked] = useState<CalendarEvent | null>(null);
  const stickyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const now = Date.now() / 1000;
  const serverParked = (events || []).find((ev) => {
    if (now >= ev.start && now <= ev.end) return true;
    if (ev.start > now && ev.start - now <= UPCOMING_THRESHOLD) return true;
    return false;
  }) ?? null;

  const prevId = useRef<string | null>(null);
  useEffect(() => {
    const parkId = serverParked?.id ?? null;

    if (serverParked) {
      setStickyParked(serverParked);
      const remaining = (serverParked.end + GRACE_PERIOD - now) * 1000;
      if (remaining > 0) {
        if (stickyTimer.current) clearTimeout(stickyTimer.current);
        stickyTimer.current = setTimeout(() => setStickyParked(null), remaining);
      }
      prevId.current = parkId;
    } else if (parkId !== prevId.current && stickyParked) {
      if (now > stickyParked.end + GRACE_PERIOD) {
        setStickyParked(null);
        if (stickyTimer.current) clearTimeout(stickyTimer.current);
      }
      prevId.current = null;
    }
  }, [serverParked?.id ?? null, serverParked?.end ?? 0]);

  const parkedEvent = stickyParked;
  const evList = events || [];
  const scrollingEvents = parkedEvent
    ? evList.filter((ev) => ev.id !== parkedEvent.id)
    : evList;

  if (!parkedEvent && scrollingEvents.length === 0) return null;

  const tickerContent = scrollingEvents.length > 0 && (
    <span class="inline-flex items-center gap-6">
      {scrollingEvents.map((ev) => (
        <EventChip key={ev.id} ev={ev} />
      ))}
    </span>
  );

  return (
    <div class="shrink-0 border-b border-[#1E3A5F] bg-[#0B1120] py-1 select-none overflow-hidden whitespace-nowrap flex items-center h-6">
      {parkedEvent && (() => {
        const { highlight, timeStr } = formatParts(parkedEvent.start, parkedEvent.end);
        const isNow = highlight === 'now';
        const endTime = new Date(parkedEvent.end * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const accentColor = isNow ? '#26DE81' : '#FF9F43';

        return (
          <div class="shrink-0 z-10 flex items-center gap-2 bg-[#0B1120] pl-4 pr-3">
            <span class="w-1.5 h-1.5 shrink-0" style={{ backgroundColor: accentColor }} />
            <span class="font-mono text-[14px] font-semibold text-[#E8F0FE] max-w-48 truncate">
              {parkedEvent.summary}
            </span>
            <span class="font-mono text-[14px] font-semibold uppercase tracking-[0.06em]" style={{ color: accentColor }}>
              {isNow ? 'NOW' : timeStr}
            </span>
            {isNow && (
              <span class="font-mono text-[14px]" style={{ color: accentColor }}>
                → {endTime}
              </span>
            )}
            {scrollingEvents.length > 0 && (
              <span class="text-[#1E3A5F] font-mono mx-1">|</span>
            )}
          </div>
        );
      })()}

      <div class="flex-1 overflow-hidden">
        <div
          class="inline-flex gap-6 animate-marquee"
          style={{ animationDuration: '60s', paddingLeft: parkedEvent ? '0' : '16px', paddingRight: '16px' }}
        >
          {tickerContent}
          {tickerContent}
        </div>
      </div>
    </div>
  );
}

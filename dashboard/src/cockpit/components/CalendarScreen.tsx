import { useEffect, useState } from 'preact/hooks';
import type { CalendarEvent } from '../../types';
import { clockTime, pageSlice } from '../helpers';
import { Pager } from './Pager';

interface Props {
  events: CalendarEvent[];
  page: number;
  onPage: (page: number) => void;
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return now;
}

function eventStatus(event: CalendarEvent, nowMs: number): { text: string; tone: string } {
  const now = nowMs / 1000;

  if (event.start <= now && event.end > now) {
    return { text: 'Now · until ' + clockTime(event.end), tone: 'event--now' };
  }

  const minutes = Math.round((event.start - now) / 60);
  if (minutes <= 15) {
    return { text: minutes <= 1 ? 'Starting' : 'In ' + minutes + 'm', tone: 'event--soon' };
  }

  const start = new Date(event.start * 1000);
  const today = new Date(nowMs);

  if (start.toDateString() === today.toDateString()) {
    return { text: 'Today', tone: 'event--later' };
  }

  const tomorrow = new Date(nowMs);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (start.toDateString() === tomorrow.toDateString()) {
    return { text: 'Tomorrow', tone: 'event--later' };
  }

  return { text: start.toLocaleDateString([], { weekday: 'short' }), tone: 'event--later' };
}

export function CalendarScreen({ events, page, onPage }: Props) {
  const now = useNow(15000);

  const upcoming = events
    .filter((event) => event.end * 1000 > now)
    .sort((a, b) => a.start - b.start);

  const slice = pageSlice(upcoming, page);

  return (
    <section class="screen" aria-label="Flight plan">
      <header class="screen__head">
        <span class="screen__title">Flight plan</span>
        <span class="screen__count">{upcoming.length} scheduled</span>
        <span class="spacer" />
        <Pager page={slice.page} pages={slice.pages} onChange={onPage} />
      </header>

      <div class="rows">
        {slice.items.length === 0 ? (
          <div class="empty">Nothing scheduled</div>
        ) : (
          slice.items.map((event) => {
            const status = eventStatus(event, now);

            return (
              <div class={'event ' + status.tone} key={event.id}>
                <span class="event__accent" aria-hidden="true" />
                <span class="event__time">
                  <b>{clockTime(event.start)}</b>
                  <span>–{clockTime(event.end)}</span>
                </span>
                <span class="event__summary">{event.summary}</span>
                <span class="event__status">{status.text}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

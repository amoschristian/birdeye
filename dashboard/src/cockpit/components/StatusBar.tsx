import { useEffect, useState } from 'preact/hooks';
import type { CalendarEvent, MonitorData } from '../../types';
import { clockTime, formatRate, pad } from '../helpers';

export type Condition = 'red' | 'warn' | 'ok';

interface Props {
  monitor: MonitorData | null;
  events: CalendarEvent[];
  onWorkspace: (workspace: number) => void;
}

function Mini({ label, value }: { label: string; value?: number }) {
  const percent = Math.max(0, Math.min(100, value ?? 0));
  const lit = Math.round((percent / 100) * 8);

  return (
    <span class="mini">
      <span class="mini__top">
        <span class="mini__label">{label}</span>
        <span class="mini__value">{value === undefined ? '—' : Math.round(percent) + '%'}</span>
      </span>
      <span class="mini__bar" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <i key={index} class={index < lit ? 'on' : ''} />
        ))}
      </span>
    </span>
  );
}

export function StatusBar({ monitor, events, onWorkspace }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const nowMs = now.getTime();
  const next = events
    .filter((event) => event.end * 1000 > nowMs)
    .sort((a, b) => a.start - b.start)[0];
  const isNow = next ? next.start * 1000 <= nowMs : false;

  return (
    <header class="status">
      <button
        type="button"
        class="ws__btn"
        onClick={() => onWorkspace(1)}
        title="Switch to workspace 1"
        aria-label="Switch to workspace 1"
      >
        WORK
      </button>

      <span class="status__clock mono">
        {pad(now.getHours())}:{pad(now.getMinutes())}
      </span>

      <span class="status__seam" />

      <div class="monitor" aria-label="System monitor">
        <Mini label="CPU" value={monitor?.cpu} />
        <Mini label="RAM" value={monitor?.ram.percent} />
        <Mini label="DISK" value={monitor?.disk.percent} />
        <span class="mini mini--net">
          <span class="mini__top">
            <span class="mini__label">NET</span>
          </span>
          <span class="mini__rates">
            {monitor ? `↓ ${formatRate(monitor.net.dl)} · ↑ ${formatRate(monitor.net.ul)}` : '—'}
          </span>
        </span>
      </div>

      <span class="spacer" />

      {next ? (
        <span class={'next-event' + (isNow ? ' is-now' : '')}>
          <span class="next-event__label">{isNow ? 'Now' : 'Next'}</span>
          <span class="next-event__time">
            {isNow ? 'until ' + clockTime(next.end) : clockTime(next.start)}
          </span>
          <span class="next-event__name">{next.summary}</span>
        </span>
      ) : (
        <span class="status__item status__item--muted">No upcoming</span>
      )}
    </header>
  );
}

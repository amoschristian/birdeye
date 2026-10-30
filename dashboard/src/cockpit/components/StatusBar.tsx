import { useEffect, useState } from 'preact/hooks';
import type { CalendarEvent, MonitorData } from '../../types';
import { formatRate, nextEventLabel, pad } from '../helpers';

export type Condition = 'red' | 'warn' | 'ok';

interface Props {
  condition: Condition;
  connected: boolean;
  monitor: MonitorData | null;
  events: CalendarEvent[];
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

export function StatusBar({ condition, connected, monitor, events }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const flagClass =
    condition === 'warn'
      ? 'condition__flag condition__flag--warn'
      : condition === 'ok'
      ? 'condition__flag condition__flag--ok'
      : 'condition__flag';

  const flagText = condition === 'red' ? 'RED' : condition === 'warn' ? 'AMBER' : 'GREEN';

  return (
    <header class="status">
      <span class={flagClass}>{flagText}</span>

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

      <span class={connected ? 'status__item status__item--ok' : 'status__item status__item--bad'}>
        {connected ? 'LINK OK' : 'NO LINK'}
      </span>
      <span class="status__seam" />
      <span class="status__item status__item--muted">
        {nextEventLabel(events, now.getTime())}
      </span>
    </header>
  );
}

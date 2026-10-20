import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const date = `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;

  return (
    <span
      class="flex select-none items-baseline gap-2.5"
      aria-label={`${date}, ${time}`}
    >
      <span class="font-mono text-[44px] font-medium leading-none tracking-[-0.05em] tabular-nums text-signal">
        {time}
      </span>
      <span class="text-[16px] font-medium text-muted">{date}</span>
    </span>
  );
}

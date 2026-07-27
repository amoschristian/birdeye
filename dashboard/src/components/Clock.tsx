import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

export function Clock() {
  const [time, setTime] = useState(formatTime());

  useEffect(() => {
    const interval = setInterval(() => setTime(formatTime()), 10000);
    return () => clearInterval(interval);
  }, []);

  function formatTime(): string {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function formatDate(): string {
    const now = new Date();
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`;
  }

  return (
    <span class="flex items-baseline gap-3 select-none">
      <span class="text-[28px] font-bold text-[#FFB800] tabular-nums font-mono leading-none">{time}</span>
      <span class="text-[14px] font-semibold uppercase tracking-[0.08em] text-[#4A6080]">{formatDate()}</span>
    </span>
  );
}

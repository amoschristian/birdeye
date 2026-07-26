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

  return (
    <span class="text-xl font-bold text-[#e8edf2] tabular-nums select-none tracking-tight">{time}</span>
  );
}

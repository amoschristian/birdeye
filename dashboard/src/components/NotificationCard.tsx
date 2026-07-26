import { h } from 'preact';
import { useRef, useState, useEffect } from 'preact/hooks';
import type { Notification } from '../types';
import { AppIcon } from './AppIcon';

interface Props {
  notification: Notification;
  onMarkRead: (id: number) => void;
  onFocus: (appId: string) => void;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function NotificationCard({ notification, onMarkRead, onFocus }: Props) {
  const [translateX, setTranslateX] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const captured = useRef(false);
  const currentTranslateX = useRef(0);

  const didSwipe = useRef(false);

  const handleTap = () => {
    if (didSwipe.current) return;
    if (notification.is_read) return;
    onMarkRead(notification.id);
    onFocus(notification.app_id);
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (notification.is_read) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    didSwipe.current = false;
    captured.current = true;
    currentTranslateX.current = 0;

    const handleMove = (ev: PointerEvent) => {
      if (!captured.current) return;
      const deltaX = ev.clientX - startX.current;
      const deltaY = ev.clientY - startY.current;

      if (Math.abs(deltaX) < Math.abs(deltaY)) return;
      if (deltaX > 0) return;

      if (Math.abs(deltaX) > 10) didSwipe.current = true;

      const clamped = Math.max(deltaX, -120);
      currentTranslateX.current = clamped;
      setTranslateX(clamped);
    };

    const handleUp = () => {
      if (!captured.current) return;
      captured.current = false;
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);

      if (didSwipe.current && currentTranslateX.current < -80) {
        setDismissing(true);
        setTimeout(() => onMarkRead(notification.id), 300);
      } else {
        setTranslateX(0);
      }
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  };

  const handlePointerDownProxy = (e: h.JSX.TargetedPointerEvent<HTMLDivElement>) => {
    handlePointerDown(e as unknown as PointerEvent);
  };

  const handleMarkReadClick = () => {
    onMarkRead(notification.id);
  };

  const cardClass = dismissing
    ? 'transition-transform duration-300 ease-in'
    : 'transition-transform duration-200 ease-out';

  // One-shot entry animation on mount
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setEntering(false), 250);
    return () => clearTimeout(id);
  }, []);

  return (
    <div
      role="listitem"
      aria-label={
        notification.is_read
          ? `Notification from ${notification.app_name}: ${notification.summary}`
          : `Unread notification from ${notification.app_name}: ${notification.summary}`
      }
      class={`relative overflow-hidden mb-px select-none touch-pan-y ${cardClass} ${entering ? 'animate-row-enter' : ''}`}
      style={{
        transform: dismissing ? 'translateX(-100%)' : `translateX(${translateX}px)`,
      }}
    >
      {/* Swipe reveal background */}
      {!notification.is_read && translateX < 0 && (
        <div class="absolute inset-0 bg-[#4da6ff] flex items-center justify-end pr-4">
          <span class="text-[#0a0e14] font-semibold text-[13px] uppercase tracking-[0.08em]">MARK READ</span>
        </div>
      )}
      <div
        onPointerDown={handlePointerDownProxy}
        onClick={handleTap}
        class={`relative flex items-center gap-3 px-2 py-1.5 min-h-[44px] cursor-pointer border-l-[2px] transition-all duration-300 ${
          notification.is_read
            ? 'bg-[#141b24] opacity-60 border-l-transparent'
            : 'bg-[#1c2430] border-l-[#4da6ff]'
        }`}
      >
        {/* App icon */}
        <div class="shrink-0">
          <AppIcon appId={notification.app_id} class="text-[#4da6ff] w-5 h-5" />
        </div>

        {/* Summary + body */}
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2">
            <span class={`text-[13px] font-semibold uppercase tracking-[0.06em] ${notification.is_read ? 'text-[#8a9ba8]' : 'text-[#4da6ff]'}`}>
              {notification.app_name}
            </span>
            <p class={`text-[14px] font-medium leading-tight truncate ${notification.is_read ? 'text-[#8a9ba8]' : 'text-[#e8edf2]'}`}>
              {notification.summary}
            </p>
          </div>
          {notification.body && (
            <p class="text-[14px] text-[#8a9ba8] leading-snug mt-0.5 line-clamp-2 font-mono">
              {notification.body}
            </p>
          )}
        </div>

        {/* Timestamp + mark-read */}
        <div class="shrink-0 flex items-center gap-2">
          <span class="font-mono text-[13px] text-[#8a9ba8] tabular-nums">
            {formatRelativeTime(notification.created_at)}
          </span>
          {!notification.is_read && (
            <button
              onClick={handleMarkReadClick}
              class="w-6 h-6 flex items-center justify-center rounded-sm bg-[#252d38] text-[#2ecc71] hover:bg-[#2a4066] active:brightness-125 transition-all text-sm focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2"
              aria-label="Mark as read"
            >
              ✓
            </button>
          )}
        </div>

        {/* Swipe hint — only on first few cards */}
        {!notification.is_read && translateX === 0 && (
          <p class="absolute bottom-0.5 right-2 text-[11px] text-[#8a9ba8] font-mono select-none opacity-40">
            ← swipe
          </p>
        )}
      </div>
    </div>
  );
}

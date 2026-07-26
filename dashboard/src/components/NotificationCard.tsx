import { h } from 'preact';
import { useRef, useState } from 'preact/hooks';
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
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
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

      // Only horizontal swipes, leftward only
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

  return (
    <div
      role="listitem"
      aria-label={
        notification.is_read
          ? `Notification from ${notification.app_name}: ${notification.summary}`
          : `Unread notification from ${notification.app_name}: ${notification.summary}`
      }
      class={`relative overflow-hidden rounded-xl mb-2 select-none touch-pan-y ${cardClass}`}
      style={{
        transform: dismissing ? 'translateX(-100%)' : `translateX(${translateX}px)`,
      }}
    >
      <div
        onPointerDown={handlePointerDownProxy}
        onClick={handleTap}
        class={`relative p-3 min-h-16 rounded-xl border-l-[4px] cursor-pointer ${
          notification.is_read
            ? 'bg-[#1f2233] opacity-60 border-l-transparent'
            : 'bg-[#24283b] border-l-[#7aa2f7]'
        }`}
      >
        {/* Top row: icon + app name + timestamp */}
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-1.5">
            <AppIcon appId={notification.app_id} class="text-[#7aa2f7] w-5 h-5" />
            <span class={`text-sm font-medium ${notification.is_read ? 'text-[#565f89]' : 'text-[#7aa2f7]'}`}>
              {notification.app_name}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-[#565f89]">
              {formatRelativeTime(notification.created_at)}
            </span>
            {!notification.is_read && (
              <button
                onClick={handleMarkReadClick}
                class="w-6 h-6 flex items-center justify-center rounded-full bg-[#3b4261] text-[#9ece6a] hover:bg-[#4c5a9a] active:scale-90 transition-all text-sm"
                aria-label="Mark as read"
              >
                ✓
              </button>
            )}
          </div>
        </div>

        {/* Summary */}
        <p class={`text-sm font-medium leading-tight ${notification.is_read ? 'text-[#565f89]' : 'text-[#c0caf5]'}`}>
          {notification.summary}
        </p>

        {/* Body (truncated to 2 lines) */}
        {notification.body && (
          <p class="text-[13px] text-[#565f89] leading-snug mt-0.5 line-clamp-2">
            {notification.body}
          </p>
        )}

        {/* Tap to focus, swipe left to dismiss */}
        {!notification.is_read && translateX === 0 && (
          <p class="text-[10px] text-[#3b4261] mt-1 select-none">
            ◄◄◄ swipe left to mark read &middot; tap to focus & mark read
          </p>
        )}
      </div>
    </div>
  );
}

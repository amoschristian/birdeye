import { h } from 'preact';
import { useRef, useState, useEffect } from 'preact/hooks';
import type { Notification } from '../types';
import { AppIcon } from './AppIcon';

interface Props {
  notification: Notification;
  onMarkRead: (id: number) => void;
  onFocus: (appId: string, notifId?: number) => void;
  emoji?: string;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function NotificationCard({ notification, onMarkRead, onFocus, emoji }: Props) {
  const [translateX, setTranslateX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [flashFocus, setFlashFocus] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const captured = useRef(false);
  const currentTranslateX = useRef(0);
  const didSwipe = useRef(false);

  // Reset swipe state when notification becomes read (e.g. external mark-read)
  useEffect(() => {
    if (notification.is_read) {
      setTranslateX(0);
      setDismissing(false);
      setDragging(false);
      captured.current = false;
    }
  }, [notification.is_read]);

  const cleanup = () => {
    captured.current = false;
    setDragging(false);
  };

  const handleDragStart = (clientX: number, clientY: number) => {
    if (notification.is_read) return false;
    startX.current = clientX;
    startY.current = clientY;
    didSwipe.current = false;
    captured.current = true;
    currentTranslateX.current = 0;
    setTranslateX(0);
    return true;
  };

  const handleDragMove = (clientX: number, clientY: number): boolean => {
    if (!captured.current) return false;
    const deltaX = clientX - startX.current;
    const deltaY = clientY - startY.current;

    // Ignore gestures more vertical than horizontal (let browser scroll)
    if (Math.abs(deltaX) < Math.abs(deltaY)) return false;

    // Only left-swipes
    if (deltaX > 0) return false;

    if (Math.abs(deltaX) > 10) {
      didSwipe.current = true;
      setDragging(true);
    }

    const clamped = Math.max(deltaX, -120);
    currentTranslateX.current = clamped;
    setTranslateX(clamped);
    return true;
  };

  const handleDragEnd = () => {
    if (!captured.current) return;
    cleanup();

    if (didSwipe.current && currentTranslateX.current < -80) {
      setDismissing(true);
      setTimeout(() => onMarkRead(notification.id), 200);
    } else if (!didSwipe.current) {
      // Tap — mark read, focus, and flash feedback
      setTranslateX(0);
      onMarkRead(notification.id);
      onFocus(notification.app_id, notification.notif_id ?? undefined);
      setFlashFocus(true);
      setTimeout(() => setFlashFocus(false), 400);
    } else {
      setTranslateX(0);
    }
  };

  // ── Unified pointer events (mouse + touch via pointer API) ──

  const handlePointerDown = (e: PointerEvent) => {
    if (!handleDragStart(e.clientX, e.clientY)) return;

    // Prevent default on touch to stop browser scroll during horizontal swipe.
    // We conditionally allow vertical scrolling via handleDragMove checks.
    // For mouse, preventDefault on pointerdown stops text selection during drag.
    e.preventDefault();

    const handleMove = (ev: PointerEvent) => {
      const handled = handleDragMove(ev.clientX, ev.clientY);
      // Prevent scroll when handling a horizontal swipe
      if (handled) ev.preventDefault();
    };

    const handleEnd = () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleEnd);
      document.removeEventListener('pointercancel', handleEnd);
      handleDragEnd();
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleEnd);
    document.addEventListener('pointercancel', handleEnd);
  };

  const handlePointerDownProxy = (e: h.JSX.TargetedPointerEvent<HTMLDivElement>) => {
    handlePointerDown(e as unknown as PointerEvent);
  };

  const handleMarkReadClick = (e: Event) => {
    e.stopPropagation();
    onMarkRead(notification.id);
  };

  const cardClass = dismissing
    ? 'transition-transform duration-200 ease-in'
    : dragging
    ? ''
    : 'transition-transform duration-150 ease-out';

  return (
    <div
      role="listitem"
      aria-label={
        notification.is_read
          ? `Notification from ${notification.app_name}: ${notification.summary}`
          : `Unread notification from ${notification.app_name}: ${notification.summary}`
      }
      class={`relative overflow-hidden border-b border-[#162035] select-none touch-pan-y ${cardClass}`}
      style={{
        transform: dismissing ? 'translateX(-100%)' : `translateX(${translateX}px)`,
      }}
    >
      {/* Swipe reveal background */}
      {!notification.is_read && translateX < 0 && (
        <div class="absolute inset-0 bg-[#26DE81] flex items-center justify-end pr-4">
          <span class="text-[#0B1120] font-semibold text-[16px] uppercase tracking-[0.06em]">READ</span>
        </div>
      )}

      <div
        onPointerDown={handlePointerDownProxy}
        class={`relative flex items-center gap-3 px-4 py-3 min-h-[56px] cursor-pointer transition-all duration-150 ${
          notification.is_read
            ? 'bg-[#0B1120] opacity-50'
            : flashFocus
            ? 'bg-[#00D4FF]/20 border-r-2 border-r-[#00D4FF]'
            : 'bg-[#111827] hover:bg-[#1A2535] border-r-2 border-r-transparent'
        }`}
      >
        {/* App icon */}
        <div class="shrink-0 text-[#8BA3C7]">
          <AppIcon appId={notification.app_id} class="w-7 h-7" emoji={emoji} />
        </div>

        {/* Content */}
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2">
            <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#8BA3C7] shrink-0">
              {notification.app_name}
            </span>
            <p class={`text-[20px] font-medium leading-tight truncate font-mono ${
              notification.is_read ? 'text-[#8BA3C7]' : 'text-[#FFB800]'
            }`}>
              {notification.summary}
            </p>
          </div>
          {notification.body && (
            <p class="text-[18px] text-[#8BA3C7] leading-snug mt-0.5 line-clamp-2">
              {notification.body}
            </p>
          )}
        </div>

        {/* Timestamp + mark-read */}
        <div class="shrink-0 flex items-center gap-3">
          <span class="font-mono text-[16px] text-[#4A6080] tabular-nums">
            {formatRelativeTime(notification.created_at)}
          </span>
          {!notification.is_read && (
            <button
              onClick={handleMarkReadClick}
              class="w-8 h-8 flex items-center justify-center bg-[#1E3A5F] text-[#26DE81] hover:bg-[#1A2535] active:brightness-125 transition-all text-[18px] focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2"
              aria-label="Mark as read"
            >
              ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Notification, AppConfig } from '../types';
import { AppIcon } from './AppIcon';
import { NotificationCard } from './NotificationCard';

interface Props {
  appId: string;
  label: string;
  app: AppConfig | undefined;
  notifications: Notification[];
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

export function NotificationGroup({ appId, label, app, notifications, onMarkRead, onFocus }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [translateX, setTranslateX] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const captured = useRef(false);
  const currentTranslateX = useRef(0);

  const appName = label;
  const appDisplay = app?.name || appId;
  const latest = notifications[0];
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);

  const handleToggle = () => {
    // Don't toggle if we just completed a swipe
    if (didSwipe.current) return;
    setExpanded((prev) => !prev);
  };

  // Reset swipe state when notifications change (new arrivals or read-ack from server)
  const notifIdsKey = notifications.map((n) => `${n.id}:${n.is_read}`).join(',');
  useEffect(() => {
    setTranslateX(0);
    setDismissing(false);
  }, [notifIdsKey]);

  const markAllRead = () => {
    for (const id of unreadIds) onMarkRead(id);
  };

  // ── Swipe detection (pointer events) — separate from tap (onClick) ──
  const didSwipe = useRef(false);

  const handlePointerDown = (e: PointerEvent) => {
    if (unreadCount === 0) return; // nothing to swipe, let onClick handle tap
    startX.current = e.clientX;
    startY.current = e.clientY;
    didSwipe.current = false;
    captured.current = true;
    currentTranslateX.current = 0;

    const handleMove = (ev: PointerEvent) => {
      if (!captured.current) return;
      const deltaX = ev.clientX - startX.current;
      const deltaY = ev.clientY - startY.current;

      // Only horizontal, leftward swipes
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
        setTimeout(() => markAllRead(), 300);
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

  // ── Collapsed view ────────────────────────────────────────────
  if (!expanded) {
    const cardClass = dismissing
      ? 'transition-transform duration-300 ease-in'
      : 'transition-transform duration-200 ease-out';

    return (
      <div
        class={`relative overflow-hidden rounded-xl mb-2 select-none touch-pan-y ${cardClass}`}
        style={{
          transform: dismissing ? 'translateX(-100%)' : `translateX(${translateX}px)`,
        }}
      >
        {/* Swipe reveal background — only visible while swiping */}
        {unreadCount > 0 && translateX < 0 && (
          <div class="absolute inset-0 rounded-xl bg-[#9ece6a] flex items-center justify-end pr-4">
            <span class="text-[#1a1b26] font-bold text-sm">Mark all read ✓</span>
          </div>
        )}
        <div
          role="button"
          tabIndex={0}
          onPointerDown={handlePointerDownProxy}
          onClick={handleToggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleToggle();
            }
          }}
          class="relative flex items-center gap-3 p-3 rounded-xl bg-[#24283b] border border-[#33467c] hover:border-[#7aa2f7] cursor-pointer transition-colors"
        >
          <div class="shrink-0">
            <AppIcon appId={appId} class="text-[#7aa2f7] w-6 h-6" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-xs text-[#565f89]">{appDisplay}</span>
              <span class="text-sm font-semibold text-[#c0caf5]">{appName}</span>
              {unreadCount > 0 && (
                <span class="text-xs font-bold text-[#f7768e]">{unreadCount} new</span>
              )}
            </div>
            <p class="text-xs text-[#a9b1d6] truncate">{latest.summary}</p>
          </div>
          <div class="shrink-0 flex items-center gap-2">
            <span class="text-[11px] text-[#565f89]">{formatRelativeTime(latest.created_at)}</span>
          </div>
        </div>
        {/* Swipe hint */}
        {unreadCount > 0 && translateX === 0 && (
          <p class="text-[10px] text-[#3b4261] mt-1 ml-2 select-none">
            ◄◄◄ swipe left to mark all read &middot; tap to expand
          </p>
        )}
      </div>
    );
  }

  // Expanded: show individual cards
  return (
    <div class="mb-2">
      {/* Collapse header */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        class="flex items-center gap-3 p-2 rounded-xl bg-[#1f2233] border border-[#7aa2f7] cursor-pointer select-none mb-1"
      >
        <div class="shrink-0">
          <AppIcon appId={appId} class="text-[#7aa2f7] w-5 h-5" />
        </div>
        <span class="text-sm font-semibold text-[#7aa2f7]">{appName}</span>
        <span class="text-xs text-[#565f89]">{notifications.length} notifications</span>
        <div class="flex-1" />
        <span class="text-xs text-[#565f89]">▲ collapse</span>
      </div>

      {/* Individual cards with full swipe support */}
      <div class="ml-2">
        {notifications.map((n) => (
          <NotificationCard
            key={n.id}
            notification={n}
            onMarkRead={onMarkRead}
            onFocus={onFocus}
          />
        ))}
      </div>

    </div>
  );
}

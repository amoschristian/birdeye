import { h } from 'preact';
import { useRef, useState, useEffect } from 'preact/hooks';
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
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function NotificationGroup({ appId, label, app, notifications, onMarkRead, onFocus }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [translateX, setTranslateX] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const captured = useRef(false);
  const currentTranslateX = useRef(0);
  const didSwipe = useRef(false);

  const appDisplay = app?.name || appId;
  const latest = notifications[0];
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);

  const handleToggle = () => {
    if (didSwipe.current) return;
    setExpanded((prev) => !prev);
  };

  // Reset swipe state when notifications change
  const notifIdsKey = notifications.map((n) => `${n.id}:${n.is_read}`).join(',');
  useEffect(() => {
    setTranslateX(0);
    setDismissing(false);
  }, [notifIdsKey]);

  const markAllRead = () => {
    for (const id of unreadIds) onMarkRead(id);
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (unreadCount === 0) return;
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
        setTimeout(() => markAllRead(), 200);
      } else if (!didSwipe.current) {
        setTranslateX(0);
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

  // ── Collapsed ──────────────────────────────────────────
  if (!expanded) {
    const cardClass = dismissing
      ? 'transition-transform duration-200 ease-in'
      : 'transition-transform duration-150 ease-out';

    return (
      <div
        class={`relative overflow-hidden border-b border-[#162035] select-none touch-pan-y ${cardClass}`}
        style={{
          transform: dismissing ? 'translateX(-100%)' : `translateX(${translateX}px)`,
        }}
      >
        {unreadCount > 0 && translateX < 0 && (
          <div class="absolute inset-0 bg-[#26DE81] flex items-center justify-end pr-4">
            <span class="text-[#0B1120] font-semibold text-[14px] uppercase tracking-[0.06em]">READ ALL</span>
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
          class="relative flex items-center gap-3 px-3 py-2.5 min-h-[52px] bg-[#111827] hover:bg-[#1A2535] cursor-pointer transition-colors active:brightness-110 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2"
          aria-expanded={false}
        >
          <div class="shrink-0 text-[#8BA3C7]">
            <AppIcon appId={appId} class="w-6 h-6" />
          </div>
          <span class="text-[14px] font-semibold uppercase tracking-[0.06em] text-[#E8F0FE]">{appDisplay}</span>
          <span class="text-[18px] font-medium text-[#FFB800] font-mono">{label}</span>
          {unreadCount > 0 && (
            <span class="font-mono text-[18px] font-bold text-[#FFB800] tabular-nums">{unreadCount}</span>
          )}
          <div class="flex-1" />
          <span class="text-[18px] text-[#8BA3C7] truncate max-w-52 font-mono">{latest.summary}</span>
          <span class="font-mono text-[14px] text-[#4A6080] tabular-nums shrink-0">
            {formatRelativeTime(latest.created_at)}
          </span>
        </div>
      </div>
    );
  }

  // ── Expanded ───────────────────────────────────────────
  return (
    <div class="border-b border-[#162035]">
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
        class="flex items-center gap-2 px-3 py-2.5 bg-[#1E3A5F] cursor-pointer select-none active:brightness-110 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2"
        aria-expanded={true}
      >
        <div class="shrink-0 text-[#00D4FF]">
          <AppIcon appId={appId} class="w-6 h-6" />
        </div>
        <span class="text-[14px] font-semibold uppercase tracking-[0.06em] text-[#00D4FF]">{label}</span>
        <span class="font-mono text-[14px] text-[#8BA3C7]">{notifications.length}</span>
        <div class="flex-1" />
        <span class="text-[14px] font-semibold uppercase tracking-[0.06em] text-[#8BA3C7]">COLLAPSE</span>
      </div>

      {notifications.map((n) => (
        <NotificationCard
          key={n.id}
          notification={n}
          onMarkRead={onMarkRead}
          onFocus={onFocus}
        />
      ))}
    </div>
  );
}

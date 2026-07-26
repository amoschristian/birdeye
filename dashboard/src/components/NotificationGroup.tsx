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
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function NotificationGroup({ appId, label, app, notifications, onMarkRead, onFocus }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [translateX, setTranslateX] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const [entering, setEntering] = useState(true);
  const startX = useRef(0);
  const startY = useRef(0);
  const captured = useRef(false);
  const currentTranslateX = useRef(0);

  // One-shot entry animation on mount
  useEffect(() => {
    const id = setTimeout(() => setEntering(false), 250);
    return () => clearTimeout(id);
  }, []);

  const appName = label;
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

  // ── Swipe detection ──────────────────────────────────
  const didSwipe = useRef(false);

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

  // ── Collapsed view ──────────────────────────────────
  if (!expanded) {
    const cardClass = dismissing
      ? 'transition-transform duration-300 ease-in'
      : 'transition-transform duration-200 ease-out';

    return (
      <div
        class={`relative overflow-hidden mb-px select-none touch-pan-y ${cardClass} ${entering ? 'animate-row-enter' : ''}`}
        style={{
          transform: dismissing ? 'translateX(-100%)' : `translateX(${translateX}px)`,
        }}
      >
        {/* Swipe reveal background */}
        {unreadCount > 0 && translateX < 0 && (
          <div class="absolute inset-0 bg-[#2ecc71] flex items-center justify-end pr-4">
            <span class="text-[#0a0e14] font-semibold text-[13px] uppercase tracking-[0.08em]">READ ALL</span>
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
          class="relative flex items-center gap-3 px-2 py-1.5 min-h-[44px] bg-[#141b24] border-b border-[#252d38] hover:bg-[#1c2430] cursor-pointer transition-colors active:brightness-110 focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2"
          aria-expanded={false}
        >
          <div class="shrink-0">
            <AppIcon appId={appId} class="text-[#4da6ff] w-5 h-5" />
          </div>
          <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#8a9ba8]">{appDisplay}</span>
          <span class="text-[14px] font-medium text-[#c8d6e0]">{appName}</span>
          {unreadCount > 0 && (
            <span class="font-mono text-[13px] font-bold text-[#ff8c42]">{unreadCount}</span>
          )}
          <div class="flex-1" />
          <span class="text-[14px] text-[#c8d6e0] truncate max-w-48">{latest.summary}</span>
          <span class="font-mono text-[13px] text-[#8a9ba8] tabular-nums shrink-0">
            {formatRelativeTime(latest.created_at)}
          </span>
        </div>
      </div>
    );
  }

  // ── Expanded view ──────────────────────────────────
  return (
    <div class="mb-1">
      {/* Panel header */}
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
        class="flex items-center gap-2 px-2 py-1.5 bg-[#1c2430] border-b-2 border-[#4da6ff] cursor-pointer select-none active:brightness-110 focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2"
        aria-expanded={true}
      >
        <div class="shrink-0">
          <AppIcon appId={appId} class="text-[#4da6ff] w-5 h-5" />
        </div>
        <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#4da6ff]">{appName}</span>
        <span class="font-mono text-[13px] text-[#8a9ba8]">{notifications.length}</span>
        <div class="flex-1" />
        <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#8a9ba8]">▲ COLLAPSE</span>
      </div>

      {/* Individual cards with staggered entry */}
      <div class="animate-stagger">
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

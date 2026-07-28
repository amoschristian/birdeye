import { h } from 'preact';
import { useRef, useState, useEffect, useCallback } from 'preact/hooks';
import { Manager } from 'fngr';
import { PanRecognizer } from 'fngr/pan';
import { TapRecognizer } from 'fngr/tap';
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

  const groupRef = useRef<HTMLDivElement>(null);

  // Stable callback refs
  const onMarkReadRef = useRef(onMarkRead);
  onMarkReadRef.current = onMarkRead;

  // Current unread IDs — kept in a ref so gesture callbacks see live data
  const unreadIdsRef = useRef<number[]>([]);
  unreadIdsRef.current = notifications.filter((n) => !n.is_read).map((n) => n.id);

  const unreadCount = unreadIdsRef.current.length;

  // Prevent tap from firing after a pan
  const didPanRef = useRef(false);
  const isExpandedRef = useRef(expanded);
  isExpandedRef.current = expanded;

  const appDisplay = app?.name || appId;
  const latest = notifications[0];

  const handleToggle = useCallback(() => {
    if (didPanRef.current) return;
    setExpanded((prev) => !prev);
  }, []);

  // Reset swipe state when notifications change or all become read
  const notifIdsKey = notifications.map((n) => `${n.id}:${n.is_read}`).join(',');
  useEffect(() => {
    setTranslateX(0);
    setDismissing(false);
    didPanRef.current = false;
  }, [notifIdsKey, unreadCount]);

  // Wire up fngr for the collapsed group swipe
  useEffect(() => {
    const el = groupRef.current;
    if (!el) return;

    const manager = new Manager(el);
    (el as HTMLElement).style.touchAction = 'pan-y';

    const pan = new PanRecognizer({
      direction: 'horizontal',
      threshold: 8,
      onPanstart() {
        if (unreadCount === 0) return;
        didPanRef.current = true;
      },
      onPanmove(e) {
        if (unreadCount === 0) return;
        if (e.deltaX > 0) return;
        const clamped = Math.max(e.deltaX, -120);
        setTranslateX(clamped);
      },
      onPanend(e) {
        if (unreadCount === 0) return;
        const shouldDismiss = e.deltaX < -80 || e.velocityX < -0.4;
        if (shouldDismiss) {
          setDismissing(true);
          const ids = unreadIdsRef.current;
          setTimeout(() => {
            for (const id of ids) onMarkReadRef.current(id);
          }, 200);
        } else {
          setTranslateX(0);
        }
      },
      onPancancel() {
        if (unreadCount === 0) return;
        setTranslateX(0);
      },
    });
    manager.add(pan);

    const tap = new TapRecognizer({
      threshold: 10,
      interval: 300,
      onTap(e) {
        if (didPanRef.current) return;
        // Ignore taps originating from child buttons
        const target = e.srcEvent.target as HTMLElement | null;
        if (target?.closest('button')) return;
        handleToggle();
      },
    });
    tap.requireFailureOf(pan);
    manager.add(tap);

    return () => manager.destroy();
  }, [expanded]); // re-create when expanded toggles (DOM element changes)

  // ── Collapsed ──────────────────────────────────────────
  if (!expanded) {
    const cardClass = dismissing
      ? 'transition-transform duration-200 ease-in'
      : 'transition-transform duration-150 ease-out';

    return (
      <div
        ref={groupRef}
        class={`relative overflow-hidden border-b border-[#162035] select-none ${cardClass}`}
        style={{
          transform: dismissing ? 'translateX(-100%)' : `translateX(${translateX}px)`,
        }}
      >
        {unreadCount > 0 && translateX < 0 && (
          <div class="absolute inset-0 bg-[#26DE81] flex items-center justify-end pr-4">
            <span class="text-[#0B1120] font-semibold text-[16px] uppercase tracking-[0.06em]">READ ALL</span>
          </div>
        )}
        <div
          role="button"
          tabIndex={0}
          class="relative flex items-center gap-3 px-4 py-3 min-h-[56px] bg-[#111827] hover:bg-[#1A2535] cursor-pointer transition-colors active:brightness-110 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2"
          aria-expanded={false}
        >
          <div class="shrink-0 text-[#8BA3C7]">
            <AppIcon appId={appId} class="w-7 h-7" emoji={app?.icon} />
          </div>
          <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#E8F0FE]">{appDisplay}</span>
          <span class="text-[20px] font-medium text-[#FFB800] font-mono">{label}</span>
          {unreadCount > 0 && (
            <span class="font-mono text-[20px] font-bold text-[#FFB800] tabular-nums">{unreadCount}</span>
          )}
          <div class="flex-1" />
          <span class="text-[20px] text-[#8BA3C7] truncate max-w-52 font-mono">{latest.summary}</span>
          <span class="font-mono text-[16px] text-[#4A6080] tabular-nums shrink-0">
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
          <AppIcon appId={appId} class="w-7 h-7" emoji={app?.icon} />
        </div>
        <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#00D4FF]">{label}</span>
        <span class="font-mono text-[16px] text-[#8BA3C7]">{notifications.length}</span>
        <div class="flex-1" />
        <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#8BA3C7]">COLLAPSE</span>
      </div>

      {notifications.map((n) => (
        <NotificationCard
          key={n.id}
          notification={n}
          onMarkRead={onMarkRead}
          onFocus={onFocus}
          emoji={app?.icon}
        />
      ))}
    </div>
  );
}

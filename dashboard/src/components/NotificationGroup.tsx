import { h } from 'preact';
import { useRef, useState, useCallback } from 'preact/hooks';
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
  const [readAllFired, setReadAllFired] = useState(false);

  const onMarkReadRef = useRef(onMarkRead);
  onMarkReadRef.current = onMarkRead;

  const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
  const unreadCount = unreadIds.length;
  const importantCount = notifications.filter((n) => !n.is_read && n.is_important).length;

  const appDisplay = app?.name || appId;
  const latest = notifications[0];

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleReadAll = useCallback((e: Event) => {
    e.stopPropagation();
    if (readAllFired) return;
    setReadAllFired(true);
    for (const id of unreadIds) {
      onMarkReadRef.current(id);
    }
    // Reset after a beat so rapid double-taps don't double-fire
    setTimeout(() => setReadAllFired(false), 600);
  }, [unreadIds, readAllFired]);

  // ── Collapsed ──────────────────────────────────────────
  if (!expanded) {
    return (
      <div class="relative overflow-hidden border-b border-[#162035] select-none">
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
          class="relative flex items-center gap-3 px-4 py-3 min-h-[56px] bg-[#111827] hover:bg-[#1A2535] cursor-pointer transition-colors active:brightness-110 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2"
          aria-expanded={false}
        >
          <div class="shrink-0 text-[#8BA3C7]">
            <AppIcon appId={appId} class="w-7 h-7" emoji={app?.icon} />
          </div>
          <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#E8F0FE]">{appDisplay}</span>
          <span class="text-[20px] font-medium text-[#FFB800] font-mono">{label}</span>
          {importantCount > 0 && (
            <span class="font-mono text-[18px] font-bold text-[#FF4757] tabular-nums">!{importantCount}</span>
          )}
          {unreadCount > 0 && (
            <span class="font-mono text-[20px] font-bold text-[#FFB800] tabular-nums">{unreadCount}</span>
          )}
          <div class="flex-1" />
          <span class="text-[20px] text-[#8BA3C7] truncate max-w-52 font-mono">{latest.summary}</span>
          <span class="font-mono text-[16px] text-[#4A6080] tabular-nums shrink-0">
            {formatRelativeTime(latest.created_at)}
          </span>
          {unreadCount > 0 && (
            <button
              onClick={handleReadAll}
              class="shrink-0 px-3 py-1.5 text-[16px] font-semibold uppercase tracking-[0.06em] bg-[#26DE81] text-[#0B1120] hover:brightness-110 active:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-[#26DE81] focus-visible:outline-offset-2"
              aria-label={`Mark all ${unreadCount} as read`}
            >
              READ
            </button>
          )}
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
        {unreadCount > 0 && (
          <button
            onClick={handleReadAll}
            class="shrink-0 px-3 py-1.5 mr-2 text-[16px] font-semibold uppercase tracking-[0.06em] bg-[#26DE81] text-[#0B1120] hover:brightness-110 active:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-[#26DE81] focus-visible:outline-offset-2"
            aria-label={`Mark all ${unreadCount} as read`}
          >
            READ ALL
          </button>
        )}
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

import { h } from 'preact';
import { useRef, useState, useCallback } from 'preact/hooks';
import { Check } from 'lucide-preact';
import type { Notification, AppConfig } from '../types';
import { appBrandColor } from '../utils/appVisuals';
import { formatRelativeTime } from '../utils/time';
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

export function NotificationGroup({ appId, label, app, notifications, onMarkRead, onFocus }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [readAllFired, setReadAllFired] = useState(false);

  const onMarkReadRef = useRef(onMarkRead);
  onMarkReadRef.current = onMarkRead;

  const unreadIds = notifications.filter((notification) => !notification.is_read).map((notification) => notification.id);
  const unreadCount = unreadIds.length;
  const importantCount = notifications.filter((notification) => !notification.is_read && notification.is_important).length;

  const appDisplay = app?.name || appId;
  const latest = notifications[0];
  const brand = appBrandColor(appId);

  const handleToggle = useCallback(() => {
    setExpanded((previous) => !previous);
  }, []);

  const handleReadAll = useCallback((event: Event) => {
    event.stopPropagation();
    if (readAllFired) return;
    setReadAllFired(true);
    for (const id of unreadIds) {
      onMarkReadRef.current(id);
    }
    // Reset after a beat so rapid double-taps don't double-fire
    setTimeout(() => setReadAllFired(false), 600);
  }, [unreadIds, readAllFired]);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) return;
    event.preventDefault();
    handleToggle();
  };

  if (!expanded) {
    return (
      <div class="relative overflow-hidden border-b border-line/40">
        <span
          class="absolute bottom-0 left-0 top-0 w-[3px]"
          style={{ backgroundColor: brand, opacity: unreadCount > 0 ? 0.8 : 0.25 }}
          aria-hidden="true"
        />

        <div
          role="button"
          tabIndex={0}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          aria-expanded={false}
          class="flex min-h-[84px] cursor-pointer items-center gap-3 py-2.5 pl-5 pr-3 transition-colors hover:bg-surface/50 active:bg-surface/70 focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-[-2px]"
        >
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] border border-line/40 bg-ink/60">
            <AppIcon appId={appId} class="h-[26px] w-[26px]" emoji={app?.icon} name={appDisplay} />
          </span>

          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-1.5">
              <span class="truncate text-[17px] font-semibold text-text">{appDisplay}</span>
              {label && <span class="truncate text-[17px] text-muted">· {label}</span>}
              {importantCount > 0 && (
                <span
                  class="shrink-0 rounded-[4px] border border-alert/40 px-1.5 py-0.5 font-mono text-[14px] font-semibold leading-none text-alert"
                  title={`${importantCount} important`}
                >
                  !{importantCount}
                </span>
              )}
            </div>
            <p class="mt-1 truncate text-[20px] text-muted">{latest.summary}</p>
          </div>

          <div class="flex shrink-0 flex-col items-end gap-1">
            <span class="font-mono text-[15px] text-faint">
              {formatRelativeTime(latest.created_at)}
            </span>
            {unreadCount > 0 ? (
              <span class="rounded-[5px] bg-signal/15 px-1.5 py-0.5 font-mono text-[14px] font-semibold text-signal">
                {unreadCount} new
              </span>
            ) : (
              <span class="text-[14px] text-faint">read</span>
            )}
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleReadAll}
              class="flex min-h-[48px] shrink-0 items-center gap-1.5 rounded-[8px] border border-ok/25 bg-ok/10 px-3 text-[15px] font-semibold text-ok transition-colors hover:bg-ok/15 active:scale-[0.98]"
              aria-label={`Mark all ${unreadCount} as read`}
            >
              <Check size={18} />
              Read
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div class="border-b border-line/40">
      <div class="relative overflow-hidden bg-raised/60">
        <span
          class="absolute bottom-0 left-0 top-0 w-[3px]"
          style={{ backgroundColor: brand, opacity: 0.9 }}
          aria-hidden="true"
        />
        <div
          role="button"
          tabIndex={0}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          aria-expanded={true}
          class="flex min-h-[64px] cursor-pointer items-center gap-3 py-2 pl-5 pr-3 transition-colors hover:bg-raised active:brightness-110 focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-[-2px]"
        >
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-line/60 bg-ink/60">
            <AppIcon appId={appId} class="h-5 w-5" emoji={app?.icon} name={appDisplay} />
          </span>

          <span class="min-w-0 flex-1 truncate text-[17px] font-semibold text-text">
            {appDisplay}
            {label && <span class="font-normal text-muted"> · {label}</span>}
          </span>

          <span class="shrink-0 font-mono text-[15px] text-faint">{notifications.length}</span>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleReadAll}
              class="flex min-h-[48px] shrink-0 items-center gap-1.5 rounded-[8px] border border-ok/25 bg-ok/10 px-3 text-[15px] font-semibold text-ok transition-colors hover:bg-ok/15 active:scale-[0.98]"
              aria-label={`Mark all ${unreadCount} as read`}
            >
              <Check size={18} />
              Read all
            </button>
          )}

          <span class="shrink-0 px-1 text-[15px] font-medium text-muted">Collapse</span>
        </div>
      </div>

      {notifications.map((notification) => (
        <NotificationCard
          key={notification.id}
          notification={notification}
          onMarkRead={onMarkRead}
          onFocus={onFocus}
          emoji={app?.icon}
        />
      ))}
    </div>
  );
}

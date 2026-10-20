import { h } from 'preact';
import { useRef, useState, useEffect } from 'preact/hooks';
import { Manager } from 'fngr';
import { PanRecognizer } from 'fngr/pan';
import { TapRecognizer } from 'fngr/tap';
import { Check } from 'lucide-preact';
import type { Notification } from '../types';
import { appBrandColor } from '../utils/appVisuals';
import { formatRelativeTime } from '../utils/time';
import { AppIcon } from './AppIcon';

interface Props {
  notification: Notification;
  onMarkRead: (id: number) => void;
  onFocus: (appId: string, notifId?: number) => void;
  emoji?: string;
}

export function NotificationCard({ notification, onMarkRead, onFocus, emoji }: Props) {
  const [translateX, setTranslateX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const brand = appBrandColor(notification.app_id);

  // Stable callback refs so fngr recognizers always call the latest props
  const onMarkReadRef = useRef(onMarkRead);
  onMarkReadRef.current = onMarkRead;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  const isReadRef = useRef(notification.is_read);
  isReadRef.current = notification.is_read;

  const didPanRef = useRef(false);

  useEffect(() => {
    if (notification.is_read) {
      setTranslateX(0);
      setDismissing(false);
      setDragging(false);
      didPanRef.current = false;
    }
  }, [notification.is_read]);

  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;

    const manager = new Manager(element);

    // Let vertical scroll pass through to the feed.
    (element as HTMLElement).style.touchAction = 'pan-y';

    const pan = new PanRecognizer({
      direction: 'all',
      threshold: 20,
      onPanstart() {
        if (isReadRef.current) return;
        setDragging(true);
      },
      onPanmove(event) {
        if (isReadRef.current) return;
        const absDx = Math.abs(event.deltaX);
        const absDy = Math.abs(event.deltaY);
        if (absDx < absDy || event.deltaX > 0) return;
        didPanRef.current = true;
        event.preventDefault();
        setTranslateX(Math.max(event.deltaX, -120));
      },
      onPanend(event) {
        if (isReadRef.current) return;
        setDragging(false);
        if (!didPanRef.current) {
          setTranslateX(0);
          return;
        }
        const shouldDismiss = event.deltaX < -80 || event.velocityX < -0.4;
        if (shouldDismiss) {
          setDismissing(true);
          const id = notification.id;
          setTimeout(() => onMarkReadRef.current(id), 200);
        } else {
          setTranslateX(0);
        }
      },
      onPancancel() {
        if (isReadRef.current) return;
        setDragging(false);
        setTranslateX(0);
      },
    });
    manager.add(pan);

    const tap = new TapRecognizer({
      threshold: 22,
      interval: 350,
      onTap(event) {
        if (isReadRef.current) return;
        if (didPanRef.current) return;

        const target = event.srcEvent.target as HTMLElement | null;
        if (target?.closest('[data-action="mark-read"]')) return;

        setTranslateX(0);
        onMarkReadRef.current(notification.id);
        onFocusRef.current(notification.app_id, notification.notif_id ?? undefined);
      },
    });
    tap.requireFailureOf(pan);
    manager.add(tap);

    return () => manager.destroy();
  }, []); // mount/unmount only — props flow through refs

  const handleMarkReadClick = (event: Event) => {
    event.stopPropagation();
    onMarkRead(notification.id);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (isReadRef.current) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-action="mark-read"]')) return;
    event.preventDefault();
    onMarkReadRef.current(notification.id);
    onFocusRef.current(notification.app_id, notification.notif_id ?? undefined);
  };

  const slideClass = dismissing
    ? 'transition-transform duration-200 ease-in'
    : dragging
    ? 'transition-transform duration-0'
    : 'transition-transform duration-150 ease-out';

  const contentTransform = dismissing ? 'translateX(-100%)' : `translateX(${translateX}px)`;
  const edgeColor = notification.is_important ? 'var(--color-alert)' : brand;

  return (
    <div
      ref={cardRef}
      role="listitem"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={
        notification.is_read
          ? `Read notification from ${notification.app_name}: ${notification.summary}`
          : `Unread notification from ${notification.app_name}: ${notification.summary}`
      }
      class={`relative overflow-hidden border-b border-line/40 outline-none transition-colors focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-[-2px] ${
        notification.is_read ? '' : 'bg-surface/25'
      }`}
    >
      {!notification.is_read && (
        <span
          class="absolute bottom-0 left-0 top-0 w-[3px]"
          style={{ backgroundColor: edgeColor, opacity: notification.is_important ? 1 : 0.7 }}
          aria-hidden="true"
        />
      )}

      {!notification.is_read && (dragging || dismissing || translateX < 0) && (
        <div class="absolute inset-0 flex items-center justify-end bg-ok pr-4">
          <span class="text-[15px] font-semibold text-ink">Mark read</span>
        </div>
      )}

      <div
        class={`relative flex min-h-[84px] items-start gap-3 py-3 pl-5 pr-4 transition-colors hover:bg-surface/50 ${
          notification.is_read ? 'cursor-default' : 'cursor-pointer'
        } ${slideClass}`}
        style={{ transform: contentTransform }}
      >
        <span class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-line/40 bg-ink/60">
          <AppIcon
            appId={notification.app_id}
            class="h-[26px] w-[26px]"
            emoji={emoji}
            name={notification.app_name}
          />
        </span>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate text-[16px] font-medium text-muted">{notification.app_name}</span>
            <span class="font-mono text-[15px] text-faint">
              {formatRelativeTime(notification.created_at)}
            </span>
            {notification.is_important && !notification.is_read && (
              <span class="rounded-[4px] border border-alert/40 px-1.5 py-0.5 text-[14px] font-semibold leading-none text-alert">
                Important
              </span>
            )}
          </div>

          <p
            class={`mt-1 line-clamp-2 text-[23px] leading-snug ${
              notification.is_read ? 'text-muted' : 'font-medium text-text'
            }`}
          >
            {notification.summary}
          </p>

          {notification.body && (
            <p class="mt-1 text-[19px] leading-snug text-muted line-clamp-2">
              {notification.body}
            </p>
          )}
        </div>

        {!notification.is_read && (
          <button
            type="button"
            data-action="mark-read"
            onClick={handleMarkReadClick}
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] border border-ok/25 bg-ok/10 text-ok transition-all hover:bg-ok/15 active:scale-95"
            aria-label="Mark as read"
          >
            <Check size={20} />
          </button>
        )}
      </div>
    </div>
  );
}

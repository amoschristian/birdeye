import { h } from 'preact';
import { useRef, useState, useEffect } from 'preact/hooks';
import { Manager } from 'fngr';
import { PanRecognizer } from 'fngr/pan';
import { TapRecognizer } from 'fngr/tap';
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

  const cardRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<Manager | null>(null);

  // Stable callback refs so fngr recognizers always call the latest props
  const onMarkReadRef = useRef(onMarkRead);
  onMarkReadRef.current = onMarkRead;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  // Ref to check read state inside gesture callbacks
  const isReadRef = useRef(notification.is_read);
  isReadRef.current = notification.is_read;

  // Prevent tap from firing after a pan gesture
  const didPanRef = useRef(false);

  // Reset swipe state when notification becomes read externally
  useEffect(() => {
    if (notification.is_read) {
      setTranslateX(0);
      setDismissing(false);
      setDragging(false);
      didPanRef.current = false;
    }
  }, [notification.is_read]);

  // Wire up fngr gesture recognizers
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const manager = new Manager(el);
    managerRef.current = manager;

    // Allow vertical scroll to pass through to browser.
    // Manager sets touch-action:none in constructor; override to pan-y
    // so the scrollable parent can still scroll when the touch starts here.
    (el as HTMLElement).style.touchAction = 'pan-y';

    // ── Pan (swipe to reveal READ) ──────────────────────────
    // Use direction 'all' because 'horizontal' checks at threshold only:
    // if the first 20px of movement is slightly more vertical (common on
    // touchscreen — diagonal start), the pan fails instantly with no recovery.
    // With 'all' we track every pan and filter direction in onPanmove.
    const pan = new PanRecognizer({
      direction: 'all',
      threshold: 20,
      onPanstart(_e) {
        if (isReadRef.current) return;
        setDragging(true);
        // didPanRef not set here — threshold-cross with immediate lift
        // is still a tap. Only mark on actual onPanmove.
      },
      onPanmove(e) {
        if (isReadRef.current) return;
        // Only consider horizontal swipes that are predominantly leftward.
        // Allow vertical scroll to pass through without marking didPanRef —
        // this keeps tap alive for scroll-and-then-tap interactions.
        const absDx = Math.abs(e.deltaX);
        const absDy = Math.abs(e.deltaY);
        if (absDx < absDy || e.deltaX > 0) return;
        // Now we're in a definite left swipe — lock out tap and suppress
        // browser scroll so the card tracks the finger cleanly.
        didPanRef.current = true;
        e.preventDefault();
        const clamped = Math.max(e.deltaX, -120);
        setTranslateX(clamped);
      },
      onPanend(e) {
        if (isReadRef.current) return;
        setDragging(false);
        if (!didPanRef.current) {
          // Never entered horizontal mode — just a vertical scroll.
          setTranslateX(0);
          return;
        }
        // Dismiss on distance (>80px) OR fast flick (>0.4 px/ms leftward)
        const shouldDismiss = e.deltaX < -80 || e.velocityX < -0.4;
        if (shouldDismiss) {
          setDismissing(true);
          const id = notification.id;
          setTimeout(() => onMarkReadRef.current(id), 200);
        } else {
          setTranslateX(0);
        }
      },
      onPancancel(_e) {
        if (isReadRef.current) return;
        setDragging(false);
        setTranslateX(0);
      },
    });
    manager.add(pan);

    // ── Tap ─────────────────────────────────────────────────
    const tap = new TapRecognizer({
      threshold: 22,
      interval: 350,
      onTap(e) {
        if (isReadRef.current) return;
        if (didPanRef.current) return;

        // Ignore taps on the mark-read ✓ button
        const target = e.srcEvent.target as HTMLElement | null;
        if (target?.closest('[data-action="mark-read"]')) return;

        setTranslateX(0);
        onMarkReadRef.current(notification.id);
        onFocusRef.current(notification.app_id, notification.notif_id ?? undefined);
        setFlashFocus(true);
        setTimeout(() => setFlashFocus(false), 400);
      },
    });
    // Tap defers to pan — if the user swipes, tap won't fire.
    tap.requireFailureOf(pan);
    manager.add(tap);

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, []); // mount/unmount only — callbacks are via refs

  const handleMarkReadClick = (e: Event) => {
    e.stopPropagation();
    onMarkRead(notification.id);
  };

  // Keep transition-transform always present so the browser tracks the
  // property between frames. Vary duration: 0 during drag (instant follow),
  // 200ms for dismiss animation, 150ms for snap-back.
  const slideClass = dismissing
    ? 'transition-transform duration-200 ease-in'
    : dragging
    ? 'transition-transform duration-0'
    : 'transition-transform duration-150 ease-out';

  const contentTransform = dismissing
    ? 'translateX(-100%)'
    : `translateX(${translateX}px)`;

  return (
    <div
      ref={cardRef}
      role="listitem"
      aria-label={
        notification.is_read
          ? `Notification from ${notification.app_name}: ${notification.summary}`
          : `Unread notification from ${notification.app_name}: ${notification.summary}`
      }
      class="relative overflow-hidden border-b border-[#162035] select-none"
    >
      {/* Swipe reveal background — pinned to card container */}
      {!notification.is_read && (dragging || dismissing || translateX < 0) && (
        <div class="absolute inset-0 bg-[#26DE81] flex items-center justify-end pr-4">
          <span class="text-[#0B1120] font-semibold text-[16px] uppercase tracking-[0.06em]">READ</span>
        </div>
      )}

      {/* Content layer — translates, revealing the green bg behind it */}
      <div
        class={`relative flex items-center gap-3 px-4 py-3 min-h-[56px] cursor-pointer select-none ${slideClass}`}
        style={{ transform: contentTransform }}
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
              data-action="mark-read"
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

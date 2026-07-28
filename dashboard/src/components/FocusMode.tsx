import { h } from 'preact';
import { useRef, useState, useEffect } from 'preact/hooks';
import { Manager } from 'fngr';
import { PanRecognizer } from 'fngr/pan';
import { TapRecognizer } from 'fngr/tap';
import type { Notification, TodoItem, AppConfig } from '../types';
import { AppIcon } from './AppIcon';

interface Props {
  unreadNotifications: Notification[];
  doFirstTodos: TodoItem[];
  apps: AppConfig[];
  onMarkRead: (id: number) => void;
  onFocus: (appId: string, notifId?: number) => void;
  onToggleTodo: (id: number) => void;
  sessionCleared: number;
  sessionFocused: number;
  sessionCompleted: number;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateBadge(dueDate: string | null): { text: string; isOverdue: boolean; isToday: boolean } {
  if (!dueDate) return { text: '', isOverdue: false, isToday: false };
  const today = todayStr();
  if (dueDate < today) return { text: 'OVERDUE', isOverdue: true, isToday: false };
  if (dueDate === today) return { text: 'TODAY', isOverdue: false, isToday: true };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  if (dueDate === tomorrowStr) return { text: 'TOMORROW', isOverdue: false, isToday: false };

  const d = new Date(dueDate + 'T00:00:00');
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return { text: `${days[d.getDay()]} ${d.getDate()}`, isOverdue: false, isToday: false };
}

export function FocusMode({
  unreadNotifications,
  doFirstTodos,
  apps,
  onMarkRead,
  onFocus,
  onToggleTodo,
  sessionCleared,
  sessionFocused,
  sessionCompleted,
}: Props) {
  const [animating, setAnimating] = useState<'left' | 'right' | null>(null);
  const [todoDoneAnimating, setTodoDoneAnimating] = useState(false);
  const [todoSkipKey, setTodoSkipKey] = useState(0);
  const [swipeTranslate, setSwipeTranslate] = useState(0);

  const cardRef = useRef<HTMLDivElement>(null);

  const hasUnread = unreadNotifications.length > 0;
  const hasDoFirst = doFirstTodos.length > 0;
  const allClear = !hasUnread && !hasDoFirst;

  const currentNotif = hasUnread ? unreadNotifications[0] : null;
  const currentTodo = !hasUnread && hasDoFirst ? doFirstTodos[0] : null;

  // Stable refs for callbacks and current data
  const onMarkReadRef = useRef(onMarkRead);
  onMarkReadRef.current = onMarkRead;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const currentNotifRef = useRef(currentNotif);
  currentNotifRef.current = currentNotif;
  const hasUnreadRef = useRef(hasUnread);
  hasUnreadRef.current = hasUnread;

  const handleDismiss = () => {
    const n = currentNotifRef.current;
    if (!n) return;
    setAnimating('left');
    setSwipeTranslate(0);
    setTimeout(() => {
      onMarkReadRef.current(n.id);
      setAnimating(null);
    }, 200);
  };

  const handleOpen = () => {
    const n = currentNotifRef.current;
    if (!n) return;
    setAnimating('right');
    setSwipeTranslate(0);
    setTimeout(() => {
      onMarkReadRef.current(n.id);
      onFocusRef.current(n.app_id, n.notif_id ?? undefined);
      setAnimating(null);
    }, 200);
  };

  const handleTodoDone = () => {
    if (!currentTodo) return;
    const id = currentTodo.id;
    setTodoDoneAnimating(true);
    setTimeout(() => {
      onToggleTodo(id);
      setTodoDoneAnimating(false);
    }, 200);
  };

  const handleTodoSkip = () => {
    if (doFirstTodos.length <= 1) return;
    setTodoSkipKey((k) => k + 1);
  };

  // Reset swipe translate when the current notification changes
  useEffect(() => {
    setSwipeTranslate(0);
  }, [currentNotif?.id]);

  // Wire up fngr for bidirectional swipe + tap on the notification card
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const manager = new Manager(el);
    // Allow vertical scroll in the body area to pass through
    (el as HTMLElement).style.touchAction = 'pan-y';

    const pan = new PanRecognizer({
      direction: 'horizontal',
      threshold: 8,
      onPanstart() {
        if (!hasUnreadRef.current) return;
      },
      onPanmove(e) {
        if (!hasUnreadRef.current) return;
        // Bidirectional: clamp between -200 and 200
        const clamped = Math.max(-200, Math.min(200, e.deltaX));
        setSwipeTranslate(clamped);
      },
      onPanend(e) {
        if (!hasUnreadRef.current) return;

        if (e.deltaX < -80 || e.velocityX < -0.4) {
          // Swipe left → dismiss
          handleDismiss();
        } else if (e.deltaX > 80 || e.velocityX > 0.4) {
          // Swipe right → open/focus
          handleOpen();
        } else if (Math.abs(e.deltaX) < 20) {
          // Tiny movement → treat as tap → open/focus
          handleOpen();
        } else {
          // Partial swipe → snap back
          setSwipeTranslate(0);
        }
      },
      onPancancel() {
        setSwipeTranslate(0);
      },
    });
    manager.add(pan);

    const tap = new TapRecognizer({
      threshold: 10,
      interval: 300,
      onTap() {
        if (!hasUnreadRef.current) return;
        handleOpen();
      },
    });
    tap.requireFailureOf(pan);
    manager.add(tap);

    return () => manager.destroy();
  }, []); // mount/unmount only — callbacks via refs

  // Rotate todos for the skip feature
  const rotatedTodos = todoSkipKey > 0 && doFirstTodos.length > 1
    ? [...doFirstTodos.slice(todoSkipKey % doFirstTodos.length), ...doFirstTodos.slice(0, todoSkipKey % doFirstTodos.length)]
    : doFirstTodos;
  const visibleTodo = rotatedTodos[0] || null;

  const dateBadge = visibleTodo ? formatDateBadge(visibleTodo.due_date) : null;

  return (
    <div class='flex-1 flex items-center justify-center bg-[#0B1120]'>
      {/* ── ALL CLEAR ─────────────────────────────────────────── */}
      {allClear && (
        <div class="flex flex-col items-center gap-6 text-center px-8 animate-fade-in">
          <span class="text-[28px] font-bold text-[#FFB800] font-mono leading-none">ALL CLEAR</span>
          <div class="flex flex-wrap justify-center gap-x-6 gap-y-1 text-[18px] text-[#8BA3C7] font-mono">
            {sessionCleared > 0 && <span>{sessionCleared} cleared</span>}
            {sessionFocused > 0 && <span>{sessionFocused} focused</span>}
            {sessionCompleted > 0 && <span>{sessionCompleted} done</span>}
            {sessionCleared === 0 && sessionFocused === 0 && sessionCompleted === 0 && (
              <span class="text-[#4A6080]">No activity this session</span>
            )}
          </div>
        </div>
      )}

      {/* ── Todo card (no unread, has DO FIRST) ────────────────── */}
      {!hasUnread && hasDoFirst && visibleTodo && (
        <div class="flex flex-col items-center gap-4 px-6 w-full max-w-md max-h-[calc(100%-16px)]">
          <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#4A6080]">
            NO NOTIFICATIONS
          </span>
          <div
            class={`w-full bg-[#111827] border border-[#1E3A5F] flex flex-col shrink-0 transition-all duration-200 ${
              todoDoneAnimating ? 'opacity-0 -translate-y-2' : ''
            }`}
          >
            <div class="flex items-start gap-3 px-5 pt-4 pb-2">
              <span class="w-6 h-6 border-2 border-[#FF4757] shrink-0 mt-0.5" />
              <span class="text-[22px] font-medium text-[#E8F0FE] leading-snug font-mono line-clamp-2">
                {visibleTodo.text}
              </span>
            </div>

            <div class="flex items-center gap-3 ml-9 pb-4 px-5">
              <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#FFB800]">
                HIGH
              </span>
              {dateBadge?.text && (
                <span class={`text-[16px] font-semibold uppercase tracking-[0.06em] ${
                  dateBadge.isOverdue ? 'text-[#FF4757]' : dateBadge.isToday ? 'text-[#FF9F43]' : 'text-[#8BA3C7]'
                }`}>
                  · {dateBadge.text}
                </span>
              )}
            </div>
          </div>

          <div class="flex gap-4 w-full justify-center shrink-0">
            <button
              onClick={handleTodoDone}
              class="px-8 py-3 text-[18px] font-semibold uppercase tracking-[0.06em] bg-[#26DE81] text-[#0B1120] active:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-[#26DE81] focus-visible:outline-offset-2"
            >
              DONE
            </button>
            {doFirstTodos.length > 1 && (
              <button
                onClick={handleTodoSkip}
                class="px-8 py-3 text-[18px] font-semibold uppercase tracking-[0.06em] bg-[#1E3A5F] text-[#8BA3C7] active:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2"
              >
                SKIP
              </button>
            )}
          </div>

          {doFirstTodos.length > 1 && (
            <div class="flex gap-1.5 shrink-0">
              {doFirstTodos.map((_, i) => (
                <span
                  key={i}
                  class={`block w-2 h-2 transition-colors duration-200 ${
                    i === (todoSkipKey % doFirstTodos.length)
                      ? 'bg-[#FFB800]'
                      : 'bg-[#1E3A5F]'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Notification card ──────────────────────────────────── */}
      {hasUnread && currentNotif && (
        <div class="flex flex-col items-center gap-3 px-6 w-full max-w-lg">
          {/* Swipe hint row */}
          <div class="flex items-center justify-between w-full shrink-0">
            <span class="text-[14px] font-semibold uppercase tracking-[0.06em] text-[#4A6080]">◄ DISMISS</span>
            <span class="text-[14px] font-semibold uppercase tracking-[0.06em] text-[#4A6080]">OPEN ►</span>
          </div>

          <div
            ref={cardRef}
            class={`w-full bg-[#111827] border border-[#1E3A5F] flex flex-col max-h-[320px] select-none cursor-grab ${
              animating === 'left' ? '-translate-x-full opacity-0' :
              animating === 'right' ? 'translate-x-full opacity-0' : ''
            }`}
            style={{
              transform: swipeTranslate !== 0
                ? `translateX(${swipeTranslate}px)`
                : undefined,
              transition: animating
                ? 'all 200ms ease-in'
                : swipeTranslate === 0
                ? 'transform 150ms ease-out'
                : undefined,
            }}
          >
            {/* App header */}
            <div class="flex items-center gap-3 px-5 pt-4 pb-2 shrink-0">
              <div class="text-[#8BA3C7]">
                <AppIcon appId={currentNotif.app_id} class="w-7 h-7" emoji={apps.find((a) => a.id === currentNotif.app_id)?.icon} />
              </div>
              <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#8BA3C7]">
                {currentNotif.app_name}
              </span>
              <span class="ml-auto font-mono text-[14px] text-[#4A6080]">
                {formatRelativeTime(currentNotif.created_at)}
              </span>
            </div>

            {/* Summary */}
            <p class="text-[22px] font-medium leading-tight text-[#FFB800] font-mono px-5 pb-2 line-clamp-2 shrink-0">
              {currentNotif.summary}
            </p>

            {/* Body — scrollable; touch-action: pan-y so horizontal pan still works */}
            {currentNotif.body && (
              <div class="flex-1 min-h-0 mx-5 mb-4 overflow-y-auto max-h-[160px] custom-scrollbar"
                   style="touch-action: pan-y">
                <p class="text-[16px] text-[#8BA3C7] leading-relaxed pb-2">
                  {currentNotif.body}
                </p>
              </div>
            )}
          </div>

          {/* Progress dots */}
          <div class="flex items-center gap-3 shrink-0">
            {unreadNotifications.length > 1 ? (
              <div class="flex gap-1.5">
                {unreadNotifications.map((_, i) => (
                  <span
                    key={i}
                    class={`block w-2 h-2 ${i === 0 ? 'bg-[#FFB800]' : 'bg-[#1E3A5F]'}`}
                  />
                ))}
              </div>
            ) : (
              <span class="font-mono text-[14px] text-[#4A6080]">
                Last one
              </span>
            )}
            <span class="font-mono text-[14px] text-[#4A6080]">
              {unreadNotifications.length > 1
                ? `${unreadNotifications.length} remaining`
                : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

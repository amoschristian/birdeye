import { h } from 'preact';
import { useRef, useState, useEffect, useCallback } from 'preact/hooks';
import { Manager } from 'fngr';
import { PanRecognizer } from 'fngr/pan';
import { TapRecognizer } from 'fngr/tap';
import Sortable from 'sortablejs';
import type { Notification, TodoItem, TodoStatus, AppConfig, SubtaskItem } from '../types';
import { AppIcon } from './AppIcon';

interface Props {
  unreadNotifications: Notification[];
  doFirstTodos: TodoItem[];
  apps: AppConfig[];
  onMarkRead: (id: number) => void;
  onFocus: (appId: string, notifId?: number) => void;
  onToggleTodo: (id: number) => void;
  onSetStatus: (id: number, status: TodoStatus) => void;
  onSetNotes: (id: number, notes: string) => void;
  addSubtask: (todoId: number, text: string) => void;
  editSubtask: (id: number, text: string) => void;
  toggleSubtask: (id: number) => void;
  deleteSubtask: (id: number) => void;
  reorderSubtask: (id: number, orderIndex: number) => void;
  sessionCleared: number;
  sessionFocused: number;
  sessionCompleted: number;
}

// Sort notifications: important ones first, then by recency
function sortUnreadNotifications(notifications: Notification[]): Notification[] {
  return [...notifications].sort((a, b) => {
    // Important notifications always come first
    if (a.is_important && !b.is_important) return -1;
    if (!a.is_important && b.is_important) return 1;
    // Within same importance tier, newest first
    return b.created_at - a.created_at;
  });
}

// ── Helpers ───────────────────────────────────────────────────────

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

// ── Drag handle icon ──────────────────────────────────────────────

function DragHandle() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" class="pointer-events-none">
      <rect x="2" y="1" width="10" height="2" rx="1" fill="currentColor"/>
      <rect x="2" y="6" width="10" height="2" rx="1" fill="currentColor"/>
      <rect x="2" y="11" width="10" height="2" rx="1" fill="currentColor"/>
    </svg>
  );
}

// ── Checkbox icon ─────────────────────────────────────────────────

function CheckedIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 5L4 7L8 3" stroke="#0B1120" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────

export function FocusMode({
  unreadNotifications,
  doFirstTodos,
  apps,
  onMarkRead,
  onFocus,
  onToggleTodo,
  onSetStatus,
  onSetNotes,
  addSubtask,
  editSubtask,
  toggleSubtask,
  deleteSubtask,
  reorderSubtask,
  sessionCleared,
  sessionFocused,
  sessionCompleted,
}: Props) {
  // ── State ────────────────────────────────────────────────
  const [animating, setAnimating] = useState<'left' | 'right' | null>(null);
  const [swipeTranslate, setSwipeTranslate] = useState(0);
  const [todoSkipKey, setTodoSkipKey] = useState(0);
  const [todoDoneAnimating, setTodoDoneAnimating] = useState(false);
  const [subtaskText, setSubtaskText] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<number | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNote, setEditingNote] = useState(false);

  // ── Refs ──────────────────────────────────────────────────
  const cardRef = useRef<HTMLDivElement>(null);
  const subtaskListRef = useRef<HTMLDivElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Stable refs for callbacks consumed in fngr/Sortable closures
  const onMarkReadRef = useRef(onMarkRead);
  onMarkReadRef.current = onMarkRead;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const currentNotifRef = useRef<Notification | null>(null);
  const hasUnreadRef = useRef(false);

  // ── Derived data ──────────────────────────────────────────
  // Sort: important notifications first, then by recency
  const sortedNotifications = sortUnreadNotifications(unreadNotifications);
  const hasUnread = sortedNotifications.length > 0;
  const hasDoFirst = doFirstTodos.length > 0;
  const allClear = !hasUnread && !hasDoFirst;
  const showSplit = hasUnread && hasDoFirst;
  const showNotifOnly = hasUnread && !hasDoFirst;
  const showTodoOnly = !hasUnread && hasDoFirst;

  const currentNotif = hasUnread ? sortedNotifications[0] : null;

  // Rotate todos for the skip feature
  const rotatedTodos = todoSkipKey > 0 && doFirstTodos.length > 1
    ? [
        ...doFirstTodos.slice(todoSkipKey % doFirstTodos.length),
        ...doFirstTodos.slice(0, todoSkipKey % doFirstTodos.length),
      ]
    : doFirstTodos;
  const visibleTodo = rotatedTodos[0] || null;

  // Keep refs current for async callbacks
  currentNotifRef.current = currentNotif;
  hasUnreadRef.current = hasUnread;

  // Reset skip key when the doFirst list identity changes (todos added/completed)
  useEffect(() => {
    setTodoSkipKey(0);
  }, [doFirstTodos.map((t) => t.id).join(',')]);

  // Reset swipe translate when current notification changes
  useEffect(() => {
    setSwipeTranslate(0);
  }, [currentNotif?.id]);

  // Sync note draft when the focused todo changes
  useEffect(() => {
    setNoteDraft(visibleTodo?.notes || '');
    setEditingNote(false);
  }, [visibleTodo?.id]);

  // ── Notification handlers ────────────────────────────────

  const handleDismiss = useCallback(() => {
    const n = currentNotifRef.current;
    if (!n) return;
    setAnimating('left');
    setSwipeTranslate(0);
    setTimeout(() => {
      onMarkReadRef.current(n.id);
      setAnimating(null);
    }, 200);
  }, []);

  const handleOpen = useCallback(() => {
    const n = currentNotifRef.current;
    if (!n) return;
    setAnimating('right');
    setSwipeTranslate(0);
    setTimeout(() => {
      onMarkReadRef.current(n.id);
      onFocusRef.current(n.app_id, n.notif_id ?? undefined);
      setAnimating(null);
    }, 200);
  }, []);

  // ── Todo handlers ─────────────────────────────────────────

  const handleTodoDone = useCallback(() => {
    if (!visibleTodo) return;
    const id = visibleTodo.id;
    setTodoDoneAnimating(true);
    setTimeout(() => {
      onToggleTodo(id);
      setTodoDoneAnimating(false);
    }, 200);
  }, [visibleTodo, onToggleTodo]);

  const handleTodoWait = useCallback(() => {
    if (!visibleTodo) return;
    onSetStatus(visibleTodo.id, 'waiting');
    setSubtaskText('');
  }, [visibleTodo, onSetStatus]);

  const handleTodoReopen = useCallback(() => {
    if (!visibleTodo) return;
    onSetStatus(visibleTodo.id, 'active');
  }, [visibleTodo, onSetStatus]);

  const handleTodoNote = useCallback((note: string) => {
    if (!visibleTodo) return;
    onSetNotes(visibleTodo.id, note);
  }, [visibleTodo, onSetNotes]);

  const handleTodoSkip = useCallback(() => {
    if (doFirstTodos.length <= 1) return;
    setTodoSkipKey((k) => k + 1);
    setSubtaskText('');
  }, [doFirstTodos.length]);

  // ── Subtask handlers ──────────────────────────────────────

  const handleAddSubtask = useCallback(() => {
    const text = subtaskText.trim();
    if (!text || !visibleTodo) return;
    if ((visibleTodo.subtasks || []).length >= 20) return;
    addSubtask(visibleTodo.id, text);
    setSubtaskText('');
    // Keep focus on input after adding
    requestAnimationFrame(() => addInputRef.current?.focus());
  }, [subtaskText, visibleTodo, addSubtask]);

  const handleAddKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSubtask();
    }
  }, [handleAddSubtask]);

  const handleToggleSubtask = useCallback((s: SubtaskItem) => {
    toggleSubtask(s.id);
  }, [toggleSubtask]);

  const handleDeleteSubtask = useCallback((s: SubtaskItem) => {
    deleteSubtask(s.id);
  }, [deleteSubtask]);

  // ── Subtask edit handlers ────────────────────────────────────

  const handleStartEditSubtask = (s: SubtaskItem, e: Event) => {
    e.stopPropagation();
    setEditingSubtaskId(s.id);
    setEditingSubtaskText(s.text);
  };

  const handleCommitEditSubtask = () => {
    const trimmed = editingSubtaskText.trim();
    if (trimmed && editingSubtaskId !== null) {
      editSubtask(editingSubtaskId, trimmed);
    }
    setEditingSubtaskId(null);
    setEditingSubtaskText('');
  };

  const handleCancelEditSubtask = () => {
    setEditingSubtaskId(null);
    setEditingSubtaskText('');
  };

  const handleEditKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommitEditSubtask();
    } else if (e.key === 'Escape') {
      handleCancelEditSubtask();
    }
  };

  // ── fngr: swipe + tap on notification card ─────────────────

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const manager = new Manager(el);
    (el as HTMLElement).style.touchAction = 'pan-y';

    const didPanRef = { current: false };

    const pan = new PanRecognizer({
      direction: 'all',
      threshold: 20,
      onPanstart() {
        if (!hasUnreadRef.current) return;
      },
      onPanmove(e) {
        if (!hasUnreadRef.current) return;
        if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
        didPanRef.current = true;
        e.preventDefault();
        const clamped = Math.max(-200, Math.min(200, e.deltaX));
        setSwipeTranslate(clamped);
      },
      onPanend(e) {
        if (!hasUnreadRef.current) return;
        if (!didPanRef.current) {
          setSwipeTranslate(0);
          return;
        }
        if (e.deltaX < -80 || e.velocityX < -0.4) {
          handleDismiss();
        } else if (e.deltaX > 80 || e.velocityX > 0.4) {
          handleOpen();
        } else {
          setSwipeTranslate(0);
        }
      },
      onPancancel() {
        setSwipeTranslate(0);
      },
    });
    manager.add(pan);

    const tap = new TapRecognizer({
      threshold: 22,
      interval: 350,
      onTap() {
        if (!hasUnreadRef.current || didPanRef.current) return;
        handleOpen();
      },
    });
    tap.requireFailureOf(pan);
    manager.add(tap);

    return () => manager.destroy();
  }, [currentNotif?.id, handleDismiss, handleOpen]);

  // ── SortableJS: subtask reorder ───────────────────────────

  useEffect(() => {
    const el = subtaskListRef.current;
    if (!el || !visibleTodo) return;

    const sortable = Sortable.create(el, {
      group: 'subtasks',
      handle: '.drag-handle',
      animation: 150,
      delay: 50,
      delayOnTouchOnly: true,
      touchStartThreshold: 3,
      onEnd: (evt) => {
        const subtaskId = parseInt(evt.item.dataset.subtaskId || '', 10);
        if (!subtaskId || isNaN(subtaskId)) return;

        const newIndex = evt.newDraggableIndex ?? evt.newIndex ?? 0;
        const siblings = Array.from(el.querySelectorAll('[data-subtask-id]'));

        let newOrderIndex: number;
        if (newIndex <= 0) {
          const nextVal = parseInt(siblings[1]?.getAttribute('data-order') || '100', 10);
          newOrderIndex = nextVal - 10;
        } else if (newIndex >= siblings.length - 1) {
          const prevVal = parseInt(siblings[siblings.length - 2]?.getAttribute('data-order') || '0', 10);
          newOrderIndex = prevVal + 10;
        } else {
          const prevVal = parseInt(siblings[newIndex - 1].getAttribute('data-order') || '0', 10);
          const nextVal = parseInt(siblings[newIndex + 1].getAttribute('data-order') || '100', 10);
          newOrderIndex = Math.floor((prevVal + nextVal) / 2);
        }

        reorderSubtask(subtaskId, newOrderIndex);
      },
    });

    return () => sortable.destroy();
  }, [visibleTodo?.id, reorderSubtask]);

  // ── Derived subtask data ──────────────────────────────────

  const subtasks = (visibleTodo?.subtasks || [])
    .slice()
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.order_index - b.order_index;
    });
  const completedCount = subtasks.filter((s) => s.completed).length;
  const totalCount = subtasks.length;
  const canAddSubtask = visibleTodo && totalCount < 20;

  // ── Todo helpers ──────────────────────────────────────────

  const dateBadge = visibleTodo ? formatDateBadge(visibleTodo.due_date) : null;

  // ── Priority color ────────────────────────────────────────

  const priorityColor = visibleTodo?.priority === 'high'
    ? '#FF4757'
    : visibleTodo?.priority === 'medium'
    ? '#8BA3C7'
    : '#00D4FF';

  // ── Render: ALL CLEAR ─────────────────────────────────────

  if (allClear) {
    return (
      <div class="flex-1 flex items-center justify-center bg-[#0B1120]">
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
      </div>
    );
  }

  // ── Render helpers ────────────────────────────────────────

  // Shared: notification panel (left side or full-width)
  const renderNotificationPanel = (fullWidth: boolean) => (
    <div class={`flex flex-col ${fullWidth ? 'flex-1 items-center justify-center' : 'flex-1 min-w-0'} ${!fullWidth ? 'px-3' : ''}`}>
      {fullWidth && (
        <div class="flex flex-col items-center gap-3 w-full max-w-lg">
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
            <div class="flex items-center gap-3 px-5 pt-4 pb-2 shrink-0">
              <div class="text-[#8BA3C7]">
                <AppIcon appId={currentNotif!.app_id} class="w-7 h-7" emoji={apps.find((a) => a.id === currentNotif!.app_id)?.icon} />
              </div>
              <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#8BA3C7]">
                {currentNotif!.app_name}
              </span>
              {currentNotif!.is_important && (
                <span class="ml-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#FF4757] border border-[#FF4757] px-1.5 py-0.5 leading-none">
                  IMPORTANT
                </span>
              )}
              <span class="ml-auto font-mono text-[14px] text-[#4A6080]">
                {formatRelativeTime(currentNotif!.created_at)}
              </span>
            </div>

            <p class="text-[22px] font-medium leading-tight text-[#FFB800] font-mono px-5 pb-2 line-clamp-2 shrink-0">
              {currentNotif!.summary}
            </p>

            {currentNotif!.body && (
              <div class="flex-1 min-h-0 mx-5 mb-4 overflow-y-auto max-h-[160px] custom-scrollbar"
                   style="touch-action: pan-y">
                <p class="text-[16px] text-[#8BA3C7] leading-relaxed pb-2">
                  {currentNotif!.body}
                </p>
              </div>
            )}
          </div>

        </div>
      )}

      {!fullWidth && currentNotif && (
        <div class="flex flex-col min-h-0 flex-1 justify-center">
          <div class="flex items-center justify-between shrink-0 py-1">
            <span class="text-[14px] font-semibold uppercase tracking-[0.06em] text-[#4A6080]">◄ DISMISS</span>
            <span class="text-[14px] font-semibold uppercase tracking-[0.06em] text-[#4A6080]">OPEN ►</span>
          </div>

          <div
            ref={cardRef}
            class={`bg-[#111827] border border-[#1E3A5F] flex flex-col select-none cursor-grab shrink-0 ${
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
            <div class="flex items-center gap-2 px-3 pt-3 pb-1 shrink-0">
              <div class="text-[#8BA3C7] shrink-0">
                <AppIcon appId={currentNotif.app_id} class="w-5 h-5" emoji={apps.find((a) => a.id === currentNotif.app_id)?.icon} />
              </div>
              <span class="text-[14px] font-semibold uppercase tracking-[0.06em] text-[#8BA3C7] truncate">
                {currentNotif.app_name}
              </span>
              {currentNotif.is_important && (
                <span class="shrink-0 ml-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#FF4757] border border-[#FF4757] px-1 py-0.5 leading-none">
                  IMP
                </span>
              )}
              <span class="ml-auto font-mono text-[14px] text-[#4A6080] shrink-0">
                {formatRelativeTime(currentNotif.created_at)}
              </span>
            </div>

            <p class="text-[18px] font-medium leading-snug text-[#FFB800] font-mono px-3 pb-1 line-clamp-2 shrink-0">
              {currentNotif.summary}
            </p>

            {currentNotif.body && (
              <div class="mx-3 mb-3 overflow-y-auto max-h-[80px] custom-scrollbar"
                   style="touch-action: pan-y">
                <p class="text-[16px] text-[#8BA3C7] leading-relaxed">
                  {currentNotif.body}
                </p>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );

  // Shared: task breakdown panel (right side or full-width)
  const renderTaskPanel = (fullWidth: boolean) => {
    if (!visibleTodo) return null;

    return (
      <div class={`flex flex-col flex-1 min-w-0 min-h-0 ${fullWidth ? 'max-w-[500px] mx-auto w-full px-4' : ''}`}>
        {/* ── "NO NOTIFICATIONS" label (when todo-only) ──────────── */}
        {fullWidth && !hasUnread && (
          <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#4A6080] text-center shrink-0 py-2">
            NO NOTIFICATIONS
          </span>
        )}

        {/* ── Task header ─────────────────────────────────────────── */}
        <div class={`shrink-0 ${fullWidth ? 'border border-[#1E3A5F] bg-[#111827] px-4 pt-3 pb-2' : 'border-b border-[#1E3A5F] px-3 py-2'}`}>
          <div class="flex items-start gap-2">
            <span
              class="w-5 h-5 border-2 shrink-0 mt-0.5"
              style={{ borderColor: priorityColor, backgroundColor: visibleTodo.completed ? priorityColor : 'transparent' }}
            />
            <span class="text-[20px] font-medium text-[#E8F0FE] leading-snug font-mono break-words flex-1 min-w-0">
              {visibleTodo.text}
            </span>
          </div>
          <div class="flex items-center gap-2 mt-1 ml-7">
            <span
              class="text-[14px] font-semibold uppercase tracking-[0.06em]"
              style={{ color: priorityColor }}
            >
              {visibleTodo.priority}
            </span>
            <span
              class="text-[14px] font-semibold uppercase tracking-[0.06em]"
              style={{
                color:
                  visibleTodo.status === 'waiting' ? '#FF9F43'
                  : visibleTodo.status === 'inbox' ? '#8BA3C7'
                  : visibleTodo.status === 'completed' ? '#26DE81'
                  : '#00D4FF',
              }}
            >
              · {visibleTodo.status.toUpperCase()}
            </span>
            {dateBadge?.text && (
              <span class={`text-[14px] font-semibold uppercase tracking-[0.06em] ${
                dateBadge.isOverdue ? 'text-[#FF4757]' : dateBadge.isToday ? 'text-[#FF9F43]' : 'text-[#8BA3C7]'
              }`}>
                · {dateBadge.text}
              </span>
            )}
          </div>

          {/* Manually typed note after conversation review */}
          {editingNote ? (
            <div class="mt-1 ml-7 flex gap-1">
              <input
                type="text"
                value={noteDraft}
                onInput={(e) => setNoteDraft((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleTodoNote(noteDraft.trim());
                    setEditingNote(false);
                  }
                  if (e.key === 'Escape') setEditingNote(false);
                }}
                onBlur={() => {
                  handleTodoNote(noteDraft.trim());
                  setEditingNote(false);
                }}
                autofocus
                maxLength={500}
                placeholder="Note / source reference…"
                class="flex-1 min-w-0 bg-[#0B1120] text-[#E8F0FE] text-[16px] px-2 py-1 border border-[#00D4FF] placeholder-[#4A6080] outline-none font-mono"
              />
            </div>
          ) : (
            <button
              onClick={() => setEditingNote(true)}
              class="mt-1 ml-7 max-w-full truncate text-left text-[15px] text-[#8BA3C7] font-mono px-2 py-1 border border-[#1E3A5F] bg-[#0B1120] active:border-[#00D4FF] transition-colors"
            >
              {visibleTodo.notes ? visibleTodo.notes : '＋ NOTE / SOURCE…'}
            </button>
          )}
        </div>

        {/* ── Subtask list (scrollable, SortableJS) ───────────────── */}
        <div
          ref={subtaskListRef}
          class="flex-1 overflow-y-auto min-h-0 px-2 py-1 custom-scrollbar"
        >
          {totalCount === 0 && (
            <p class="text-[16px] text-[#4A6080] text-center mt-4 select-none uppercase tracking-[0.06em] font-semibold">
              NO STEPS YET
            </p>
          )}
          {subtasks.map((s) => (
            <div
              key={s.id}
              data-subtask-id={s.id}
              data-order={s.order_index}
              class={`flex items-start gap-1.5 py-2 px-1 border-b border-[#162035] min-h-[44px] ${
                s.completed ? 'opacity-50' : ''
              }`}
            >
              {/* Drag handle */}
              <span
                class="drag-handle text-[#4A6080] active:text-[#8BA3C7] transition-colors cursor-grab active:cursor-grabbing shrink-0 flex items-center justify-center w-[28px] h-[44px] -mt-[4px] -ml-[4px]"
                style="touch-action: none"
                aria-label="Drag to reorder"
                title="Drag to reorder"
              >
                <DragHandle />
              </span>

              {/* Checkbox */}
              <button
                onClick={(e) => { e.stopPropagation(); handleToggleSubtask(s); }}
                class="shrink-0 flex items-center justify-center w-[44px] h-[44px] -mt-[4px] -ml-[4px] focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-1"
                aria-label={s.completed ? 'Mark incomplete' : 'Mark complete'}
              >
                <span
                  class={`w-[18px] h-[18px] border-2 shrink-0 flex items-center justify-center transition-colors ${
                    s.completed
                      ? 'bg-[#26DE81] border-[#26DE81]'
                      : 'border-[#1E3A5F]'
                  }`}
                >
                  {s.completed && <CheckedIcon />}
                </span>
              </button>

              {/* Edit / Text */}
              {editingSubtaskId === s.id ? (
                <input
                  type="text"
                  value={editingSubtaskText}
                  onInput={(e) => setEditingSubtaskText((e.target as HTMLInputElement).value)}
                  onKeyDown={handleEditKeyDown}
                  onBlur={handleCommitEditSubtask}
                  onClick={(e) => e.stopPropagation()}
                  class="flex-1 bg-[#111827] text-[#E8F0FE] text-[18px] px-1.5 py-0.5 border border-[#00D4FF] outline-none min-w-0 font-mono"
                  autofocus
                />
              ) : (
                <span class={`flex-1 min-w-0 py-[10px] text-[18px] leading-snug font-mono break-words select-none ${
                  s.completed ? 'text-[#4A6080] line-through' : 'text-[#E8F0FE]'
                }`}>
                  {s.text}
                </span>
              )}

              {/* Edit */}
              <button
                onClick={(e) => handleStartEditSubtask(s, e)}
                class="shrink-0 flex items-center justify-center w-[44px] h-[44px] -mt-[4px] text-[#4A6080] active:text-[#00D4FF] transition-colors focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-1"
                aria-label="Edit step"
                title="Edit step"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 12H4L10 6L8 4L2 10V12ZM8.5 5.5L10 4L8.5 2.5L7 4L8.5 5.5Z" fill="currentColor"/>
                </svg>
              </button>

              {/* Delete */}
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteSubtask(s); }}
                class="shrink-0 flex items-center justify-center w-[44px] h-[44px] -mt-[4px] -mr-[4px] text-[#4A6080] active:text-[#FF4757] transition-colors focus-visible:outline-2 focus-visible:outline-[#FF4757] focus-visible:outline-offset-1"
                aria-label="Delete step"
                title="Delete step"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* ── Progress ───────────────────────────────────────────── */}
        {totalCount > 0 && (
          <div class="shrink-0 px-3 py-1 border-t border-[#162035]">
            <span class="font-mono text-[13px] text-[#FFB800]">
              {completedCount}/{totalCount} STEPS
            </span>
          </div>
        )}

        {/* ── Add subtask input ──────────────────────────────────── */}
        {canAddSubtask && (
          <div class={`shrink-0 flex gap-1 px-2 py-1 min-h-[44px] border-t border-[#162035] ${fullWidth ? 'border border-[#1E3A5F] bg-[#111827] mt-1' : ''}`}>
            <input
              ref={addInputRef}
              type="text"
              value={subtaskText}
              onInput={(e) => setSubtaskText((e.target as HTMLInputElement).value)}
              onKeyDown={handleAddKeyDown}
              placeholder="Add step…"
              class="flex-1 bg-[#0B1120] text-[#E8F0FE] text-[18px] px-2 py-1 border border-[#1E3A5F] placeholder-[#4A6080] outline-none focus:border-[#00D4FF] transition-colors min-h-[44px] font-mono"
              maxLength={200}
            />
            <button
              onClick={handleAddSubtask}
              disabled={!subtaskText.trim() || totalCount >= 20}
              class="px-3 py-1 text-[16px] font-semibold uppercase tracking-[0.06em] bg-[#00D4FF] text-[#0B1120] active:brightness-125 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 min-h-[44px] focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
            >
              ADD
            </button>
          </div>
        )}

        {/* ── DONE / SKIP ─────────────────────────────────────────── */}
        <div class={`shrink-0 flex flex-col gap-2 px-2 py-2 ${fullWidth ? '' : 'border-t border-[#1E3A5F]'}`}>
          <div class={`flex gap-2 ${fullWidth ? 'justify-center' : ''}`}>
            {visibleTodo.completed ? (
              <button
                onClick={handleTodoReopen}
                class={`px-6 py-2 text-[18px] font-semibold uppercase tracking-[0.06em] bg-[#00D4FF] text-[#0B1120] active:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2 ${
                  fullWidth ? 'flex-1 max-w-[200px]' : 'flex-1'
                }`}
              >
                REOPEN
              </button>
            ) : (
              <>
                <button
                  onClick={handleTodoDone}
                  class={`px-6 py-2 text-[18px] font-semibold uppercase tracking-[0.06em] bg-[#26DE81] text-[#0B1120] active:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-[#26DE81] focus-visible:outline-offset-2 ${
                    fullWidth ? 'flex-1 max-w-[200px]' : 'flex-1'
                  }`}
                >
                  DONE
                </button>
                <button
                  onClick={handleTodoWait}
                  class={`px-6 py-2 text-[18px] font-semibold uppercase tracking-[0.06em] bg-[#1E3A5F] text-[#FF9F43] active:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2 ${
                    fullWidth ? 'flex-1 max-w-[200px]' : 'flex-1'
                  }`}
                >
                  WAIT
                </button>
              </>
            )}
            {!visibleTodo.completed && doFirstTodos.length > 1 && (
              <button
                onClick={handleTodoSkip}
                class={`px-6 py-2 text-[18px] font-semibold uppercase tracking-[0.06em] bg-[#1E3A5F] text-[#8BA3C7] active:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2 ${
                  fullWidth ? 'flex-1 max-w-[200px]' : 'flex-1'
                }`}
              >
                SKIP
              </button>
            )}
          </div>

          {doFirstTodos.length > 1 && (
            <div class="flex gap-1.5 justify-center shrink-0">
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
      </div>
    );
  };

  // ── Layout decisions ────────────────────────────────────────

  return (
    <div class="flex-1 flex bg-[#0B1120] overflow-hidden">
      {/* ── SPLIT: notifications + task breakdown ─────────────── */}
      {showSplit && (
        <>
          <div class="flex-1 flex flex-col border-r border-[#1E3A5F] overflow-hidden px-2 py-2">
            {renderNotificationPanel(false)}
          </div>
          <div class="flex-1 flex flex-col overflow-hidden">
            {renderTaskPanel(false)}
          </div>
        </>
      )}

      {/* ── NOTIFICATIONS ONLY ────────────────────────────────── */}
      {showNotifOnly && (
        <div class="flex-1 flex items-center justify-center">
          {renderNotificationPanel(true)}
        </div>
      )}

      {/* ── TASK ONLY ─────────────────────────────────────────── */}
      {showTodoOnly && (
        <div class="flex-1 flex flex-col overflow-hidden">
          {renderTaskPanel(true)}
        </div>
      )}
    </div>
  );
}

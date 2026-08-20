import { useRef, useState, useEffect } from 'preact/hooks';
import Sortable from 'sortablejs';
import type { TodoItem, TodoStatus, SubtaskItem } from '../types';

interface TodoPageProps {
  todos: TodoItem[];
  onAdd: (text: string) => void;
  onToggle: (id: number) => void;
  onEdit: (id: number, text: string) => void;
  onDelete: (id: number) => void;
  onSetPriority: (id: number, priority: 'high' | 'medium' | 'low') => void;
  onSetDueDate: (id: number, dueDate: string | null) => void;
  onSetStatus: (id: number, status: TodoStatus) => void;
  onSetNotes: (id: number, notes: string) => void;
  onSetProject: (id: number, project: string) => void;
  onSetEstimate: (id: number, estimateMinutes: number | null) => void;
  onSetSchedule: (id: number, scheduledDate: string | null, scheduledTime: string | null) => void;
  onSetReminder: (id: number, reminderAt: number | null) => void;
  onSetRepeatRule: (id: number, repeatRule: string | null) => void;
  onReorder: (id: number, orderIndex: number) => void;
  addSubtask: (todoId: number, text: string) => void;
  toggleSubtask: (id: number) => void;
  editSubtask: (id: number, text: string) => void;
  deleteSubtask: (id: number) => void;
}

type QuadrantId = 'do-first' | 'schedule' | 'decide' | 'eliminate';
type TodoView = 'inbox' | 'today' | 'upcoming' | 'matrix';

interface QuadrantDef {
  id: QuadrantId;
  label: string;
  accent: string;
}

const QUADRANTS: QuadrantDef[] = [
  { id: 'do-first', label: 'DO FIRST', accent: '#FF4757' },
  { id: 'schedule', label: 'SCHEDULE', accent: '#00D4FF' },
  { id: 'decide', label: 'DECIDE', accent: '#26DE81' },
  { id: 'eliminate', label: 'ELIMINATE', accent: '#4A6080' },
];

const VIEW_TABS: { id: TodoView; label: string }[] = [
  { id: 'inbox', label: 'INBOX' },
  { id: 'today', label: 'TODAY' },
  { id: 'upcoming', label: 'UPCOMING' },
  { id: 'matrix', label: 'MATRIX' },
];

const STATUS_ORDER: TodoStatus[] = ['inbox', 'active', 'waiting', 'completed'];

const STATUS_META: Record<TodoStatus, { label: string; color: string }> = {
  inbox: { label: 'INBOX', color: '#8BA3C7' },
  active: { label: 'ACTIVE', color: '#00D4FF' },
  waiting: { label: 'WAITING', color: '#FF9F43' },
  completed: { label: 'DONE', color: '#26DE81' },
  archived: { label: 'ARCHIVED', color: '#4A6080' },
};

// ── Date helpers ────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateBadge(dueDate: string | null): { text: string; isOverdue: boolean; isToday: boolean } {
  if (!dueDate) return { text: '', isOverdue: false, isToday: false };
  const today = todayStr();
  if (dueDate < today) return { text: 'OVERDUE', isOverdue: true, isToday: false };
  if (dueDate === today) return { text: 'TODAY', isOverdue: false, isToday: true };

  const tomorrowStr = daysFromNow(1);
  if (dueDate === tomorrowStr) return { text: 'TOMORROW', isOverdue: false, isToday: false };

  const d = new Date(dueDate + 'T00:00:00');
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return { text: `${days[d.getDay()]} ${d.getDate()}`, isOverdue: false, isToday: false };
}

function formatSchedule(todo: TodoItem): string | null {
  if (!todo.scheduled_date) return null;
  const d = new Date(todo.scheduled_date + 'T00:00:00');
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const date = `${days[d.getDay()]} ${d.getDate()}`;
  return todo.scheduled_time ? `${date} ${todo.scheduled_time}` : date;
}

function formatReminderLabel(reminderAt: number | null): string | null {
  if (!reminderAt) return null;
  const d = new Date(reminderAt * 1000);
  const now = new Date();
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const today = todayStr();
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (day === today) return `TODAY ${hm}`;
  if (day === daysFromNow(1)) return `TOMORROW ${hm}`;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${d.getDate()} ${months[d.getMonth()]} ${hm}`;
}

function parseRepeatRule(rule: string | null): { freq: string; interval: number; weekdays: number[] | null; end_date: string | null } | null {
  if (!rule) return null;
  try {
    const r = JSON.parse(rule);
    if (!r || typeof r !== 'object' || !r.freq) return null;
    return {
      freq: r.freq,
      interval: r.interval || 1,
      weekdays: Array.isArray(r.weekdays) ? r.weekdays : null,
      end_date: r.end_date || null,
    };
  } catch {
    return null;
  }
}

function repeatLabel(rule: string | null): string {
  const r = parseRepeatRule(rule);
  if (!r) return '';
  if (r.freq === 'daily') return 'DAILY';
  if (r.freq === 'weekly') return r.weekdays && r.weekdays.length > 0 ? 'WEEKDAYS' : 'WEEKLY';
  if (r.freq === 'monthly') return 'MONTHLY';
  return '';
}

function priorityGlyph(priority: string): { char: string; color: string } {
  if (priority === 'high') return { char: 'H', color: '#FF4757' };
  if (priority === 'low') return { char: 'L', color: '#00D4FF' };
  return { char: 'M', color: '#8BA3C7' };
}

function isPlanned(t: TodoItem): boolean {
  return t.status === 'active' || t.status === 'waiting' || t.status === 'completed';
}

function getQuadrant(todo: TodoItem): QuadrantId {
  const p = todo.priority;
  const d = todo.due_date;
  if (p === 'high' && d && d <= todayStr()) return 'do-first';
  if (p === 'high') return 'schedule';
  if (d) return 'decide';
  return 'eliminate';
}

function sortByOrder(a: TodoItem, b: TodoItem): number {
  return a.order_index - b.order_index;
}

// ── Picker menu hook (dropdown with upward flip near screen bottom) ──

function usePicker() {
  const [open, setOpen] = useState(false);
  const [dir, setDir] = useState<'down' | 'up'>('down');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (e: Event) => {
    e.stopPropagation();
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setDir(r.bottom > window.innerHeight - 240 ? 'up' : 'down');
    }
    setOpen(!open);
  };

  return { open, dir, ref, toggle, setOpen };
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 5L4 7L8 3" stroke="#0B1120" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  );
}

// ── Main component ───────────────────────────────────────────────

export function TodoPage(props: TodoPageProps) {
  const { todos, onAdd } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<TodoView>('inbox');
  const [text, setText] = useState('');
  const [captureText, setCaptureText] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openAddModal = () => {
    setText('');
    setShowAddModal(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setText('');
  };

  const handleAdd = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText('');
    setShowAddModal(false);
  };

  const handleCapture = () => {
    const trimmed = captureText.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setCaptureText('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') closeAddModal();
  };

  // ── View membership ────────────────────────────────────────
  // List views are manually ordered (order_index) — drag to arrange.
  const today = todayStr();
  const inboxItems = todos.filter((t) => t.status === 'inbox').sort(sortByOrder);
  const todayItems = todos
    .filter((t) =>
      t.status !== 'completed' && t.status !== 'archived' &&
      ((t.due_date && t.due_date <= today) || (t.scheduled_date && t.scheduled_date <= today))
    )
    .sort(sortByOrder);
  const upcomingItems = todos
    .filter((t) =>
      t.status !== 'completed' && t.status !== 'archived' &&
      ((t.due_date && t.due_date > today) || (t.scheduled_date && t.scheduled_date > today))
    )
    .sort(sortByOrder);
  const matrixItems = todos.filter(isPlanned);

  const viewItems: Record<TodoView, TodoItem[]> = {
    inbox: inboxItems,
    today: todayItems,
    upcoming: upcomingItems,
    matrix: matrixItems,
  };

  const counts: Record<TodoView, number> = {
    inbox: inboxItems.length,
    today: todayItems.length,
    upcoming: upcomingItems.length,
    matrix: matrixItems.length,
  };

  // ── Matrix quadrant grouping ───────────────────────────────
  const groups: Record<QuadrantId, TodoItem[]> = { 'do-first': [], 'schedule': [], 'decide': [], 'eliminate': [] };
  for (const t of matrixItems) {
    groups[getQuadrant(t)].push(t);
  }
  for (const q of Object.keys(groups) as QuadrantId[]) {
    groups[q].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const aDate = a.due_date || '9999-99-99';
      const bDate = b.due_date || '9999-99-99';
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return a.order_index - b.order_index;
    });
  }

  const handleDropToQuadrant = (todoId: number, targetQuadrant: QuadrantId, newIndex: number, isCrossQuadrant: boolean) => {
    const targetItems = groups[targetQuadrant].filter(t => t.id !== todoId);
    let newOrderIndex: number;
    if (newIndex <= 0) {
      newOrderIndex = targetItems.length > 0 ? targetItems[0].order_index - 10 : 100;
    } else if (newIndex >= targetItems.length) {
      newOrderIndex = targetItems.length > 0 ? targetItems[targetItems.length - 1].order_index + 10 : 100;
    } else {
      const prevItem = targetItems[newIndex - 1];
      const nextItem = targetItems[newIndex];
      newOrderIndex = Math.floor((prevItem.order_index + nextItem.order_index) / 2);
    }

    props.onReorder(todoId, newOrderIndex);

    if (!isCrossQuadrant) return;

    // Dragging into a quadrant IS the planning action
    props.onSetStatus(todoId, 'active');
    const nextWeek = daysFromNow(7);
    switch (targetQuadrant) {
      case 'do-first':
        props.onSetPriority(todoId, 'high');
        props.onSetDueDate(todoId, today);
        break;
      case 'schedule':
        props.onSetPriority(todoId, 'high');
        props.onSetDueDate(todoId, nextWeek);
        break;
      case 'decide':
        props.onSetPriority(todoId, 'medium');
        props.onSetDueDate(todoId, nextWeek);
        break;
      case 'eliminate':
        props.onSetPriority(todoId, 'low');
        props.onSetDueDate(todoId, null);
        break;
    }
  };

  // Drag within a list view = manual ordering (views are exclusive tabs, so
  // cross-view drags can't occur — ordering is order_index-based)
  const handleListDrop = (todoId: number, toView: TodoView, newIndex: number) => {
    const targetItems = viewItems[toView].filter(t => t.id !== todoId);
    let newOrderIndex: number;
    if (newIndex <= 0) {
      newOrderIndex = targetItems.length > 0 ? targetItems[0].order_index - 10 : 100;
    } else if (newIndex >= targetItems.length) {
      newOrderIndex = targetItems.length > 0 ? targetItems[targetItems.length - 1].order_index + 10 : 100;
    } else {
      newOrderIndex = Math.floor((targetItems[newIndex - 1].order_index + targetItems[newIndex].order_index) / 2);
    }
    props.onReorder(todoId, newOrderIndex);
  };

  // ── Empty-state copy per view ──────────────────────────────
  const EMPTY_COPY: Record<TodoView, { title: string; hint: string }> = {
    inbox: { title: 'INBOX CLEAR', hint: 'Capture new work above — plain text lands here' },
    today: { title: 'NOTHING DUE TODAY', hint: 'Overdue, due-today, or scheduled-today tasks appear here' },
    upcoming: { title: 'NO UPCOMING WORK', hint: 'Future-dated tasks will appear here' },
    matrix: { title: 'NO PLANNED TASKS', hint: 'Plan inbox tasks (set status/priority/date) to see them here' },
  };

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      {/* ── View tabs ───────────────────────────────────────── */}
      <div class="flex gap-1 px-2 py-2 shrink-0 border-b border-[#162035] items-center">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            class={`px-3 py-1.5 text-[16px] font-semibold tracking-[0.06em] uppercase transition-all active:brightness-125 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2 ${
              view === tab.id
                ? 'bg-[#00D4FF] text-[#0B1120]'
                : 'bg-[#111827] text-[#8BA3C7] hover:text-[#E8F0FE]'
            }`}
          >
            {tab.label}{counts[tab.id] > 0 ? ` ${counts[tab.id]}` : ''}
          </button>
        ))}
      </div>

      {view === 'matrix' ? (
        /* ── MATRIX: 2×2 Eisenhower grid ─────────────────── */
        <div class="flex-1 grid grid-cols-2 grid-rows-2 overflow-hidden gap-px bg-[#1E3A5F]">
          {QUADRANTS.map((q) => {
            const items = groups[q.id];
            return (
              <div key={q.id} class="bg-[#0B1120] flex flex-col overflow-hidden relative">
                <div class="px-3 py-2 shrink-0 border-b flex items-center gap-2 select-none" style={{ borderColor: q.accent }}>
                  <span class="w-2 h-2 shrink-0" style={{ backgroundColor: q.accent }} />
                  <span class="text-[14px] font-semibold uppercase tracking-[0.06em]" style={{ color: q.accent }}>
                    {q.label}
                  </span>
                  {items.length > 0 && (
                    <span class="ml-auto font-mono text-[14px] text-[#4A6080]">{items.length}</span>
                  )}
                </div>
                <SortableZone
                  key={`${q.id}-${items.map(t => t.id).join(',')}`}
                  quadrantId={q.id}
                  items={items}
                  onDropToQuadrant={handleDropToQuadrant}
                >
                  {items.length === 0 ? (
                    <p class="text-[16px] text-[#4A6080] text-center mt-8 select-none uppercase tracking-[0.06em] font-semibold">
                      NO ITEMS
                    </p>
                  ) : (
                    items.map((todo) => (
                      <TodoRow
                        key={todo.id}
                        todo={todo}
                        expanded={expandedIds.has(todo.id)}
                        onToggleExpand={toggleExpand}
                        {...rowHandlers(props)}
                      />
                    ))
                  )}
                </SortableZone>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── LIST VIEWS: INBOX / TODAY / UPCOMING ────────── */
        <div class="flex-1 flex flex-col overflow-hidden">
          {view === 'inbox' && (
            <div class="flex gap-1 px-2 py-1 border-b border-[#162035] shrink-0">
              <input
                type="text"
                value={captureText}
                onInput={(e) => setCaptureText((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCapture(); }}
                placeholder="Capture task… (plain text = inbox)"
                class="flex-1 bg-[#0B1120] text-[#E8F0FE] text-[18px] px-2 py-1 border border-[#1E3A5F] placeholder-[#4A6080] outline-none focus:border-[#00D4FF] transition-colors min-h-[44px] font-mono"
                maxLength={200}
              />
              <button
                onClick={handleCapture}
                disabled={!captureText.trim()}
                class="px-3 py-1 text-[16px] font-semibold uppercase tracking-[0.06em] bg-[#00D4FF] text-[#0B1120] active:brightness-125 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 min-h-[44px] focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
              >
                CAPTURE
              </button>
            </div>
          )}

          <div class="flex-1 overflow-y-auto custom-scrollbar">
            {viewItems[view].length === 0 ? (
              <div class="flex flex-col items-center justify-center h-full gap-1 select-none">
                <span class="text-[18px] font-semibold uppercase tracking-[0.06em] text-[#4A6080]">
                  {EMPTY_COPY[view].title}
                </span>
                <span class="text-[14px] text-[#4A6080]">{EMPTY_COPY[view].hint}</span>
              </div>
            ) : (
              <SortableList
                view={view}
                onListDrop={handleListDrop}
              >
                {viewItems[view].map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    expanded={expandedIds.has(todo.id)}
                    onToggleExpand={toggleExpand}
                    {...rowHandlers(props)}
                  />
                ))}
              </SortableList>
            )}
          </div>
        </div>
      )}

      {/* Add button — floating */}
      <button
        onClick={openAddModal}
        class="absolute bottom-16 right-4 w-12 h-12 bg-[#00D4FF] text-[#0B1120] active:brightness-125 transition-all flex items-center justify-center text-2xl font-bold z-10 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
        aria-label="Add task"
        title="Add task"
      >
        +
      </button>

      {/* Add task modal */}
      {showAddModal && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(11,17,32,0.8)' }}
          onClick={closeAddModal}
        >
          <div
            class="bg-[#111827] border border-[#1E3A5F] p-5 w-[440px] max-w-[92vw] flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#00D4FF] border-b border-[#1E3A5F] pb-2">
              NEW TASK
            </h3>
            <input
              ref={inputRef}
              type="text"
              value={text}
              onInput={(e) => setText((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter command…"
              class="flex-1 bg-[#0B1120] text-[#E8F0FE] text-[18px] px-3 py-2 border border-[#1E3A5F] placeholder-[#4A6080] outline-none focus:border-[#00D4FF] transition-colors min-h-[48px]"
            />
            <p class="text-[16px] text-[#8BA3C7] -mt-1 leading-snug">
              Plain text lands in <span class="text-[#8BA3C7] font-semibold">INBOX</span>.{' '}
              <span class="text-[#FF4757] font-semibold">!high</span>{' '}
              <span class="text-[#8BA3C7] font-semibold">!medium</span>{' '}
              <span class="text-[#00D4FF] font-semibold">!low</span> set priority;
              natural dates too: "Fix login !high tomorrow"
            </p>
            <div class="flex gap-2 justify-end">
              <button
                onClick={closeAddModal}
                class="px-4 py-2 text-[16px] font-semibold uppercase tracking-[0.06em] bg-[#0B1120] text-[#8BA3C7] hover:bg-[#1E3A5F] transition-colors focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2"
              >
                CANCEL
              </button>
              <button
                onClick={handleAdd}
                disabled={!text.trim()}
                class="px-4 py-2 text-[16px] font-semibold uppercase tracking-[0.06em] bg-[#00D4FF] text-[#0B1120] hover:brightness-110 active:brightness-125 transition-all disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
              >
                EXECUTE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Build the handler bundle passed to every row (keeps JSX terse)
function rowHandlers(props: TodoPageProps) {
  return {
    onToggle: props.onToggle,
    onEdit: props.onEdit,
    onDelete: props.onDelete,
    onSetPriority: props.onSetPriority,
    onSetDueDate: props.onSetDueDate,
    onSetStatus: props.onSetStatus,
    onSetNotes: props.onSetNotes,
    onSetProject: props.onSetProject,
    onSetEstimate: props.onSetEstimate,
    onSetSchedule: props.onSetSchedule,
    onSetReminder: props.onSetReminder,
    onSetRepeatRule: props.onSetRepeatRule,
    addSubtask: props.addSubtask,
    toggleSubtask: props.toggleSubtask,
    editSubtask: props.editSubtask,
    deleteSubtask: props.deleteSubtask,
  };
}

// ── Matrix drag zone ─────────────────────────────────────────────

function SortableZone({
  quadrantId,
  items,
  onDropToQuadrant,
  children,
}: {
  quadrantId: QuadrantId;
  items: TodoItem[];
  onDropToQuadrant: (todoId: number, targetQuadrant: QuadrantId, newIndex: number, isCrossQuadrant: boolean) => void;
  children: any;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const onDropRef = useRef(onDropToQuadrant);
  onDropRef.current = onDropToQuadrant;

  useEffect(() => {
    if (!listRef.current) return;

    const sortable = Sortable.create(listRef.current, {
      group: 'todos',
      animation: 150,
      delay: 50,
      delayOnTouchOnly: true,
      touchStartThreshold: 3,
      // Expanded detail sections are inputs/buttons — never drag them
      filter: '.todo-detail, .todo-detail *',
      // Without this SortableJS preventDefaults pointerdown for filtered
      // elements, which breaks tap-to-focus on inputs in .todo-detail
      preventOnFilter: false,
      onEnd: (evt) => {
        const todoId = parseInt(evt.item.dataset.todoId || '', 10);
        const targetContainer = evt.to as HTMLElement;
        const targetQuadrant = (targetContainer.closest('[data-quadrant-id]') as HTMLElement)?.dataset?.quadrantId as QuadrantId | undefined;
        const actualTarget = targetQuadrant || quadrantId;
        const isCrossQuadrant = evt.from !== evt.to;
        const newIndex = evt.newDraggableIndex ?? evt.newIndex ?? 0;
        if (!todoId || isNaN(todoId)) return;

        onDropRef.current(todoId, actualTarget, newIndex, isCrossQuadrant);
      },
    });

    return () => sortable.destroy();
  }, []);

  return (
    <div
      ref={listRef}
      data-quadrant-id={quadrantId}
      class="flex-1 overflow-y-auto px-2 py-1 custom-scrollbar"
    >
      {children}
    </div>
  );
}

// ── List drag zone (INBOX / TODAY / UPCOMING) ────────────────────

function SortableList({
  view,
  onListDrop,
  children,
}: {
  view: TodoView;
  onListDrop: (todoId: number, toView: TodoView, newIndex: number) => void;
  children: any;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const onDropRef = useRef(onListDrop);
  onDropRef.current = onListDrop;

  useEffect(() => {
    if (!listRef.current) return;

    const sortable = Sortable.create(listRef.current, {
      group: 'todos',
      animation: 150,
      delay: 50,
      delayOnTouchOnly: true,
      touchStartThreshold: 3,
      // Expanded detail sections are inputs/buttons — never drag them
      filter: '.todo-detail, .todo-detail *',
      // Without this SortableJS preventDefaults pointerdown for filtered
      // elements, which breaks tap-to-focus on inputs in .todo-detail
      preventOnFilter: false,
      onEnd: (evt) => {
        const todoId = parseInt(evt.item.dataset.todoId || '', 10);
        if (!todoId || isNaN(todoId)) return;
        const newIndex = evt.newDraggableIndex ?? evt.newIndex ?? 0;
        onDropRef.current(todoId, view, newIndex);
      },
    });

    return () => sortable.destroy();
  }, []);

  return (
    <div
      ref={listRef}
      data-view={view}
      class="flex-1 overflow-y-auto px-2 py-1 custom-scrollbar"
    >
      {children}
    </div>
  );
}

// ── Todo row ─────────────────────────────────────────────────────

function TodoRow({
  todo,
  expanded,
  onToggleExpand,
  onToggle,
  onEdit,
  onDelete,
  onSetPriority,
  onSetDueDate,
  onSetStatus,
  onSetNotes,
  onSetProject,
  onSetEstimate,
  onSetSchedule,
  onSetReminder,
  onSetRepeatRule,
  addSubtask,
  toggleSubtask,
  editSubtask,
  deleteSubtask,
}: {
  todo: TodoItem;
  expanded: boolean;
  onToggleExpand: (id: number) => void;
  onToggle: (id: number) => void;
  onEdit: (id: number, text: string) => void;
  onDelete: (id: number) => void;
  onSetPriority: (id: number, priority: 'high' | 'medium' | 'low') => void;
  onSetDueDate: (id: number, dueDate: string | null) => void;
  onSetStatus: (id: number, status: TodoStatus) => void;
  onSetNotes: (id: number, notes: string) => void;
  onSetProject: (id: number, project: string) => void;
  onSetEstimate: (id: number, estimateMinutes: number | null) => void;
  onSetSchedule: (id: number, scheduledDate: string | null, scheduledTime: string | null) => void;
  onSetReminder: (id: number, reminderAt: number | null) => void;
  onSetRepeatRule: (id: number, repeatRule: string | null) => void;
  addSubtask: (todoId: number, text: string) => void;
  toggleSubtask: (id: number) => void;
  editSubtask: (id: number, text: string) => void;
  deleteSubtask: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const statusPicker = usePicker();

  // Dismiss date picker on outside click
  useEffect(() => {
    if (!showDatePicker) return;
    const handler = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDatePicker]);

  const startEdit = (e: Event) => {
    e.stopPropagation();
    setEditText(todo.text);
    setEditing(true);
    requestAnimationFrame(() => editInputRef.current?.focus());
  };

  const commitEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== todo.text) {
      onEdit(todo.id, trimmed);
    }
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  const handleEditKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  const cyclePriority = (e: Event) => {
    e.stopPropagation();
    const order: Array<'high' | 'medium' | 'low'> = ['medium', 'high', 'low'];
    const idx = order.indexOf(todo.priority);
    onSetPriority(todo.id, order[(idx + 1) % order.length]);
  };

  const dateBadge = formatDateBadge(todo.scheduled_date || todo.due_date);
  const schedBadge = formatSchedule(todo);
  const remLabel = formatReminderLabel(todo.reminder_at);
  const repLabel = repeatLabel(todo.repeat_rule);
  const statusMeta = STATUS_META[todo.status];
  const pGlyph = priorityGlyph(todo.priority);

  // One date display: the compact badge reflects the scheduled date when set,
  // otherwise the due date — and clicking it edits whichever one it shows.
  const setDisplayDate = (dateStr: string | null) => {
    if (todo.scheduled_date) {
      onSetSchedule(todo.id, dateStr, dateStr ? todo.scheduled_time : null);
    } else {
      onSetDueDate(todo.id, dateStr);
    }
  };

  const applyQuickDate = (e: Event, dateStr: string | null) => {
    e.stopPropagation();
    setDisplayDate(dateStr);
    setShowDatePicker(false);
  };

  return (
    <div data-todo-id={todo.id} class={`group border-b border-[#162035] ${todo.completed ? 'opacity-60' : ''}`}>
      {/* ── Compact row ───────────────────────────────────── */}
      <div class="flex items-start gap-1.5 py-1 px-1 min-h-[44px]">
        {/* Complete checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(todo.id); }}
          class="shrink-0 flex items-center justify-center w-[44px] h-[44px] -ml-1 -mt-0.5 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-1"
          aria-label={todo.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          <span
            class={`w-[18px] h-[18px] border-2 shrink-0 flex items-center justify-center transition-colors ${
              todo.completed ? 'bg-[#26DE81] border-[#26DE81]' : 'border-[#1E3A5F]'
            }`}
          >
            {todo.completed && <CheckIcon />}
          </span>
        </button>

        {/* Priority glyph */}
        <button
          onClick={cyclePriority}
          class="font-mono text-[16px] font-bold shrink-0 hover:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-offset-1 px-0.5 mt-2"
          style={{ color: pGlyph.color }}
          aria-label={`Priority: ${todo.priority}`}
          title={todo.priority}
        >
          {pGlyph.char}
        </button>

        {/* Status pill */}
        <div ref={statusPicker.ref} class="relative shrink-0 mt-1">
          <button
            onClick={statusPicker.toggle}
            class="font-mono text-[12px] font-bold uppercase tracking-[0.08em] px-1.5 py-1 border transition-colors focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-1"
            style={{ color: statusMeta.color, borderColor: statusMeta.color, background: `${statusMeta.color}14` }}
            aria-label={`Status: ${todo.status}`}
          >
            {statusMeta.label}
          </button>
          {statusPicker.open && (
            <div class={`absolute z-30 ${statusPicker.dir === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 bg-[#111827] border border-[#1E3A5F] p-1 flex flex-col gap-1 min-w-[130px]`}>
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetStatus(todo.id, s);
                    statusPicker.setOpen(false);
                  }}
                  class={`text-[15px] text-left px-2 py-1.5 font-mono font-semibold uppercase tracking-[0.06em] hover:bg-[#1A2535] ${
                    todo.status === s ? '' : 'text-[#8BA3C7]'
                  }`}
                  style={todo.status === s ? { color: STATUS_META[s].color } : undefined}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Text / edit / expand */}
        {editing ? (
          <input
            ref={editInputRef}
            type="text"
            value={editText}
            onInput={(e) => setEditText((e.target as HTMLInputElement).value)}
            onKeyDown={handleEditKeyDown}
            onBlur={commitEdit}
            onClick={(e) => e.stopPropagation()}
            class="flex-1 bg-[#111827] text-[#E8F0FE] text-[18px] px-1.5 py-0.5 border border-[#00D4FF] outline-none min-w-0 font-mono mt-0.5"
          />
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(todo.id); }}
            class="flex-1 min-w-0 text-left py-2 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-1"
          >
            <span
              class={`text-[18px] leading-snug break-words select-none ${
                todo.completed ? 'text-[#4A6080] line-through' : 'text-[#E8F0FE]'
              }`}
            >
              {todo.text}
            </span>
          </button>
        )}

        {/* Due date badge */}
        <div class="relative shrink-0 mt-1" ref={datePickerRef}>
          {dateBadge.text ? (
            <button
              onClick={(e) => { e.stopPropagation(); setShowDatePicker(!showDatePicker); }}
              class={`font-mono text-[14px] px-1.5 py-0.5 font-semibold uppercase tracking-[0.06em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 ${
                dateBadge.isOverdue
                  ? 'bg-[#FF4757]/15 text-[#FF4757]'
                  : dateBadge.isToday
                  ? 'bg-[#FF9F43]/15 text-[#FF9F43]'
                  : 'bg-[#111827] text-[#8BA3C7] active:bg-[#1E3A5F]'
              }`}
            >
              {dateBadge.text}
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setShowDatePicker(!showDatePicker); }}
              class="font-mono text-[14px] px-1.5 py-0.5 font-semibold uppercase tracking-[0.06em] bg-[#111827] text-[#4A6080] active:bg-[#1E3A5F] transition-colors focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-1"
            >
              +DATE
            </button>
          )}

          {showDatePicker && (
            <div class={`absolute z-30 ${datePickerRef.current && datePickerRef.current.getBoundingClientRect().bottom > window.innerHeight - 240 ? 'bottom-full mb-1' : 'top-full mt-1'} right-0 bg-[#111827] border border-[#1E3A5F] p-1.5 flex flex-col gap-1 min-w-[130px]`}>
              <button onClick={(e) => applyQuickDate(e, todayStr())} class="text-[16px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono">TODAY</button>
              <button onClick={(e) => applyQuickDate(e, daysFromNow(1))} class="text-[16px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono">TOMORROW</button>
              <button onClick={(e) => applyQuickDate(e, daysFromNow(7))} class="text-[16px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono">NEXT WEEK</button>
              <div class="px-2 py-1">
                <input
                  type="date"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const val = (e.target as HTMLInputElement).value;
                    if (val) {
                      e.stopPropagation();
                      setDisplayDate(val);
                      setShowDatePicker(false);
                    }
                  }}
                  class="font-mono text-[16px] bg-[#0B1120] text-[#E8F0FE] border border-[#1E3A5F] px-1 py-0.5 outline-none w-full"
                />
              </div>
              {(todo.due_date || todo.scheduled_date) && (
                <button onClick={(e) => applyQuickDate(e, null)} class="text-[16px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#FF4757] font-mono">CLEAR</button>
              )}
            </div>
          )}
        </div>

        {/* Expand */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand(todo.id); }}
          class="text-[#4A6080] active:text-[#00D4FF] transition-all px-1 shrink-0 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-1 text-[16px] mt-1.5"
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
        >
          {expanded ? '▴' : '▾'}
        </button>

        {/* Edit */}
        <button
          onClick={startEdit}
          class="text-[#4A6080] active:text-[#00D4FF] transition-all px-1 shrink-0 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-1 text-[18px] mt-1"
          aria-label="Edit todo"
        >
          ✎
        </button>

        {/* Archive (soft delete) */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(todo.id); }}
          class="text-[#4A6080] active:text-[#FF4757] transition-all px-1 shrink-0 focus-visible:outline-2 focus-visible:outline-[#FF4757] focus-visible:outline-offset-1 text-[18px] mt-1"
          aria-label="Archive todo"
          title="Archive"
        >
          ✕
        </button>
      </div>

      {/* ── Expanded detail ────────────────────────────────── */}
      {expanded && (
        <TodoDetail
          key={todo.id}
          todo={todo}
          onSetStatus={onSetStatus}
          onSetNotes={onSetNotes}
          onSetProject={onSetProject}
          onSetEstimate={onSetEstimate}
          onSetSchedule={onSetSchedule}
          onSetReminder={onSetReminder}
          onSetRepeatRule={onSetRepeatRule}
          addSubtask={addSubtask}
          toggleSubtask={toggleSubtask}
          editSubtask={editSubtask}
          deleteSubtask={deleteSubtask}
        />
      )}
    </div>
  );
}

// ── Expanded detail panel ────────────────────────────────────────

function TodoDetail({
  todo,
  onSetStatus,
  onSetNotes,
  onSetProject,
  onSetEstimate,
  onSetSchedule,
  onSetReminder,
  onSetRepeatRule,
  addSubtask,
  toggleSubtask,
  editSubtask,
  deleteSubtask,
}: {
  todo: TodoItem;
  onSetStatus: (id: number, status: TodoStatus) => void;
  onSetNotes: (id: number, notes: string) => void;
  onSetProject: (id: number, project: string) => void;
  onSetEstimate: (id: number, estimateMinutes: number | null) => void;
  onSetSchedule: (id: number, scheduledDate: string | null, scheduledTime: string | null) => void;
  onSetReminder: (id: number, reminderAt: number | null) => void;
  onSetRepeatRule: (id: number, repeatRule: string | null) => void;
  addSubtask: (todoId: number, text: string) => void;
  toggleSubtask: (id: number) => void;
  editSubtask: (id: number, text: string) => void;
  deleteSubtask: (id: number) => void;
}) {
  const [projectDraft, setProjectDraft] = useState(todo.project);
  const [notesDraft, setNotesDraft] = useState(todo.notes);
  const [estimateDraft, setEstimateDraft] = useState(
    todo.estimate_minutes !== null && todo.estimate_minutes !== undefined ? String(todo.estimate_minutes) : ''
  );
  const [subtaskText, setSubtaskText] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<number | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState('');
  const [schedDateDraft, setSchedDateDraft] = useState(todo.scheduled_date || todayStr());
  const [schedTimeDraft, setSchedTimeDraft] = useState(todo.scheduled_time || '');
  const [customReminder, setCustomReminder] = useState('');
  const schedulePicker = usePicker();
  const reminderPicker = usePicker();
  const repeatPicker = usePicker();
  const statusPicker = usePicker();

  const subtasks = (todo.subtasks || []).slice().sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return a.order_index - b.order_index;
  });
  const remLabel = formatReminderLabel(todo.reminder_at);
  const schedLabel = formatSchedule(todo);
  const repLabel = repeatLabel(todo.repeat_rule);
  const statusMeta = STATUS_META[todo.status];

  const commitProject = () => {
    const v = projectDraft.trim();
    if (v !== todo.project) onSetProject(todo.id, v);
  };

  const commitNotes = () => {
    if (notesDraft !== todo.notes) onSetNotes(todo.id, notesDraft);
  };

  const commitEstimate = () => {
    const v = estimateDraft.trim();
    if (v === '') {
      if (todo.estimate_minutes !== null) onSetEstimate(todo.id, null);
      return;
    }
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= 0 && n !== todo.estimate_minutes) {
      onSetEstimate(todo.id, n);
    }
  };

  const nowEpoch = () => Date.now() / 1000;

  const reminderAtSchedule = (): number => {
    const date = todo.scheduled_date || todayStr();
    const time = todo.scheduled_time || '17:00';
    return new Date(`${date}T${time}:00`).getTime() / 1000;
  };

  const tomorrowAt9 = (): number => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.getTime() / 1000;
  };

  const applyRepeat = (rule: string | null) => {
    onSetRepeatRule(todo.id, rule);
    repeatPicker.setOpen(false);
  };

  const handleAddSubtask = () => {
    const t = subtaskText.trim();
    if (!t) return;
    if ((todo.subtasks || []).length >= 20) return;
    addSubtask(todo.id, t);
    setSubtaskText('');
  };

  const handleStartEditSubtask = (s: SubtaskItem, e: Event) => {
    e.stopPropagation();
    setEditingSubtaskId(s.id);
    setEditingSubtaskText(s.text);
  };

  const handleCommitEditSubtask = () => {
    const t = editingSubtaskText.trim();
    if (t && editingSubtaskId !== null) editSubtask(editingSubtaskId, t);
    setEditingSubtaskId(null);
    setEditingSubtaskText('');
  };

  const repeatBtn = (label: string, rule: string | null) => (
    <button
      onClick={(e) => { e.stopPropagation(); applyRepeat(rule); }}
      class="text-[15px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono uppercase tracking-[0.06em]"
    >
      {label}
    </button>
  );

  const metaRow = 'flex items-center gap-2 min-h-[44px] border-b border-[#162035] px-2';
  const fieldLabel = 'w-[64px] shrink-0 text-[13px] font-semibold uppercase tracking-[0.08em] text-[#4A6080]';

  return (
    <div class="todo-detail border-b border-[#162035] bg-[#0D1424]">
      {/* Project / estimate */}
      <div class={metaRow}>
        <span class={fieldLabel}>PROJECT</span>
        <input
          type="text"
          value={projectDraft}
          onInput={(e) => setProjectDraft((e.target as HTMLInputElement).value)}
          onBlur={commitProject}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="—"
          maxLength={60}
          class="flex-1 bg-transparent text-[16px] text-[#E8F0FE] outline-none font-mono placeholder-[#4A6080] min-w-0"
        />
        <span class={fieldLabel + ' w-[52px]'}>MIN</span>
        <input
          type="number"
          min={0}
          value={estimateDraft}
          onInput={(e) => setEstimateDraft((e.target as HTMLInputElement).value)}
          onBlur={commitEstimate}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="—"
          class="w-[64px] bg-transparent text-[16px] text-[#FFB800] outline-none font-mono placeholder-[#4A6080] text-right"
        />
      </div>

      {/* Notes */}
      <div class={metaRow}>
        <span class={fieldLabel}>NOTES</span>
        <input
          type="text"
          value={notesDraft}
          onInput={(e) => setNotesDraft((e.target as HTMLInputElement).value)}
          onBlur={commitNotes}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="Context, links, what to check…"
          maxLength={500}
          class="flex-1 bg-transparent text-[16px] text-[#8BA3C7] outline-none font-mono placeholder-[#4A6080] min-w-0"
        />
      </div>

      {/* Schedule / reminder / repeat */}
      <div class={`${metaRow} gap-1`}>
        {/* Schedule */}
        <div ref={schedulePicker.ref} class="relative shrink-0">
          <button
            onClick={schedulePicker.toggle}
            class="font-mono text-[13px] font-semibold uppercase tracking-[0.06em] px-1.5 py-1 border border-[#1E3A5F] bg-[#111827] text-[#8BA3C7] active:bg-[#1E3A5F] transition-colors"
            title="Schedule when to work on this"
          >
            {schedLabel ? `◷ ${schedLabel}` : '◷ SCHEDULE'}
          </button>
          {schedulePicker.open && (
            <div class={`absolute z-30 ${schedulePicker.dir === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 bg-[#111827] border border-[#1E3A5F] p-1.5 flex flex-col gap-1 min-w-[200px]`}>
              <div class="flex gap-1">
                <button onClick={(e) => { e.stopPropagation(); onSetSchedule(todo.id, todayStr(), null); schedulePicker.setOpen(false); }} class="text-[15px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono">TODAY</button>
                <button onClick={(e) => { e.stopPropagation(); onSetSchedule(todo.id, daysFromNow(1), null); schedulePicker.setOpen(false); }} class="text-[15px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono">TOMORROW</button>
                <button onClick={(e) => { e.stopPropagation(); onSetSchedule(todo.id, daysFromNow(7), null); schedulePicker.setOpen(false); }} class="text-[15px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono">NEXT WEEK</button>
              </div>
              <div class="flex items-center gap-1 px-2">
                <input
                  type="date"
                  value={schedDateDraft}
                  onInput={(e) => setSchedDateDraft((e.target as HTMLInputElement).value)}
                  onClick={(e) => e.stopPropagation()}
                  class="font-mono text-[14px] bg-[#0B1120] text-[#E8F0FE] border border-[#1E3A5F] px-1 py-0.5 outline-none flex-1 min-w-0"
                />
                <input
                  type="time"
                  value={schedTimeDraft}
                  onInput={(e) => setSchedTimeDraft((e.target as HTMLInputElement).value)}
                  onClick={(e) => e.stopPropagation()}
                  class="font-mono text-[14px] bg-[#0B1120] text-[#E8F0FE] border border-[#1E3A5F] px-1 py-0.5 outline-none"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetSchedule(todo.id, schedDateDraft || null, schedTimeDraft || null);
                    schedulePicker.setOpen(false);
                  }}
                  class="px-2 py-1 text-[13px] font-semibold uppercase tracking-[0.06em] bg-[#00D4FF] text-[#0B1120] active:brightness-125"
                >
                  SET
                </button>
              </div>
              {todo.scheduled_date && (
                <button onClick={(e) => { e.stopPropagation(); onSetSchedule(todo.id, null, null); schedulePicker.setOpen(false); }} class="text-[15px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#FF4757] font-mono">CLEAR</button>
              )}
            </div>
          )}
        </div>

        {/* Reminder */}
        <div ref={reminderPicker.ref} class="relative shrink-0">
          <button
            onClick={reminderPicker.toggle}
            class={`font-mono text-[13px] font-semibold uppercase tracking-[0.06em] px-1.5 py-1 border transition-colors ${
              remLabel
                ? 'border-[#FF9F43] bg-[#FF9F43]/15 text-[#FF9F43]'
                : 'border-[#1E3A5F] bg-[#111827] text-[#8BA3C7] active:bg-[#1E3A5F]'
            }`}
            title="Remind when it's time to work on this"
          >
            {remLabel ? `⏰ ${remLabel}` : '⏰ REMIND'}
          </button>
          {reminderPicker.open && (
            <div class={`absolute z-30 ${reminderPicker.dir === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 bg-[#111827] border border-[#1E3A5F] p-1.5 flex flex-col gap-1 min-w-[190px]`}>
              <button onClick={(e) => { e.stopPropagation(); onSetReminder(todo.id, null); reminderPicker.setOpen(false); }} class="text-[15px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono">NONE</button>
              <button onClick={(e) => { e.stopPropagation(); onSetReminder(todo.id, nowEpoch() + 600); reminderPicker.setOpen(false); }} class="text-[15px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono">IN 10 MIN</button>
              <button onClick={(e) => { e.stopPropagation(); onSetReminder(todo.id, nowEpoch() + 1800); reminderPicker.setOpen(false); }} class="text-[15px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono">IN 30 MIN</button>
              <button onClick={(e) => { e.stopPropagation(); onSetReminder(todo.id, nowEpoch() + 3600); reminderPicker.setOpen(false); }} class="text-[15px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono">IN 1 HOUR</button>
              <button onClick={(e) => { e.stopPropagation(); onSetReminder(todo.id, reminderAtSchedule()); reminderPicker.setOpen(false); }} class="text-[15px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono">AT SCHEDULE (17:00)</button>
              <button onClick={(e) => { e.stopPropagation(); onSetReminder(todo.id, tomorrowAt9()); reminderPicker.setOpen(false); }} class="text-[15px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono">TOMORROW 09:00</button>
              <div class="flex items-center gap-1 px-2">
                <input
                  type="datetime-local"
                  value={customReminder}
                  onInput={(e) => setCustomReminder((e.target as HTMLInputElement).value)}
                  onClick={(e) => e.stopPropagation()}
                  class="font-mono text-[14px] bg-[#0B1120] text-[#E8F0FE] border border-[#1E3A5F] px-1 py-0.5 outline-none flex-1 min-w-0"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (customReminder) {
                      onSetReminder(todo.id, new Date(customReminder).getTime() / 1000);
                      reminderPicker.setOpen(false);
                    }
                  }}
                  class="px-2 py-1 text-[13px] font-semibold uppercase tracking-[0.06em] bg-[#00D4FF] text-[#0B1120] active:brightness-125"
                >
                  SET
                </button>
              </div>
              {todo.reminder_at && (
                <button onClick={(e) => { e.stopPropagation(); onSetReminder(todo.id, null); reminderPicker.setOpen(false); }} class="text-[15px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#FF4757] font-mono">CLEAR</button>
              )}
            </div>
          )}
        </div>

        {/* Repeat */}
        <div ref={repeatPicker.ref} class="relative shrink-0">
          <button
            onClick={repeatPicker.toggle}
            class={`font-mono text-[13px] font-semibold uppercase tracking-[0.06em] px-1.5 py-1 border transition-colors ${
              repLabel
                ? 'border-[#26DE81] bg-[#26DE81]/15 text-[#26DE81]'
                : 'border-[#1E3A5F] bg-[#111827] text-[#8BA3C7] active:bg-[#1E3A5F]'
            }`}
            title="Repeat this task"
          >
            {repLabel ? `↻ ${repLabel}` : '↻ REPEAT'}
          </button>
          {repeatPicker.open && (
            <div class={`absolute z-30 ${repeatPicker.dir === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} left-0 bg-[#111827] border border-[#1E3A5F] p-1.5 flex flex-col gap-1 min-w-[140px]`}>
              {repeatBtn('NONE', null)}
              {repeatBtn('DAILY', JSON.stringify({ freq: 'daily', interval: 1, weekdays: null, end_date: null }))}
              {repeatBtn('WEEKDAYS', JSON.stringify({ freq: 'weekly', interval: 1, weekdays: [0, 1, 2, 3, 4], end_date: null }))}
              {repeatBtn('WEEKLY', JSON.stringify({ freq: 'weekly', interval: 1, weekdays: null, end_date: null }))}
              {repeatBtn('MONTHLY', JSON.stringify({ freq: 'monthly', interval: 1, weekdays: null, end_date: null }))}
            </div>
          )}
        </div>

        {/* Status (in detail too, for waiting/completed toggling) */}
        <div ref={statusPicker.ref} class="relative shrink-0 ml-auto">
          <button
            onClick={statusPicker.toggle}
            class="font-mono text-[13px] font-semibold uppercase tracking-[0.06em] px-1.5 py-1 border transition-colors"
            style={{ color: statusMeta.color, borderColor: statusMeta.color, background: `${statusMeta.color}14` }}
          >
            {statusMeta.label}
          </button>
          {statusPicker.open && (
            <div class={`absolute z-30 ${statusPicker.dir === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} right-0 bg-[#111827] border border-[#1E3A5F] p-1 flex flex-col gap-1 min-w-[130px]`}>
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetStatus(todo.id, s);
                    statusPicker.setOpen(false);
                  }}
                  class={`text-[15px] text-left px-2 py-1.5 font-mono font-semibold uppercase tracking-[0.06em] hover:bg-[#1A2535] ${
                    todo.status === s ? '' : 'text-[#8BA3C7]'
                  }`}
                  style={todo.status === s ? { color: STATUS_META[s].color } : undefined}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Source context (manual attachment only) */}
      {(todo.source_app || todo.source_sender || todo.source_url) && (
        <div class="px-2 py-1.5 border-b border-[#162035] flex items-center gap-2 min-h-[36px]">
          <span class="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#4A6080] shrink-0">FROM</span>
          {todo.source_app && <span class="text-[15px] text-[#8BA3C7] font-mono">{todo.source_app}</span>}
          {todo.source_sender && <span class="text-[15px] text-[#E8F0FE] font-mono">{todo.source_sender}</span>}
          {todo.source_url && (
            <span class="text-[14px] text-[#00D4FF] font-mono truncate min-w-0">{todo.source_url}</span>
          )}
        </div>
      )}

      {/* Subtasks */}
      <div class="px-2 py-1">
        {subtasks.length === 0 && (
          <p class="text-[14px] text-[#4A6080] uppercase tracking-[0.06em] font-semibold py-1">NO STEPS</p>
        )}
        {subtasks.map((s) => (
          <div key={s.id} class={`flex items-start gap-1.5 py-1 border-b border-[#162035] min-h-[40px] ${s.completed ? 'opacity-50' : ''}`}>
            <button
              onClick={(e) => { e.stopPropagation(); toggleSubtask(s.id); }}
              class="shrink-0 flex items-center justify-center w-[40px] h-[40px] -ml-1 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-1"
              aria-label={s.completed ? 'Mark incomplete' : 'Mark complete'}
            >
              <span
                class={`w-[16px] h-[16px] border-2 shrink-0 flex items-center justify-center transition-colors ${
                  s.completed ? 'bg-[#26DE81] border-[#26DE81]' : 'border-[#1E3A5F]'
                }`}
              >
                {s.completed && <CheckIcon />}
              </span>
            </button>

            {editingSubtaskId === s.id ? (
              <input
                type="text"
                value={editingSubtaskText}
                onInput={(e) => setEditingSubtaskText((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommitEditSubtask();
                  if (e.key === 'Escape') setEditingSubtaskId(null);
                }}
                onBlur={handleCommitEditSubtask}
                onClick={(e) => e.stopPropagation()}
                class="flex-1 bg-[#111827] text-[#E8F0FE] text-[16px] px-1.5 py-0.5 border border-[#00D4FF] outline-none min-w-0 font-mono"
                autofocus
              />
            ) : (
              <button
                onClick={(e) => handleStartEditSubtask(s, e)}
                class={`flex-1 min-w-0 text-left py-[8px] text-[16px] leading-snug font-mono break-words select-none ${
                  s.completed ? 'text-[#4A6080] line-through' : 'text-[#E8F0FE]'
                }`}
              >
                {s.text}
              </button>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); deleteSubtask(s.id); }}
              class="shrink-0 flex items-center justify-center w-[40px] h-[40px] text-[#4A6080] active:text-[#FF4757] transition-colors focus-visible:outline-2 focus-visible:outline-[#FF4757] focus-visible:outline-offset-1"
              aria-label="Delete step"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        ))}

        {(todo.subtasks || []).length < 20 && (
          <div class="flex gap-1 py-1 min-h-[44px] items-center">
            <input
              type="text"
              value={subtaskText}
              onInput={(e) => setSubtaskText((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubtask(); }}
              placeholder="Add step…"
              maxLength={200}
              class="flex-1 bg-[#0B1120] text-[#E8F0FE] text-[16px] px-2 py-1 border border-[#1E3A5F] placeholder-[#4A6080] outline-none focus:border-[#00D4FF] transition-colors min-h-[40px] font-mono"
            />
            <button
              onClick={handleAddSubtask}
              disabled={!subtaskText.trim()}
              class="px-2.5 py-1 text-[14px] font-semibold uppercase tracking-[0.06em] bg-[#00D4FF] text-[#0B1120] active:brightness-125 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 min-h-[40px]"
            >
              ADD
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

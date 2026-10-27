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
  onSetSchedule: (id: number, scheduledDate: string | null, scheduledTime: string | null) => void;
  onSetReminder: (id: number, reminderAt: number | null) => void;
  onReorder: (id: number, orderIndex: number) => void;
  addSubtask: (todoId: number, text: string) => void;
  toggleSubtask: (id: number) => void;
  editSubtask: (id: number, text: string) => void;
  deleteSubtask: (id: number) => void;
}

type QuadrantId = 'do-first' | 'schedule' | 'decide' | 'eliminate';

const QUADRANTS: { id: QuadrantId; label: string; accent: string }[] = [
  { id: 'do-first', label: 'Do first', accent: 'var(--color-alert)' },
  { id: 'schedule', label: 'Schedule', accent: 'var(--color-action)' },
  { id: 'decide', label: 'Decide', accent: 'var(--color-ok)' },
  { id: 'eliminate', label: 'Eliminate', accent: 'var(--color-faint)' },
];

const PRIORITIES: { value: 'high' | 'medium' | 'low'; label: string; color: string }[] = [
  { value: 'high', label: 'High', color: 'var(--color-alert)' },
  { value: 'medium', label: 'Medium', color: 'var(--color-muted)' },
  { value: 'low', label: 'Low', color: 'var(--color-action)' },
];

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

/** The single date a task carries. Older rows may only hold a schedule date. */
function todoDate(todo: TodoItem): string | null {
  return todo.due_date || todo.scheduled_date || null;
}

function formatDateBadge(date: string | null): { text: string; isOverdue: boolean; isToday: boolean } {
  if (!date) return { text: '', isOverdue: false, isToday: false };
  const today = todayStr();
  if (date < today) return { text: 'Overdue', isOverdue: true, isToday: false };
  if (date === today) return { text: 'Today', isOverdue: false, isToday: true };
  if (date === daysFromNow(1)) return { text: 'Tomorrow', isOverdue: false, isToday: false };

  const d = new Date(date + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { text: `${days[d.getDay()]} ${d.getDate()}`, isOverdue: false, isToday: false };
}

function formatReminderLabel(reminderAt: number | null): string | null {
  if (!reminderAt) return null;
  const d = new Date(reminderAt * 1000);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (day === todayStr()) return `Today ${hm}`;
  if (day === daysFromNow(1)) return `Tomorrow ${hm}`;
  return `${d.getDate()} ${hm}`;
}

/** Epoch seconds for the task's date plus its optional time. */
function whenEpoch(todo: TodoItem): number {
  const date = todoDate(todo) || todayStr();
  const time = todo.scheduled_time || '17:00';
  return new Date(`${date}T${time}:00`).getTime() / 1000;
}

function priorityGlyph(priority: string): { char: string; color: string } {
  if (priority === 'high') return { char: 'H', color: 'var(--color-alert)' };
  if (priority === 'low') return { char: 'L', color: 'var(--color-action)' };
  return { char: 'M', color: 'var(--color-muted)' };
}

/** Filed = has left the holding pen. `waiting` only exists on older rows. */
function isFiled(todo: TodoItem): boolean {
  return todo.status === 'active' || todo.status === 'waiting' || todo.status === 'completed';
}

function getQuadrant(todo: TodoItem): QuadrantId {
  const date = todoDate(todo);
  if (todo.priority === 'high' && date && date <= todayStr()) return 'do-first';
  if (todo.priority === 'high') return 'schedule';
  if (date) return 'decide';
  return 'eliminate';
}

function sortByOrder(a: TodoItem, b: TodoItem): number {
  return a.order_index - b.order_index;
}

function orderIndexFor(items: TodoItem[], newIndex: number): number {
  if (newIndex <= 0) return items.length > 0 ? items[0].order_index - 10 : 100;
  if (newIndex >= items.length) {
    return items.length > 0 ? items[items.length - 1].order_index + 10 : 100;
  }
  return Math.floor((items[newIndex - 1].order_index + items[newIndex].order_index) / 2);
}

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
      const rect = ref.current.getBoundingClientRect();
      setDir(rect.bottom > window.innerHeight - 260 ? 'up' : 'down');
    }
    setOpen(!open);
  };

  return { open, dir, ref, toggle, setOpen };
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 5L4 7L8 3" stroke="#121021" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

// ── Main component ───────────────────────────────────────────────
// One screen, two regions: the matrix on the left, the holding pen on the
// right. Both must be mounted for drag-to-file to work, which is why this is
// not a pair of tabs. Task editing happens in a dialog, because neither region
// is wide enough for a form.

export function TodoPage(props: TodoPageProps) {
  const { todos, onAdd } = props;
  const [captureText, setCaptureText] = useState('');
  const [openTodoId, setOpenTodoId] = useState<number | null>(null);

  const openTodo = openTodoId !== null ? todos.find((todo) => todo.id === openTodoId) ?? null : null;

  // The task can be archived from inside the dialog; close it when it goes.
  useEffect(() => {
    if (openTodoId !== null && !openTodo) setOpenTodoId(null);
  }, [openTodoId, openTodo]);

  const handleCapture = () => {
    const trimmed = captureText.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setCaptureText('');
  };

  const inboxItems = todos.filter((todo) => todo.status === 'inbox').sort(sortByOrder);
  const filedItems = todos.filter(isFiled);

  const groups: Record<QuadrantId, TodoItem[]> = {
    'do-first': [],
    schedule: [],
    decide: [],
    eliminate: [],
  };
  for (const todo of filedItems) {
    groups[getQuadrant(todo)].push(todo);
  }
  for (const quadrant of Object.keys(groups) as QuadrantId[]) {
    groups[quadrant].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const dateA = todoDate(a) || '9999-99-99';
      const dateB = todoDate(b) || '9999-99-99';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return a.order_index - b.order_index;
    });
  }

  // Dropping into a quadrant IS the filing action: it writes the priority and
  // date that place a task there, so the quadrant and the fields cannot drift.
  const handleDropToQuadrant = (
    todoId: number,
    quadrant: QuadrantId,
    newIndex: number,
    isCrossQuadrant: boolean
  ) => {
    const items = groups[quadrant].filter((todo) => todo.id !== todoId);
    props.onReorder(todoId, orderIndexFor(items, newIndex));

    if (!isCrossQuadrant) return;

    props.onSetStatus(todoId, 'active');
    switch (quadrant) {
      case 'do-first':
        props.onSetPriority(todoId, 'high');
        props.onSetDueDate(todoId, todayStr());
        break;
      case 'schedule':
        props.onSetPriority(todoId, 'high');
        props.onSetDueDate(todoId, daysFromNow(7));
        break;
      case 'decide':
        props.onSetPriority(todoId, 'medium');
        props.onSetDueDate(todoId, daysFromNow(7));
        break;
      case 'eliminate':
        props.onSetPriority(todoId, 'low');
        props.onSetDueDate(todoId, null);
        break;
    }
  };

  const handleDropToInbox = (todoId: number, newIndex: number, isFromMatrix: boolean) => {
    const items = inboxItems.filter((todo) => todo.id !== todoId);
    props.onReorder(todoId, orderIndexFor(items, newIndex));
    if (isFromMatrix) props.onSetStatus(todoId, 'inbox');
  };

  const renderRow = (todo: TodoItem) => (
    <TodoRow
      key={todo.id}
      todo={todo}
      onOpen={() => setOpenTodoId(todo.id)}
      onToggle={props.onToggle}
      onSetPriority={props.onSetPriority}
    />
  );

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      {/* ── Capture ─────────────────────────────────────────── */}
      <div class="flex shrink-0 gap-2 border-b border-line/60 px-3 py-2">
        <input
          type="text"
          value={captureText}
          onInput={(e) => setCaptureText((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCapture();
          }}
          placeholder="Capture a task… plain text lands in the inbox"
          maxLength={200}
          class="min-h-[44px] flex-1 rounded-[9px] border border-line/60 bg-ink px-3 text-[19px] text-text outline-none transition-colors placeholder:text-faint focus:border-action"
        />
        <button
          type="button"
          onClick={handleCapture}
          disabled={!captureText.trim()}
          class="min-h-[44px] shrink-0 rounded-[9px] bg-action px-4 text-[17px] font-semibold text-ink transition-all active:scale-[0.98] disabled:opacity-40"
        >
          Add
        </button>
      </div>

      <div class="flex min-h-0 flex-1">
        {/* ── Matrix ────────────────────────────────────────── */}
        <div class="grid flex-1 grid-cols-2 grid-rows-2 gap-px overflow-hidden bg-line/60">
          {QUADRANTS.map((quadrant) => {
            const items = groups[quadrant.id];

            return (
              <div key={quadrant.id} class="relative flex flex-col overflow-hidden bg-ink">
                <div class="flex shrink-0 items-center gap-2 px-3 py-2">
                  <span
                    class="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: quadrant.accent }}
                    aria-hidden="true"
                  />
                  <span class="text-[16px] font-semibold" style={{ color: quadrant.accent }}>
                    {quadrant.label}
                  </span>
                  <span class="ml-auto font-mono text-[14px] text-faint">{items.length}</span>
                </div>

                <SortableZone
                  key={`${quadrant.id}-${items.map((todo) => todo.id).join(',')}`}
                  quadrantId={quadrant.id}
                  onDropToQuadrant={handleDropToQuadrant}
                >
                  {items.length === 0 ? (
                    <p class="mt-6 select-none text-center text-[16px] font-medium text-faint">
                      Drop a task here
                    </p>
                  ) : (
                    items.map(renderRow)
                  )}
                </SortableZone>
              </div>
            );
          })}
        </div>

        {/* ── Holding pen ───────────────────────────────────── */}
        <aside class="flex w-[384px] shrink-0 flex-col overflow-hidden border-l border-line/60 bg-ink">
          <div class="flex h-12 shrink-0 items-center gap-2 border-b border-line/60 px-3">
            <span class="text-[15px] font-semibold text-muted">Inbox</span>
            <span class="font-mono text-[14px] text-faint">{inboxItems.length}</span>
            <span class="ml-auto text-[14px] text-faint">drag into a quadrant</span>
          </div>

          <SortableInbox
            key={inboxItems.map((todo) => todo.id).join(',')}
            onDropToInbox={handleDropToInbox}
          >
            {inboxItems.length === 0 ? (
              <p class="mt-6 select-none text-center text-[16px] font-medium text-faint">
                Nothing waiting
              </p>
            ) : (
              inboxItems.map(renderRow)
            )}
          </SortableInbox>
        </aside>
      </div>

      {openTodo && (
        <TodoDialog
          todo={openTodo}
          onClose={() => setOpenTodoId(null)}
          onEdit={props.onEdit}
          onDelete={(id) => {
            props.onDelete(id);
            setOpenTodoId(null);
          }}
          onSetPriority={props.onSetPriority}
          onSetDueDate={props.onSetDueDate}
          onSetNotes={props.onSetNotes}
          onSetSchedule={props.onSetSchedule}
          onSetReminder={props.onSetReminder}
          addSubtask={props.addSubtask}
          toggleSubtask={props.toggleSubtask}
          editSubtask={props.editSubtask}
          deleteSubtask={props.deleteSubtask}
        />
      )}
    </div>
  );
}

// ── Drag zones ───────────────────────────────────────────────────

const DRAG_OPTIONS = {
  group: 'todos',
  animation: 150,
  delay: 50,
  delayOnTouchOnly: true,
  touchStartThreshold: 3,
} as const;

function SortableZone({
  quadrantId,
  onDropToQuadrant,
  children,
}: {
  quadrantId: QuadrantId;
  onDropToQuadrant: (todoId: number, quadrant: QuadrantId, index: number, crossed: boolean) => void;
  children: any;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const onDropRef = useRef(onDropToQuadrant);
  onDropRef.current = onDropToQuadrant;

  useEffect(() => {
    if (!listRef.current) return;

    const sortable = Sortable.create(listRef.current, {
      ...DRAG_OPTIONS,
      onEnd: (event) => {
        // SortableJS fires onEnd on both the source and the target list. Only
        // the list the card landed in may decide what happened.
        if (event.to !== listRef.current) return;

        const todoId = parseInt(event.item.dataset.todoId || '', 10);
        if (!todoId || Number.isNaN(todoId)) return;
        const newIndex = event.newDraggableIndex ?? event.newIndex ?? 0;
        onDropRef.current(todoId, quadrantId, newIndex, event.from !== event.to);
      },
    });

    return () => sortable.destroy();
  }, []);

  return (
    <div
      ref={listRef}
      data-quadrant-id={quadrantId}
      class="flex-1 overflow-y-auto px-1.5 py-1 custom-scrollbar"
    >
      {children}
    </div>
  );
}

function SortableInbox({
  onDropToInbox,
  children,
}: {
  onDropToInbox: (todoId: number, index: number, fromMatrix: boolean) => void;
  children: any;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const onDropRef = useRef(onDropToInbox);
  onDropRef.current = onDropToInbox;

  useEffect(() => {
    if (!listRef.current) return;

    const sortable = Sortable.create(listRef.current, {
      ...DRAG_OPTIONS,
      onEnd: (event) => {
        // Only act when the card actually landed in the pen — otherwise the
        // quadrant that received it would be undone by this handler.
        if (event.to !== listRef.current) return;

        const todoId = parseInt(event.item.dataset.todoId || '', 10);
        if (!todoId || Number.isNaN(todoId)) return;
        const newIndex = event.newDraggableIndex ?? event.newIndex ?? 0;
        onDropRef.current(todoId, newIndex, event.from !== event.to);
      },
    });

    return () => sortable.destroy();
  }, []);

  return (
    <div ref={listRef} class="flex-1 overflow-y-auto px-1.5 py-1 custom-scrollbar">
      {children}
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────

function TodoRow({
  todo,
  onOpen,
  onToggle,
  onSetPriority,
}: {
  todo: TodoItem;
  onOpen: () => void;
  onToggle: (id: number) => void;
  onSetPriority: (id: number, priority: 'high' | 'medium' | 'low') => void;
}) {
  const cyclePriority = (event: Event) => {
    event.stopPropagation();
    const order: Array<'high' | 'medium' | 'low'> = ['medium', 'high', 'low'];
    onSetPriority(todo.id, order[(order.indexOf(todo.priority) + 1) % order.length]);
  };

  const badge = formatDateBadge(todoDate(todo));
  const glyph = priorityGlyph(todo.priority);

  return (
    <div
      data-todo-id={todo.id}
      class={`flex items-start gap-1 border-b border-line/30 py-1 pl-1 pr-1 ${
        todo.completed ? 'opacity-60' : ''
      }`}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle(todo.id);
        }}
        aria-label={todo.completed ? 'Mark incomplete' : 'Mark complete'}
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] active:bg-raised"
      >
        <span
          class={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border-2 transition-colors ${
            todo.completed ? 'border-ok bg-ok' : 'border-line'
          }`}
        >
          {todo.completed && <CheckIcon />}
        </span>
      </button>

      <button
        type="button"
        onClick={cyclePriority}
        aria-label={`Priority: ${todo.priority}`}
        title={`Priority: ${todo.priority}`}
        class="mt-2.5 w-[18px] shrink-0 font-mono text-[18px] font-bold active:brightness-125"
        style={{ color: glyph.color }}
      >
        {glyph.char}
      </button>

      <button type="button" onClick={onOpen} class="min-w-0 flex-1 py-2 text-left">
        <span
          class={`block select-none break-words text-[19px] leading-snug ${
            todo.completed ? 'text-faint line-through' : 'text-text'
          }`}
        >
          {todo.text}
        </span>
      </button>

      <span
        class={`mt-2 shrink-0 rounded-[6px] px-1.5 py-1 font-mono text-[15px] font-semibold ${
          badge.isOverdue
            ? 'bg-alert/15 text-alert'
            : badge.isToday
            ? 'bg-warn/15 text-warn'
            : todoDate(todo)
            ? 'bg-surface text-muted'
            : 'bg-surface text-faint'
        }`}
      >
        {badge.text || '+ date'}
      </span>

      <button
        type="button"
        onClick={onOpen}
        aria-label="Open task"
        class="mt-1 flex h-9 w-8 shrink-0 items-center justify-center text-[18px] text-faint active:text-action"
      >
        ⋯
      </button>
    </div>
  );
}

// ── Task dialog ──────────────────────────────────────────────────

function TodoDialog({
  todo,
  onClose,
  onEdit,
  onDelete,
  onSetPriority,
  onSetDueDate,
  onSetNotes,
  onSetSchedule,
  onSetReminder,
  addSubtask,
  toggleSubtask,
  editSubtask,
  deleteSubtask,
}: {
  todo: TodoItem;
  onClose: () => void;
  onEdit: (id: number, text: string) => void;
  onDelete: (id: number) => void;
  onSetPriority: (id: number, priority: 'high' | 'medium' | 'low') => void;
  onSetDueDate: (id: number, dueDate: string | null) => void;
  onSetNotes: (id: number, notes: string) => void;
  onSetSchedule: (id: number, scheduledDate: string | null, scheduledTime: string | null) => void;
  onSetReminder: (id: number, reminderAt: number | null) => void;
  addSubtask: (todoId: number, text: string) => void;
  toggleSubtask: (id: number) => void;
  editSubtask: (id: number, text: string) => void;
  deleteSubtask: (id: number) => void;
}) {
  const [textDraft, setTextDraft] = useState(todo.text);
  const [notesDraft, setNotesDraft] = useState(todo.notes);
  const [subtaskText, setSubtaskText] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<number | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState('');
  const reminderPicker = usePicker();

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const subtasks = (todo.subtasks || []).slice().sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return a.order_index - b.order_index;
  });
  const reminderLabel = formatReminderLabel(todo.reminder_at);
  const date = todoDate(todo);
  const badge = formatDateBadge(date);

  const nowEpoch = () => Date.now() / 1000;

  const beforeDue = (minutes: number): number => {
    const at = whenEpoch(todo);
    const candidate = at - minutes * 60;
    return candidate > nowEpoch() ? candidate : at;
  };

  const commitText = () => {
    if (textDraft.trim() && textDraft.trim() !== todo.text) onEdit(todo.id, textDraft.trim());
  };

  const handleAddSubtask = () => {
    const text = subtaskText.trim();
    if (!text || (todo.subtasks || []).length >= 20) return;
    addSubtask(todo.id, text);
    setSubtaskText('');
  };

  const field = 'flex items-start gap-3 border-b border-line/30 px-4 py-2';
  const label = 'w-[76px] shrink-0 pt-2 text-[15px] font-semibold text-faint';

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Task"
      onClick={onClose}
    >
      <div
        class="flex max-h-[88vh] w-[580px] max-w-[94vw] flex-col overflow-hidden rounded-[14px] border border-line bg-surface"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Title */}
        <div class="flex items-center gap-2 border-b border-line/60 px-4 py-3">
          <input
            type="text"
            value={textDraft}
            onInput={(event) => setTextDraft((event.target as HTMLInputElement).value)}
            onBlur={commitText}
            onKeyDown={(event) => {
              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            }}
            maxLength={200}
            class="min-w-0 flex-1 border-b border-transparent bg-transparent text-[21px] font-semibold text-text outline-none focus:border-action"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px] text-[18px] text-faint active:bg-raised active:text-text"
          >
            ✕
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          {/* Priority */}
          <div class={field}>
            <span class={label}>Priority</span>
            <div class="flex gap-1.5 pt-1">
              {PRIORITIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSetPriority(todo.id, option.value)}
                  class={`min-h-[40px] rounded-[8px] border px-3 text-[16px] font-semibold transition-colors active:scale-[0.98] ${
                    todo.priority === option.value
                      ? 'border-current'
                      : 'border-line text-muted'
                  }`}
                  style={
                    todo.priority === option.value
                      ? { color: option.color, backgroundColor: `${option.color}1a` }
                      : undefined
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due */}
          <div class={field}>
            <span class={label}>Due</span>
            <div class="flex flex-wrap items-center gap-1.5 pt-1">
              {[
                { text: 'Today', value: todayStr() },
                { text: 'Tomorrow', value: daysFromNow(1) },
                { text: 'Next week', value: daysFromNow(7) },
              ].map((option) => (
                <button
                  key={option.text}
                  type="button"
                  onClick={() => onSetDueDate(todo.id, option.value)}
                  class={`min-h-[40px] rounded-[8px] border px-3 font-mono text-[15px] font-semibold transition-colors active:scale-[0.98] ${
                    date === option.value
                      ? 'border-warn bg-warn/15 text-warn'
                      : 'border-line text-muted'
                  }`}
                >
                  {option.text}
                </button>
              ))}

              <input
                type="date"
                value={date || ''}
                onChange={(event) =>
                  onSetDueDate(todo.id, (event.target as HTMLInputElement).value || null)
                }
                class="min-h-[40px] rounded-[8px] border border-line bg-ink px-2 font-mono text-[15px] text-text outline-none"
              />

              {date && (
                <button
                  type="button"
                  onClick={() => onSetDueDate(todo.id, null)}
                  class="min-h-[40px] rounded-[8px] border border-line px-3 font-mono text-[15px] font-semibold text-alert"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Notes */}
          <div class={field}>
            <span class={label}>Notes</span>
            <input
              type="text"
              value={notesDraft}
              onInput={(event) => setNotesDraft((event.target as HTMLInputElement).value)}
              onBlur={() => {
                if (notesDraft !== todo.notes) onSetNotes(todo.id, notesDraft);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
              }}
              placeholder="Context, links, what to check…"
              maxLength={500}
              class="min-w-0 flex-1 border-b border-transparent bg-transparent pt-2 text-[18px] text-muted outline-none placeholder:text-faint focus:border-action"
            />
          </div>

          {/* Time + reminder */}
          <div class={field}>
            <span class={label}>Time</span>
            <div class="flex flex-wrap items-center gap-2 pt-1">
              <input
                type="time"
                value={todo.scheduled_time || ''}
                onChange={(event) =>
                  onSetSchedule(todo.id, date, (event.target as HTMLInputElement).value || null)
                }
                class="min-h-[40px] rounded-[8px] border border-line bg-ink px-2 font-mono text-[16px] text-text outline-none"
              />
              <span class="text-[14px] text-faint">optional, anchors reminders</span>

              <div ref={reminderPicker.ref} class="relative ml-auto">
                <button
                  type="button"
                  onClick={reminderPicker.toggle}
                  class={`min-h-[40px] rounded-[8px] border px-3 font-mono text-[15px] font-semibold transition-colors ${
                    reminderLabel
                      ? 'border-warn bg-warn/15 text-warn'
                      : 'border-line text-muted'
                  }`}
                >
                  {reminderLabel ? `⏰ ${reminderLabel}` : '⏰ Remind'}
                </button>

                {reminderPicker.open && (
                  <div
                    class={`absolute right-0 z-30 flex min-w-[210px] flex-col gap-0.5 rounded-[9px] border border-line bg-surface p-1.5 ${
                      reminderPicker.dir === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
                    }`}
                  >
                    {[
                      { text: 'Off', value: null },
                      { text: 'In 30 min', value: nowEpoch() + 1800 },
                      { text: 'In 1 hour', value: nowEpoch() + 3600 },
                      { text: '10 min before it is due', value: beforeDue(10) },
                      { text: '1 hour before it is due', value: beforeDue(60) },
                    ].map((option) => (
                      <button
                        key={option.text}
                        type="button"
                        onClick={() => {
                          onSetReminder(todo.id, option.value);
                          reminderPicker.setOpen(false);
                        }}
                        class="px-2 py-1.5 text-left font-mono text-[16px] text-text active:bg-raised"
                      >
                        {option.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Steps */}
          <div class="px-4 py-2">
            <p class="mb-1 text-[15px] font-semibold text-faint">
              Steps {subtasks.length > 0 ? `· ${subtasks.filter((s) => s.completed).length}/${subtasks.length}` : ''}
            </p>

            {subtasks.map((subtask: SubtaskItem) => (
              <div
                key={subtask.id}
                class={`flex min-h-[40px] items-start gap-1 border-b border-line/25 py-0.5 ${
                  subtask.completed ? 'opacity-50' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleSubtask(subtask.id)}
                  aria-label={subtask.completed ? 'Mark incomplete' : 'Mark complete'}
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] active:bg-raised"
                >
                  <span
                    class={`flex h-[15px] w-[15px] items-center justify-center rounded-[4px] border-2 ${
                      subtask.completed ? 'border-ok bg-ok' : 'border-line'
                    }`}
                  >
                    {subtask.completed && <CheckIcon />}
                  </span>
                </button>

                {editingSubtaskId === subtask.id ? (
                  <input
                    type="text"
                    value={editingSubtaskText}
                    onInput={(event) =>
                      setEditingSubtaskText((event.target as HTMLInputElement).value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        if (editingSubtaskText.trim())
                          editSubtask(subtask.id, editingSubtaskText.trim());
                        setEditingSubtaskId(null);
                      }
                      if (event.key === 'Escape') setEditingSubtaskId(null);
                    }}
                    onBlur={() => {
                      if (editingSubtaskText.trim())
                        editSubtask(subtask.id, editingSubtaskText.trim());
                      setEditingSubtaskId(null);
                    }}
                    class="min-w-0 flex-1 rounded border border-action bg-surface px-1.5 py-1 text-[18px] text-text outline-none"
                    autofocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSubtaskId(subtask.id);
                      setEditingSubtaskText(subtask.text);
                    }}
                    class={`min-w-0 flex-1 break-words py-2 text-left text-[18px] leading-snug ${
                      subtask.completed ? 'text-faint line-through' : 'text-text'
                    }`}
                  >
                    {subtask.text}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => deleteSubtask(subtask.id)}
                  aria-label="Delete step"
                  class="flex h-10 w-9 shrink-0 items-center justify-center text-[16px] text-faint active:text-alert"
                >
                  ✕
                </button>
              </div>
            ))}

            {(todo.subtasks || []).length < 20 && (
              <div class="flex min-h-[44px] items-center gap-1 py-1">
                <input
                  type="text"
                  value={subtaskText}
                  onInput={(event) => setSubtaskText((event.target as HTMLInputElement).value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleAddSubtask();
                  }}
                  placeholder="Add step…"
                  maxLength={200}
                  class="min-h-[40px] min-w-0 flex-1 rounded-[8px] border border-line bg-ink px-2 text-[18px] text-text outline-none placeholder:text-faint focus:border-action"
                />
                <button
                  type="button"
                  onClick={handleAddSubtask}
                  disabled={!subtaskText.trim()}
                  class="min-h-[40px] shrink-0 rounded-[8px] bg-action px-3 text-[16px] font-semibold text-ink disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div class="flex shrink-0 items-center justify-between border-t border-line/60 px-4 py-3">
          <button
            type="button"
            onClick={() => onDelete(todo.id)}
            class="flex h-11 items-center rounded-[9px] border border-alert/30 bg-alert/10 px-3 text-[15px] font-semibold text-alert active:scale-[0.98]"
          >
            Archive task
          </button>
          <button
            type="button"
            onClick={onClose}
            class="flex h-11 items-center rounded-[9px] bg-action px-4 text-[16px] font-semibold text-ink active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

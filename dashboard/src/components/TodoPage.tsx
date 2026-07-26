import { useRef, useState, useEffect } from 'preact/hooks';
import Sortable from 'sortablejs';
import type { TodoItem } from '../types';

interface TodoPageProps {
  todos: TodoItem[];
  onAdd: (text: string) => void;
  onToggle: (id: number) => void;
  onEdit: (id: number, text: string) => void;
  onDelete: (id: number) => void;
  onSetPriority: (id: number, priority: 'high' | 'medium' | 'low') => void;
  onSetDueDate: (id: number, dueDate: string | null) => void;
  onReorder: (id: number, orderIndex: number) => void;
}

type QuadrantId = 'do-first' | 'schedule' | 'decide' | 'eliminate';

interface QuadrantDef {
  id: QuadrantId;
  label: string;
  emoji: string;
  bg: string;
  border: string;
}

const QUADRANTS: QuadrantDef[] = [
  { id: 'do-first', label: 'Do First', emoji: '🔴', bg: 'bg-[#2a1a24]', border: '#f7768e' },
  { id: 'schedule', label: 'Schedule', emoji: '🟡', bg: 'bg-[#1a2028]', border: '#7aa2f7' },
  { id: 'decide', label: 'Decide', emoji: '🔵', bg: 'bg-[#1a201e]', border: '#9ece6a' },
  { id: 'eliminate', label: 'Eliminate', emoji: '⚪', bg: 'bg-[#1a1b26]', border: '#3b4261' },
];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getQuadrant(todo: TodoItem): QuadrantId {
  const isUrgent = todo.due_date !== null && todo.due_date <= todayStr();
  const isImportant = todo.priority === 'high' && todo.due_date !== null;

  if (isUrgent && isImportant) return 'do-first';
  if (!isUrgent && isImportant) return 'schedule';
  if (isUrgent && !isImportant) return 'decide';
  return 'eliminate';
}

function formatDateBadge(dueDate: string | null): { text: string; isOverdue: boolean } {
  if (!dueDate) return { text: '', isOverdue: false };
  const today = todayStr();
  if (dueDate < today) return { text: 'Overdue', isOverdue: true };
  if (dueDate === today) return { text: 'Today', isOverdue: false };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  if (dueDate === tomorrowStr) return { text: 'Tomorrow', isOverdue: false };

  // Format as "Mon 30"
  const d = new Date(dueDate + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { text: `${days[d.getDay()]} ${d.getDate()}`, isOverdue: false };
}

function priorityGlyph(priority: string): { char: string; color: string } {
  if (priority === 'high') return { char: '↑', color: '#f7768e' };
  if (priority === 'low') return { char: '↓', color: '#7aa2f7' };
  return { char: '=', color: '#565f89' };
}

export function TodoPage({ todos, onAdd, onToggle, onEdit, onDelete, onSetPriority, onSetDueDate, onReorder }: TodoPageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

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

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') closeAddModal();
  };

  // Group todos by quadrant
  const groups: Record<QuadrantId, TodoItem[]> = { 'do-first': [], 'schedule': [], 'decide': [], 'eliminate': [] };
  for (const t of todos) {
    groups[getQuadrant(t)].push(t);
  }
  // Sort each quadrant: active first, then by date (soonest first), then completed at bottom
  for (const q of Object.keys(groups) as QuadrantId[]) {
    groups[q].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      // Soonest due date first; items without a date go to the bottom
      const aDate = a.due_date || '9999-99-99';
      const bDate = b.due_date || '9999-99-99';
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return a.order_index - b.order_index;
    });
  }

  // Handle cross-quadrant drops — set priority/due_date to match target quadrant
  const handleDropToQuadrant = (todoId: number, targetQuadrant: QuadrantId, newIndex: number, isCrossQuadrant: boolean) => {
    // Calculate order_index from target quadrant's items (using the full todos list)
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

    onReorder(todoId, newOrderIndex);

    // Only adjust priority/date when crossing quadrants
    if (!isCrossQuadrant) return;

    const today = todayStr();
    const nextWeek = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    switch (targetQuadrant) {
      case 'do-first':
        onSetPriority(todoId, 'high');
        onSetDueDate(todoId, today);
        break;
      case 'schedule':
        onSetPriority(todoId, 'high');
        onSetDueDate(todoId, nextWeek);
        break;
      case 'decide':
        onSetPriority(todoId, 'medium');
        onSetDueDate(todoId, today);
        break;
      case 'eliminate':
        onSetPriority(todoId, 'low');
        onSetDueDate(todoId, null);
        break;
    }
  };

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <style>{`
        @keyframes marquee-bounce {
          0%, 15%   { transform: translateX(0); }
          45%, 55%  { transform: translateX(var(--marquee-x)); }
          85%, 100% { transform: translateX(0); }
        }
      `}</style>
      {/* Eisenhower matrix */}
      <div class="flex-1 grid grid-cols-2 grid-rows-2 overflow-hidden">
        {QUADRANTS.map((q) => {
          const items = groups[q.id];
          const isEliminate = q.id === 'eliminate';
          return (
            <div
              key={q.id}
              class={`${q.bg} border border-[#33467c] flex flex-col overflow-hidden ${isEliminate ? 'relative' : ''}`}
            >
              {/* Quadrant header */}
              <div
                class="px-3 py-2 shrink-0 border-b font-bold text-sm flex items-center gap-2 select-none"
                style={{ borderColor: q.border, color: q.border }}
              >
                <span>{q.emoji}</span>
                <span>{q.label}</span>
                {items.length > 0 && (
                  <span class="ml-auto text-xs opacity-70">{items.length}</span>
                )}
              </div>

              {/* Items list — key forces remount when items change, syncing Sortable with React */}
              <SortableZone
                key={`${q.id}-${items.map(t => t.id).join(',')}`}
                quadrantId={q.id}
                items={items}
                onDropToQuadrant={handleDropToQuadrant}
              >
                {items.length === 0 ? (
                  <p class="text-xs text-[#565f89] text-center mt-8 select-none">
                    Nothing here
                  </p>
                ) : (
                  items.map((todo) => (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      onToggle={onToggle}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onSetPriority={onSetPriority}
                      onSetDueDate={onSetDueDate}
                    />
                  ))
                )}
              </SortableZone>

              {/* Floating add button — only in Eliminate quadrant */}
              {isEliminate && (
                <button
                  onClick={openAddModal}
                  class="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-[#7aa2f7] text-[#1a1b26] shadow-lg hover:bg-[#89b4fa] active:scale-90 transition-all select-none flex items-center justify-center text-2xl font-bold z-10"
                  aria-label="Add task"
                  title="Add task"
                >
                  +
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add task modal */}
      {showAddModal && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={closeAddModal}
        >
          <div
            class="bg-[#24283b] border border-[#33467c] rounded-xl shadow-2xl p-5 w-[480px] max-w-[92vw] flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="text-base font-bold text-[#c0caf5]">New Task</h3>
            <input
              ref={inputRef}
              type="text"
              value={text}
              onInput={(e) => setText((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a task… (e.g. Buy groceries)"
              class="flex-1 bg-[#1a1b26] text-[#c0caf5] text-base px-3 py-2 rounded-lg border border-[#33467c] placeholder-[#565f89] outline-none focus:border-[#7aa2f7] transition-colors"
            />
            <p class="text-xs text-[#565f89] -mt-1">
              Add <span class="text-[#f7768e]">!high</span>, <span class="text-[#a9b1d6]">!medium</span>, or <span class="text-[#7aa2f7]">!low</span> for priority. Natural dates work too —<br/>e.g. "Fix login bug !high tomorrow" → <span class="text-[#f7768e]">Do First</span> · "Redesign page !high" → <span class="text-[#c0caf5]">Eliminate</span>
            </p>
            <div class="flex gap-2 justify-end">
              <button
                onClick={closeAddModal}
                class="px-4 py-2 rounded-lg text-sm font-medium bg-[#1a1b26] text-[#a9b1d6] hover:bg-[#33467c] transition-colors select-none"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!text.trim()}
                class="px-4 py-2 rounded-lg text-sm font-bold bg-[#7aa2f7] text-[#1a1b26] hover:bg-[#89b4fa] active:scale-95 transition-all select-none disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

function TodoRow({
  todo,
  onToggle,
  onEdit,
  onDelete,
  onSetPriority,
  onSetDueDate,
}: {
  todo: TodoItem;
  onToggle: (id: number) => void;
  onEdit: (id: number, text: string) => void;
  onDelete: (id: number) => void;
  onSetPriority: (id: number, priority: 'high' | 'medium' | 'low') => void;
  onSetDueDate: (id: number, dueDate: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
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

  const cyclePriority = () => {
    const order: Array<'high' | 'medium' | 'low'> = ['medium', 'high', 'low'];
    const idx = order.indexOf(todo.priority);
    onSetPriority(todo.id, order[(idx + 1) % order.length]);
  };

  const dateBadge = formatDateBadge(todo.due_date);

  const applyQuickDate = (dateStr: string | null) => {
    onSetDueDate(todo.id, dateStr);
    setShowDatePicker(false);
  };

  // Quick date options
  const today = todayStr();
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const nextWeek = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const pGlyph = priorityGlyph(todo.priority);

  // Detect text overflow for marquee
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const check = () => {
      const overflow = el.scrollWidth - el.clientWidth;
      if (overflow > 0) {
        setOverflowing(true);
        el.style.setProperty('--marquee-x', `-${overflow}px`);
      } else {
        setOverflowing(false);
      }
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [todo.text]);

  return (
    <div
      data-todo-id={todo.id}
      class={`flex items-center gap-1.5 py-1 group ${todo.completed ? 'opacity-50' : ''}`}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(todo.id)}
        class={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
          todo.completed
            ? 'bg-[#9ece6a] border-[#9ece6a]'
            : 'border-[#565f89] hover:border-[#7aa2f7]'
        }`}
        aria-label={todo.completed ? 'Uncomplete' : 'Complete'}
      >
        {todo.completed && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5L4 7L8 3"
              stroke="#1a1b26"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        )}
      </button>

      {/* Priority glyph */}
      <button
        onClick={cyclePriority}
        class="text-xs font-bold shrink-0 hover:scale-125 transition-transform select-none leading-none"
        style={{ color: pGlyph.color }}
        aria-label={`Priority: ${todo.priority}`}
        title={todo.priority}
      >
        {pGlyph.char}
      </button>

      {/* Text or edit input */}
      {editing ? (
        <input
          ref={editInputRef}
          type="text"
          value={editText}
          onInput={(e) => setEditText((e.target as HTMLInputElement).value)}
          onKeyDown={handleEditKeyDown}
          onBlur={commitEdit}
          class="flex-1 bg-[#24283b] text-[#c0caf5] text-sm px-1.5 py-0.5 rounded border border-[#7aa2f7] outline-none min-w-0"
        />
      ) : (
        <span
          onClick={startEdit}
          class="overflow-hidden min-w-0 flex-1"
        >
          <span
            ref={textRef}
            class={`text-sm select-none cursor-text whitespace-nowrap inline-block max-w-full ${
              overflowing ? 'animate-[marquee-bounce_24s_ease-in-out_infinite]' : ''
            } ${
              todo.completed
                ? 'text-[#565f89] line-through'
                : 'text-[#c0caf5]'
            }`}
          >
            {todo.text}
          </span>
        </span>
      )}

      {/* Due date badge */}
      <div class="relative shrink-0">
        {dateBadge.text ? (
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            class={`text-[10px] px-1.5 py-0.5 rounded font-medium select-none ${
              dateBadge.isOverdue
                ? 'bg-[#f7768e]/20 text-[#f7768e]'
                : 'bg-[#24283b] text-[#a9b1d6] hover:bg-[#33467c]'
            }`}
          >
            {dateBadge.text}
          </button>
        ) : (
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            class="text-[10px] px-1.5 py-0.5 rounded font-medium select-none bg-[#24283b] text-[#565f89] hover:bg-[#33467c] opacity-0 group-hover:opacity-100 transition-opacity"
          >
            +date
          </button>
        )}

        {/* Date picker dropdown */}
        {showDatePicker && (
          <div class="absolute right-0 top-full mt-1 z-20 bg-[#24283b] border border-[#33467c] rounded-lg shadow-lg p-1.5 flex flex-col gap-1 min-w-[130px]">
            <button
              onClick={() => applyQuickDate(today)}
              class="text-xs text-left px-2 py-1 rounded hover:bg-[#33467c] text-[#c0caf5]"
            >
              Today
            </button>
            <button
              onClick={() => applyQuickDate(tomorrow)}
              class="text-xs text-left px-2 py-1 rounded hover:bg-[#33467c] text-[#c0caf5]"
            >
              Tomorrow
            </button>
            <button
              onClick={() => applyQuickDate(nextWeek)}
              class="text-xs text-left px-2 py-1 rounded hover:bg-[#33467c] text-[#c0caf5]"
            >
              Next Week
            </button>
            <div class="px-2 py-1">
              <input
                type="date"
                onChange={(e) => {
                  const val = (e.target as HTMLInputElement).value;
                  if (val) applyQuickDate(val);
                }}
                class="text-xs bg-[#1a1b26] text-[#c0caf5] border border-[#33467c] rounded px-1 py-0.5 outline-none w-full"
              />
            </div>
            {todo.due_date && (
              <button
                onClick={() => applyQuickDate(null)}
                class="text-xs text-left px-2 py-1 rounded hover:bg-[#33467c] text-[#f7768e]"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(todo.id)}
        class="text-[#565f89] hover:text-[#f7768e] opacity-0 group-hover:opacity-100 transition-all text-xs px-1 select-none shrink-0"
        aria-label="Delete todo"
      >
        ✕
      </button>
    </div>
  );
}

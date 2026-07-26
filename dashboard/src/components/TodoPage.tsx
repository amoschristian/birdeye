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
  border: string;
  lampColor: string;
}

const QUADRANTS: QuadrantDef[] = [
  { id: 'do-first', label: 'DO FIRST', border: '#ff4d4d', lampColor: '#ff4d4d' },
  { id: 'schedule', label: 'SCHEDULE', border: '#4da6ff', lampColor: '#4da6ff' },
  { id: 'decide', label: 'DECIDE', border: '#2ecc71', lampColor: '#2ecc71' },
  { id: 'eliminate', label: 'ELIMINATE', border: '#252d38', lampColor: '#8a9ba8' },
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

function priorityGlyph(priority: string): { char: string; color: string } {
  if (priority === 'high') return { char: 'H', color: '#ff4d4d' };
  if (priority === 'low') return { char: 'L', color: '#4da6ff' };
  return { char: 'M', color: '#8a9ba8' };
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

    onReorder(todoId, newOrderIndex);

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
      {/* Panel grid: 2×2 */}
      <div class="flex-1 grid grid-cols-2 grid-rows-2 overflow-hidden gap-px bg-[#252d38]">
        {QUADRANTS.map((q) => {
          const items = groups[q.id];
          const isEliminate = q.id === 'eliminate';
          return (
            <div
              key={q.id}
              class="bg-[#0a0e14] flex flex-col overflow-hidden relative"
            >
              {/* Panel header */}
              <div
                class="px-3 py-2 shrink-0 border-b flex items-center gap-2 select-none"
                style={{ borderColor: q.border }}
              >
                <span class="w-2 h-2 rounded-full lamp-glow-green" style={{ backgroundColor: q.lampColor, boxShadow: `0 0 6px ${q.lampColor}80` }} />
                <span class="text-[13px] font-semibold uppercase tracking-[0.08em]" style={{ color: q.border }}>{q.label}</span>
                {items.length > 0 && (
                  <span class="ml-auto font-mono text-[13px] text-[#8a9ba8]">{items.length}</span>
                )}
              </div>

              {/* Items */}
              <SortableZone
                key={`${q.id}-${items.map(t => t.id).join(',')}`}
                quadrantId={q.id}
                items={items}
                onDropToQuadrant={handleDropToQuadrant}
              >
                {items.length === 0 ? (
                  <p class="font-mono text-[13px] text-[#8a9ba8] text-center mt-8 select-none uppercase tracking-[0.06em]">
                    NO ITEMS
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

              {/* Floating add button — Eliminate only */}
              {isEliminate && (
                <button
                  onClick={openAddModal}
                  class="absolute bottom-4 right-4 w-12 h-12 bg-[#4da6ff] text-[#0a0e14] active:brightness-125 transition-all select-none flex items-center justify-center text-2xl font-bold z-10 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
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
          class="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(10,14,20,0.7)' }}
          onClick={closeAddModal}
        >
          <div
            class="bg-[#141b24] border border-[#252d38] p-5 w-[440px] max-w-[92vw] flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 class="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#4da6ff] border-b border-[#252d38] pb-2">NEW TASK</h3>
            <input
              ref={inputRef}
              type="text"
              value={text}
              onInput={(e) => setText((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter command…"
              class="flex-1 bg-[#0a0e14] text-[#c8d6e0] text-base px-3 py-2 border border-[#252d38] placeholder-[#8a9ba8] outline-none focus:border-[#4da6ff] transition-colors rounded-[4px] min-h-[44px]"
            />
            <p class="font-mono text-[13px] text-[#8a9ba8] -mt-1">
              <span class="text-[#ff4d4d]">!high</span> <span class="text-[#8a9ba8]">!medium</span> <span class="text-[#4da6ff]">!low</span> — priority tags. Natural dates: "Fix login !high tomorrow" → DO FIRST
            </p>
            <div class="flex gap-2 justify-end">
              <button
                onClick={closeAddModal}
                class="px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.06em] bg-[#0a0e14] text-[#8a9ba8] hover:bg-[#252d38] transition-colors select-none rounded-sm focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2"
              >
                CANCEL
              </button>
              <button
                onClick={handleAdd}
                disabled={!text.trim()}
                class="px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.06em] bg-[#4da6ff] text-[#0a0e14] hover:bg-[#6bb8ff] active:brightness-125 transition-all select-none rounded-sm disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
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

  return (
    <div
      data-todo-id={todo.id}
      class={`flex items-center gap-1.5 py-1.5 px-1 border-b border-[#252d38] group transition-opacity duration-300 min-h-[44px] ${todo.completed ? 'opacity-50' : ''}`}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(todo.id)}
        class={`w-[18px] h-[18px] border-2 shrink-0 flex items-center justify-center transition-all duration-150 active:brightness-125 focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2 ${
          todo.completed
            ? 'bg-[#2ecc71] border-[#2ecc71]'
            : 'border-[#252d38] hover:border-[#4da6ff]'
        }`}
        aria-label={todo.completed ? 'Uncomplete' : 'Complete'}
      >
        {todo.completed && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5L4 7L8 3"
              stroke="#0a0e14"
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
        class="font-mono text-[13px] font-bold shrink-0 hover:brightness-125 transition-all select-none focus-visible:outline-2 focus-visible:outline-offset-1 rounded-sm px-0.5"
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
          class="flex-1 bg-[#141b24] text-[#c8d6e0] text-[14px] px-1.5 py-0.5 border border-[#4da6ff] outline-none min-w-0 font-mono"
        />
      ) : (
        <span
          onClick={startEdit}
          class="overflow-hidden min-w-0 flex-1 cursor-text"
        >
          <span
            ref={textRef}
            class={`font-mono text-[14px] select-none whitespace-nowrap inline-block max-w-full ${
              todo.completed
                ? 'text-[#8a9ba8] line-through'
                : 'text-[#c8d6e0]'
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
            class={`font-mono text-[11px] px-1.5 py-0.5 font-semibold uppercase tracking-[0.06em] select-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 ${
              dateBadge.isOverdue
                ? 'bg-[#ff4d4d]/15 text-[#ff4d4d]'
                : dateBadge.isToday
                ? 'bg-[#ff8c42]/15 text-[#ff8c42]'
                : 'bg-[#141b24] text-[#c8d6e0] hover:bg-[#252d38]'
            }`}
          >
            {dateBadge.text}
          </button>
        ) : (
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            class="font-mono text-[11px] px-1.5 py-0.5 font-semibold uppercase tracking-[0.06em] select-none bg-[#141b24] text-[#8a9ba8] hover:bg-[#252d38] opacity-0 group-hover:opacity-100 transition-opacity focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-1"
          >
            +DATE
          </button>
        )}

        {showDatePicker && (
          <div class="absolute right-0 top-full mt-1 z-20 bg-[#141b24] border border-[#252d38] p-1.5 flex flex-col gap-1 min-w-[130px]">
            <button onClick={() => applyQuickDate(today)} class="text-[13px] text-left px-2 py-1 hover:bg-[#252d38] text-[#c8d6e0] font-mono">TODAY</button>
            <button onClick={() => applyQuickDate(tomorrow)} class="text-[13px] text-left px-2 py-1 hover:bg-[#252d38] text-[#c8d6e0] font-mono">TOMORROW</button>
            <button onClick={() => applyQuickDate(nextWeek)} class="text-[13px] text-left px-2 py-1 hover:bg-[#252d38] text-[#c8d6e0] font-mono">NEXT WEEK</button>
            <div class="px-2 py-1">
              <input
                type="date"
                onChange={(e) => {
                  const val = (e.target as HTMLInputElement).value;
                  if (val) applyQuickDate(val);
                }}
                class="font-mono text-[13px] bg-[#0a0e14] text-[#c8d6e0] border border-[#252d38] px-1 py-0.5 outline-none w-full"
              />
            </div>
            {todo.due_date && (
              <button onClick={() => applyQuickDate(null)} class="text-[13px] text-left px-2 py-1 hover:bg-[#252d38] text-[#ff4d4d] font-mono">CLEAR</button>
            )}
          </div>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(todo.id)}
        class="text-[#8a9ba8] hover:text-[#ff4d4d] opacity-0 group-hover:opacity-100 transition-all text-xs px-1 select-none shrink-0 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[#ff4d4d] focus-visible:outline-offset-1 font-mono"
        aria-label="Delete todo"
      >
        ✕
      </button>
    </div>
  );
}

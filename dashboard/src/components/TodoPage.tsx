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
  accent: string;
}

const QUADRANTS: QuadrantDef[] = [
  { id: 'do-first', label: 'DO FIRST', accent: '#FF4757' },
  { id: 'schedule', label: 'SCHEDULE', accent: '#00D4FF' },
  { id: 'decide', label: 'DECIDE', accent: '#26DE81' },
  { id: 'eliminate', label: 'ELIMINATE', accent: '#4A6080' },
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
  if (priority === 'high') return { char: 'H', color: '#FF4757' };
  if (priority === 'low') return { char: 'L', color: '#00D4FF' };
  return { char: 'M', color: '#8BA3C7' };
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
      <div class="flex-1 grid grid-cols-2 grid-rows-2 overflow-hidden gap-px bg-[#1E3A5F]">
        {QUADRANTS.map((q) => {
          const items = groups[q.id];
          return (
            <div
              key={q.id}
              class="bg-[#0B1120] flex flex-col overflow-hidden relative"
            >
              {/* Quadrant header */}
              <div
                class="px-3 py-2 shrink-0 border-b flex items-center gap-2 select-none"
                style={{ borderColor: q.accent }}
              >
                <span
                  class="w-2 h-2 shrink-0"
                  style={{ backgroundColor: q.accent }}
                />
                <span
                  class="text-[14px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: q.accent }}
                >
                  {q.label}
                </span>
                {items.length > 0 && (
                  <span class="ml-auto font-mono text-[14px] text-[#4A6080]">{items.length}</span>
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
                  <p class="text-[14px] text-[#4A6080] text-center mt-8 select-none uppercase tracking-[0.06em] font-semibold">
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
            </div>
          );
        })}
      </div>

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
            <h3 class="text-[14px] font-semibold uppercase tracking-[0.06em] text-[#00D4FF] border-b border-[#1E3A5F] pb-2">
              NEW TASK
            </h3>
            <input
              ref={inputRef}
              type="text"
              value={text}
              onInput={(e) => setText((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter command…"
              class="flex-1 bg-[#0B1120] text-[#E8F0FE] text-[16px] px-3 py-2 border border-[#1E3A5F] placeholder-[#4A6080] outline-none focus:border-[#00D4FF] transition-colors min-h-[44px]"
            />
            <p class="text-[14px] text-[#8BA3C7] -mt-1 leading-snug">
              <span class="text-[#FF4757] font-semibold">!high</span>{' '}
              <span class="text-[#8BA3C7] font-semibold">!medium</span>{' '}
              <span class="text-[#00D4FF] font-semibold">!low</span>
              {' — '}priority tags. Natural dates: "Fix login !high tomorrow" → DO FIRST
            </p>
            <div class="flex gap-2 justify-end">
              <button
                onClick={closeAddModal}
                class="px-4 py-2 text-[14px] font-semibold uppercase tracking-[0.06em] bg-[#0B1120] text-[#8BA3C7] hover:bg-[#1E3A5F] transition-colors focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2"
              >
                CANCEL
              </button>
              <button
                onClick={handleAdd}
                disabled={!text.trim()}
                class="px-4 py-2 text-[14px] font-semibold uppercase tracking-[0.06em] bg-[#00D4FF] text-[#0B1120] hover:brightness-110 active:brightness-125 transition-all disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
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
  const editInputRef = useRef<HTMLInputElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);

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

  const dateBadge = formatDateBadge(todo.due_date);

  const applyQuickDate = (dateStr: string | null) => {
    onSetDueDate(todo.id, dateStr);
    setShowDatePicker(false);
  };

  const handleDatePickerToggle = (e: Event) => {
    e.stopPropagation();
    setShowDatePicker(!showDatePicker);
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
      onClick={() => onToggle(todo.id)}
      class={`flex items-start gap-1.5 py-2 px-1 border-b border-[#162035] group transition-opacity duration-300 min-h-[44px] cursor-pointer ${
        todo.completed ? 'opacity-50' : ''
      }`}
    >
      {/* Priority glyph */}
      <button
        onClick={cyclePriority}
        class="font-mono text-[14px] font-bold shrink-0 hover:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-offset-1 px-0.5 mt-0.5"
        style={{ color: pGlyph.color }}
        aria-label={`Priority: ${todo.priority}`}
        title={todo.priority}
      >
        {pGlyph.char}
      </button>

      {/* Text / edit */}
      {editing ? (
        <input
          ref={editInputRef}
          type="text"
          value={editText}
          onInput={(e) => setEditText((e.target as HTMLInputElement).value)}
          onKeyDown={handleEditKeyDown}
          onBlur={commitEdit}
          onClick={(e) => e.stopPropagation()}
          class="flex-1 bg-[#111827] text-[#E8F0FE] text-[16px] px-1.5 py-0.5 border border-[#00D4FF] outline-none min-w-0 font-mono"
        />
      ) : (
        <span class="flex-1 min-w-0 py-0.5">
          <span
            class={`text-[16px] leading-snug break-words select-none ${
              todo.completed
                ? 'text-[#4A6080] line-through'
                : 'text-[#E8F0FE]'
            }`}
          >
            {todo.text}
          </span>
        </span>
      )}

      {/* Due date badge */}
      <div class="relative shrink-0" ref={datePickerRef}>
        {dateBadge.text ? (
          <button
            onClick={handleDatePickerToggle}
            class={`font-mono text-[12px] px-1.5 py-0.5 font-semibold uppercase tracking-[0.06em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 mt-0.5 ${
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
            onClick={handleDatePickerToggle}
            class="font-mono text-[12px] px-1.5 py-0.5 font-semibold uppercase tracking-[0.06em] bg-[#111827] text-[#4A6080] active:bg-[#1E3A5F] transition-colors focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-1 mt-0.5"
          >
            +DATE
          </button>
        )}

        {showDatePicker && (
          <div class="absolute right-0 top-full mt-1 z-20 bg-[#111827] border border-[#1E3A5F] p-1.5 flex flex-col gap-1 min-w-[130px]">
            <button onClick={() => applyQuickDate(today)} class="text-[14px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono">TODAY</button>
            <button onClick={() => applyQuickDate(tomorrow)} class="text-[14px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono">TOMORROW</button>
            <button onClick={() => applyQuickDate(nextWeek)} class="text-[14px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#E8F0FE] font-mono">NEXT WEEK</button>
            <div class="px-2 py-1">
              <input
                type="date"
                onChange={(e) => {
                  const val = (e.target as HTMLInputElement).value;
                  if (val) applyQuickDate(val);
                }}
                class="font-mono text-[14px] bg-[#0B1120] text-[#E8F0FE] border border-[#1E3A5F] px-1 py-0.5 outline-none w-full"
              />
            </div>
            {todo.due_date && (
              <button onClick={() => applyQuickDate(null)} class="text-[14px] text-left px-2 py-1 hover:bg-[#1A2535] text-[#FF4757] font-mono">CLEAR</button>
            )}
          </div>
        )}
      </div>

      {/* Edit */}
      <button
        onClick={startEdit}
        class="text-[#4A6080] active:text-[#00D4FF] transition-all px-1 shrink-0 focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-1 text-[16px] mt-0.5"
        aria-label="Edit todo"
      >
        ✎
      </button>

      {/* Delete */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(todo.id); }}
        class="text-[#4A6080] active:text-[#FF4757] transition-all px-1 shrink-0 focus-visible:outline-2 focus-visible:outline-[#FF4757] focus-visible:outline-offset-1 text-[16px] mt-0.5"
        aria-label="Delete todo"
      >
        ✕
      </button>
    </div>
  );
}

import { useRef, useState } from 'preact/hooks';
import type { TodoItem } from '../types';

interface TodoPanelProps {
  todos: TodoItem[];
  onAdd: (text: string) => void;
  onToggle: (id: number) => void;
  onEdit: (id: number, text: string) => void;
  onDelete: (id: number) => void;
}

export function TodoPanel({ todos, onAdd, onToggle, onEdit, onDelete }: TodoPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');

  const handleAdd = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  };

  const active = todos.filter((t) => !t.completed);
  const completed = todos.filter((t) => t.completed);

  return (
    <aside class="w-72 shrink-0 border-l border-[#33467c] flex flex-col overflow-hidden bg-[#1a1b26]">
      {/* Header */}
      <div class="px-3 py-2.5 border-b border-[#33467c] shrink-0">
        <h2 class="text-sm font-bold text-[#a9b1d6] select-none">
          Todos{active.length > 0 && ` (${active.length})`}
        </h2>
      </div>

      {/* Input */}
      <div class="px-2 py-2 shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          placeholder="Add todo…"
          class="w-full bg-[#24283b] text-[#c0caf5] text-base px-2.5 py-1.5 rounded-lg border border-[#33467c] placeholder-[#565f89] outline-none focus:border-[#7aa2f7] transition-colors"
        />
      </div>

      {/* List */}
      <div class="flex-1 overflow-y-auto px-2 custom-scrollbar">
        {active.length === 0 && completed.length === 0 && (
          <p class="text-xs text-[#565f89] text-center mt-6 select-none">
            Nothing here yet
          </p>
        )}

        {/* Active todos */}
        {active.map((todo) => (
          <TodoRow
            key={todo.id}
            todo={todo}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}

        {/* Completed divider */}
        {completed.length > 0 && (
          <div class="text-[9px] font-bold uppercase tracking-widest text-[#3b4261] px-1 pt-2 pb-1 mt-1 border-t border-[#24283b] select-none">
            Done
          </div>
        )}

        {/* Completed todos */}
        {completed.map((todo) => (
          <TodoRow
            key={todo.id}
            todo={todo}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </aside>
  );
}

function TodoRow({
  todo,
  onToggle,
  onEdit,
  onDelete,
}: {
  todo: TodoItem;
  onToggle: (id: number) => void;
  onEdit: (id: number, text: string) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
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

  return (
    <div class="flex items-center gap-1.5 py-1 group">
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

      {editing ? (
        <input
          ref={editInputRef}
          type="text"
          value={editText}
          onInput={(e) => setEditText((e.target as HTMLInputElement).value)}
          onKeyDown={handleEditKeyDown}
          onBlur={commitEdit}
          class="flex-1 bg-[#24283b] text-[#c0caf5] text-sm px-1.5 py-0.5 rounded border border-[#7aa2f7] outline-none"
        />
      ) : (
        <span
          onClick={startEdit}
          class={`text-sm flex-1 select-none cursor-text ${
            todo.completed
              ? 'text-[#565f89] line-through'
              : 'text-[#c0caf5]'
          }`}
        >
          {todo.text}
        </span>
      )}

      <button
        onClick={() => onDelete(todo.id)}
        class="text-[#565f89] hover:text-[#f7768e] opacity-0 group-hover:opacity-100 transition-all text-xs px-1 select-none"
        aria-label="Delete todo"
      >
        ✕
      </button>
    </div>
  );
}

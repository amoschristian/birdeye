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
    <aside class="w-72 shrink-0 border-l border-[#252d38] flex flex-col overflow-hidden bg-[#0a0e14]">
      {/* Header */}
      <div class="px-3 py-2.5 border-b border-[#252d38] shrink-0 flex items-center gap-2">
        <h2 class="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#8a9ba8] select-none">
          TODOS
        </h2>
        {active.length > 0 && (
          <span class="font-mono text-[13px] text-[#8a9ba8]">({active.length})</span>
        )}
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
          class="w-full bg-[#141b24] text-[#c8d6e0] text-base px-2.5 py-1.5 border border-[#252d38] placeholder-[#8a9ba8] outline-none focus:border-[#4da6ff] transition-colors min-h-[44px]"
        />
      </div>

      {/* List */}
      <div class="flex-1 overflow-y-auto px-2 custom-scrollbar">
        {active.length === 0 && completed.length === 0 && (
          <p class="font-mono text-[13px] text-[#8a9ba8] text-center mt-6 select-none uppercase tracking-[0.06em]">
            NO ITEMS
          </p>
        )}

        {active.map((todo) => (
          <TodoRow
            key={todo.id}
            todo={todo}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}

        {completed.length > 0 && (
          <div class="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#8a9ba8] px-1 pt-2 pb-1 mt-1 border-t border-[#252d38] select-none">
            DONE
          </div>
        )}

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
    <div class="flex items-center gap-1.5 py-1.5 px-1 border-b border-[#252d38] group min-h-[44px]">
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

      {editing ? (
        <input
          ref={editInputRef}
          type="text"
          value={editText}
          onInput={(e) => setEditText((e.target as HTMLInputElement).value)}
          onKeyDown={handleEditKeyDown}
          onBlur={commitEdit}
          class="flex-1 bg-[#141b24] text-[#c8d6e0] text-[14px] px-1.5 py-0.5 border border-[#4da6ff] outline-none font-mono"
        />
      ) : (
        <span
          onClick={startEdit}
          class={`font-mono text-[14px] flex-1 select-none cursor-text ${
            todo.completed
              ? 'text-[#8a9ba8] line-through'
              : 'text-[#c8d6e0]'
          }`}
        >
          {todo.text}
        </span>
      )}

      <button
        onClick={() => onDelete(todo.id)}
        class="text-[#8a9ba8] hover:text-[#ff4d4d] opacity-0 group-hover:opacity-100 transition-all text-xs px-1 select-none focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[#ff4d4d] focus-visible:outline-offset-1 font-mono"
        aria-label="Delete todo"
      >
        ✕
      </button>
    </div>
  );
}

import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { TodoItem } from '../types';

interface Props {
  items: TodoItem[];
  total: number;
  onToggle: (id: number) => void;
  onToggleSubtask: (id: number) => void;
  onOpen: () => void;
}

/**
 * Home's todo column: what is overdue or due today, in urgency order. A task
 * with steps opens in place so it can be finished here; anything deeper lives
 * behind "All todos".
 */
export function HomeTodos({ items, total, onToggle, onToggleSubtask, onOpen }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside class="flex w-[392px] shrink-0 flex-col overflow-hidden border-l border-line/60 bg-ink">
      <div class="flex h-12 shrink-0 items-center gap-2 border-b border-line/60 px-4">
        <span class="h-2 w-2 shrink-0 rounded-full bg-alert" />
        <span class="text-[15px] font-semibold text-alert">Today</span>
        <span class="font-mono text-[14px] text-faint">{total}</span>
        <button
          type="button"
          onClick={onOpen}
          class="ml-auto text-[14px] font-semibold text-action active:brightness-125"
        >
          All todos ›
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-1.5 py-1.5 custom-scrollbar">
        {items.length === 0 ? (
          <p class="px-3 py-6 text-center text-[18px] text-muted">Nothing due today</p>
        ) : (
          items.map((todo) => {
            const due = dueChip(todo);
            const steps = (todo.subtasks || [])
              .slice()
              .sort((a, b) => a.order_index - b.order_index);
            const done = steps.filter((step) => step.completed).length;
            const hasSteps = steps.length > 0;
            const expanded = expandedIds.has(todo.id);

            return (
              <div key={todo.id} class="border-b border-line/25 last:border-0">
                <div
                  class={`flex items-start gap-1 rounded-[9px] px-1 py-1.5 transition-colors ${
                    todo.completed ? 'opacity-50' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onToggle(todo.id)}
                    aria-label={`Mark "${todo.text}" complete`}
                    class="flex h-11 w-11 -ml-1 shrink-0 items-center justify-center rounded-[8px] transition-colors active:bg-raised"
                  >
                    <span class="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-2 border-line transition-colors" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (hasSteps) toggleExpanded(todo.id);
                    }}
                    class="min-w-0 flex-1 pb-1 pr-1 text-left"
                  >
                    <span class="block text-[19px] leading-snug text-text line-clamp-2">
                      {todo.text}
                    </span>
                    <span class="mt-1 flex items-center gap-2">
                      <span
                        class={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          todo.priority === 'high' ? 'bg-alert' : 'bg-warn'
                        }`}
                      />
                      {due && (
                        <span class={`text-[14px] font-semibold ${due.tone}`}>{due.text}</span>
                      )}
                      {hasSteps && (
                        <span class="font-mono text-[14px] text-faint">
                          {done}/{steps.length} steps
                        </span>
                      )}
                    </span>
                  </button>

                  {hasSteps && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(todo.id)}
                      aria-label={expanded ? 'Hide steps' : 'Show steps'}
                      aria-expanded={expanded}
                      class="mt-1 flex h-9 w-8 shrink-0 items-center justify-center text-[16px] text-faint active:text-action"
                    >
                      {expanded ? '▴' : '▾'}
                    </button>
                  )}
                </div>

                {expanded && hasSteps && (
                  <div class="mb-2 ml-11 mr-2 flex flex-col">
                    {steps.map((step) => (
                      <div key={step.id} class="flex items-start gap-1">
                        <button
                          type="button"
                          onClick={() => onToggleSubtask(step.id)}
                          aria-label={step.completed ? 'Mark step incomplete' : 'Mark step complete'}
                          class="flex h-10 w-10 -ml-2 shrink-0 items-center justify-center rounded-[8px] active:bg-raised"
                        >
                          <span
                            class={`flex h-[15px] w-[15px] items-center justify-center rounded-[4px] border-2 transition-colors ${
                              step.completed ? 'border-ok bg-ok' : 'border-line'
                            }`}
                          >
                            {step.completed && (
                              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                                <path
                                  d="M2 5L4 7L8 3"
                                  stroke="#121021"
                                  stroke-width="1.5"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                />
                              </svg>
                            )}
                          </span>
                        </button>
                        <span
                          class={`min-w-0 flex-1 py-2 text-[17px] leading-snug ${
                            step.completed ? 'text-faint line-through' : 'text-muted'
                          }`}
                        >
                          {step.text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function dueChip(todo: TodoItem): { text: string; tone: string } | null {
  const date = todo.due_date || todo.scheduled_date;
  if (!date) return null;

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;

  if (date < today) return { text: 'Overdue', tone: 'text-alert' };
  if (date === today) return { text: 'Today', tone: 'text-warn' };
  return { text: 'Soon', tone: 'text-muted' };
}

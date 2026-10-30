import type { TodoItem } from '../../types';
import { dueLabel, openTasks, pageSlice, todayKey } from '../helpers';
import { Pager } from './Pager';

interface Props {
  todos: TodoItem[];
  page: number;
  onPage: (page: number) => void;
  onToggle: (id: number) => void;
  onAdd: () => void;
  onSelect: (todo: TodoItem) => void;
}

export function TasksScreen({ todos, page, onPage, onToggle, onAdd, onSelect }: Props) {
  const open = openTasks(todos);
  const today = todayKey();
  const overdue = open.filter((todo) => {
    const date = todo.due_date || todo.scheduled_date;
    return date !== null && date < today;
  }).length;

  const slice = pageSlice(open, page);

  return (
    <section class="screen" aria-label="Tasks">
      <header class="screen__head">
        <span class="screen__title">Tasks</span>
        <span class="screen__count">
          {open.length} open · {overdue} overdue
        </span>

        <span class="spacer" />

        <Pager page={slice.page} pages={slice.pages} onChange={onPage} />

        <button type="button" class="btn btn--sm" onClick={onAdd}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          Add task
        </button>
      </header>

      <div class="rows">
        {slice.items.length === 0 ? (
          <div class="empty">No open tasks</div>
        ) : (
          slice.items.map((todo) => {
            const due = dueLabel(todo);

            return (
              <div class={'task task--' + todo.priority} key={todo.id}>
                <button
                  type="button"
                  class="task__check"
                  aria-label={`Complete ${todo.text}`}
                  onClick={() => onToggle(todo.id)}
                >
                  <span class="task__box" />
                </button>
                <button
                  type="button"
                  class="task__main"
                  aria-label={`Open ${todo.text}`}
                  onClick={() => onSelect(todo)}
                >
                  <span class="task__text">{todo.text}</span>
                  <span class={'task__prio task__prio--' + todo.priority}>
                    {todo.priority === 'high' ? 'High' : todo.priority === 'medium' ? 'Med' : 'Low'}
                  </span>
                  <span class={'task__due ' + due.tone}>{due.text}</span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

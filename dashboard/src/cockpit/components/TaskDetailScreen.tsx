import { useEffect, useRef, useState } from 'preact/hooks';
import type { TodoItem } from '../../types';
import { dateKey, dueLabel, todayKey } from '../helpers';

interface Props {
  todo: TodoItem;
  onBack: () => void;
  onText: (id: number, text: string) => void;
  onPriority: (id: number, priority: 'high' | 'medium' | 'low') => void;
  onDueDate: (id: number, date: string | null) => void;
  onSchedule: (id: number, date: string | null, time: string | null) => void;
  onOpenTime: (value: string) => void;
  onNotes: (id: number, notes: string) => void;
  onAddSubtask: (todoId: number, text: string) => void;
  onToggleSubtask: (id: number) => void;
  onDeleteSubtask: (id: number) => void;
  onDelete: (id: number) => void;
}

const PRIORITIES: { value: 'high' | 'medium' | 'low'; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Med' },
  { value: 'low', label: 'Low' },
];

export function TaskDetailScreen({
  todo,
  onBack,
  onText,
  onPriority,
  onDueDate,
  onSchedule,
  onOpenTime,
  onNotes,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onDelete,
}: Props) {
  const [text, setText] = useState(todo.text);
  const [notes, setNotes] = useState(todo.notes);
  const [subtaskText, setSubtaskText] = useState('');
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
    };
  }, []);

  const commitText = () => {
    const value = text.trim();
    if (value && value !== todo.text) onText(todo.id, value);
  };

  const commitNotes = () => {
    if (notes !== todo.notes) onNotes(todo.id, notes);
  };

  const addSubtask = () => {
    const value = subtaskText.trim();
    if (!value) return;
    onAddSubtask(todo.id, value);
    setSubtaskText('');
  };

  const handleDelete = () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      deleteTimer.current = window.setTimeout(() => setDeleteArmed(false), 3000);
      return;
    }
    onDelete(todo.id);
  };

  const subtasks = (todo.subtasks ?? [])
    .slice()
    .sort((a, b) => a.order_index - b.order_index);
  const done = subtasks.filter((step) => step.completed).length;

  const dueOptions: { key: string | null; label: string }[] = [
    { key: todayKey(), label: 'Today' },
    { key: dateKey(1), label: 'Tmrw' },
    { key: dateKey(7), label: 'Week' },
    { key: null, label: '—' },
  ];

  const due = dueLabel(todo);
  const dueText = due.text === '—' ? 'None' : due.text;

  const setDue = (key: string | null) => {
    onDueDate(todo.id, key);
    onSchedule(todo.id, key, key === null ? null : todo.scheduled_time || null);
  };

  return (
    <section class="screen" aria-label="Task">
      <header class="screen__head">
        <button type="button" class="btn btn--sm" onClick={onBack}>
          ‹ Back
        </button>
        <span class="screen__title">Task</span>
        <span class="spacer" />
        <button
          type="button"
          class={'btn btn--sm detail__delete' + (deleteArmed ? ' is-armed' : '')}
          onClick={handleDelete}
        >
          {deleteArmed ? 'Sure?' : 'Delete'}
        </button>
      </header>

      <div class="detail">
        <div class="detail__col">
          <label class="detail__label" for="task-text">
            Task
          </label>
          <input
            id="task-text"
            class="detail__input"
            type="text"
            value={text}
            onInput={(event) => setText(event.currentTarget.value)}
            onBlur={commitText}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />

          <div class="detail__grid">
            <div class="detail__group">
              <span class="detail__label">Priority</span>
              <div class="detail__opts">
                {PRIORITIES.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    class={'detail__opt ' + (todo.priority === option.value ? 'is-active' : '')}
                    onClick={() => onPriority(todo.id, option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div class="detail__group">
              <span class="detail__label">
                Due{' '}
                <span class={'detail__time' + (dueText === 'None' ? ' detail__time--none' : '')}>
                  {dueText}
                </span>
              </span>
              <div class="detail__opts">
                {dueOptions.map((option) => (
                  <button
                    type="button"
                    key={option.label}
                    class={
                      'detail__opt ' +
                      ((todo.due_date || todo.scheduled_date || null) === option.key
                        ? 'is-active'
                        : '')
                    }
                    onClick={() => setDue(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  type="button"
                  class="detail__time-input"
                  onClick={() => onOpenTime(todo.scheduled_time ?? '')}
                >
                  {todo.scheduled_time || '--:--'}
                </button>
              </div>
            </div>

          </div>
        </div>

        <div class="detail__col">
          <label class="detail__label" for="task-notes">
            Notes
          </label>
          <textarea
            id="task-notes"
            class="detail__notes"
            value={notes}
            placeholder="Context, links, anything worth keeping"
            onInput={(event) => setNotes(event.currentTarget.value)}
            onBlur={commitNotes}
          />

          <span class="detail__label">
            Subtasks <span class="detail__count">{done}/{subtasks.length}</span>
          </span>

          <div class="detail__subtasks">
            {subtasks.length === 0 ? (
              <span class="detail__empty">No steps yet</span>
            ) : (
              subtasks.map((step) => (
                <div class={'subtask' + (step.completed ? ' is-done' : '')} key={step.id}>
                  <button
                    type="button"
                    class="subtask__check"
                    aria-label={step.completed ? 'Mark step incomplete' : 'Mark step complete'}
                    onClick={() => onToggleSubtask(step.id)}
                  >
                    <span class="subtask__box" />
                  </button>
                  <span class="subtask__text">{step.text}</span>
                  <button
                    type="button"
                    class="subtask__del"
                    aria-label={'Delete ' + step.text}
                    onClick={() => onDeleteSubtask(step.id)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          <div class="detail__add">
            <input
              class="detail__input"
              type="text"
              value={subtaskText}
              placeholder="Add a step"
              onInput={(event) => setSubtaskText(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addSubtask();
              }}
            />
            <button
              type="button"
              class="btn btn--sm"
              disabled={!subtaskText.trim()}
              onClick={addSubtask}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

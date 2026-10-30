import type { AppConfig, CalendarEvent, Notification, TodoItem } from '../types';

export type GroupFilter = 'all' | 'work' | 'personal';
export type ProcessSort = 'cpu' | 'mem';

export function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function clockTime(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  return pad(date.getHours()) + ':' + pad(date.getMinutes());
}

export function formatBytes(value: number): string {
  if (!value) return '0';
  if (value >= 1073741824) return (value / 1073741824).toFixed(1) + 'G';
  if (value >= 1048576) return Math.round(value / 1048576) + 'M';
  return Math.round(value / 1024) + 'K';
}

export function formatRate(value: number): string {
  if (value >= 1048576) return (value / 1048576).toFixed(1) + 'M';
  if (value >= 1024) return Math.round(value / 1024) + 'K';
  return Math.round(value) + 'B';
}

export function isPriority(notification: Notification): boolean {
  return notification.attention_band === 'pinned' || notification.is_important;
}

export function sortByAttention(list: Notification[]): Notification[] {
  return [...list].sort(
    (a, b) => (b.attention_score || 0) - (a.attention_score || 0) || b.created_at - a.created_at
  );
}

export function appOf(apps: AppConfig[], appId: string): AppConfig | undefined {
  return apps.find((app) => app.id === appId);
}

export function groupOf(apps: AppConfig[], appId: string): string {
  return appOf(apps, appId)?.group ?? '';
}

export function pageSlice<T>(items: T[], page: number, perPage = 4) {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.max(0, Math.min(page, pages - 1));
  return {
    page: current,
    pages,
    items: items.slice(current * perPage, current * perPage + perPage),
  };
}

export function dateKey(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

export function todayKey(): string {
  return dateKey(0);
}


export function dueLabel(todo: TodoItem): { text: string; tone: string } {
  const date = todo.due_date || todo.scheduled_date;
  if (!date) return { text: '—', tone: 'task__due--later' };

  const time = todo.scheduled_time ? ' · ' + todo.scheduled_time : '';
  const today = todayKey();

  if (date < today) return { text: 'Overdue', tone: 'task__due--alert' };
  if (date === today) return { text: 'Today' + time, tone: 'task__due--warn' };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey =
    tomorrow.getFullYear() + '-' + pad(tomorrow.getMonth() + 1) + '-' + pad(tomorrow.getDate());
  if (date === tomorrowKey) return { text: 'Tomorrow' + time, tone: 'task__due--later' };

  const parsed = new Date(date + 'T00:00:00');
  return {
    text: parsed.toLocaleDateString([], { month: 'short', day: 'numeric' }) + time,
    tone: 'task__due--later',
  };
}

export function openTasks(todos: TodoItem[]): TodoItem[] {
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return todos
    .filter((todo) => !todo.completed && todo.status !== 'archived')
    .sort((a, b) => {
      const dateA = a.due_date || a.scheduled_date;
      const dateB = b.due_date || b.scheduled_date;
      if (dateA && dateB && dateA !== dateB) return dateA < dateB ? -1 : 1;
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;
      return (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1);
    });
}

export function taskAttentionCount(todos: TodoItem[]): number {
  const today = todayKey();
  return todos.filter((todo) => {
    if (todo.completed || todo.status === 'archived') return false;
    const date = todo.due_date || todo.scheduled_date;
    return date !== null && date <= today;
  }).length;
}

export function nextEventLabel(events: CalendarEvent[], nowMs: number): string {
  const now = nowMs / 1000;
  const upcoming = events
    .filter((event) => event.end > now)
    .sort((a, b) => a.start - b.start)[0];

  if (!upcoming) return 'NO UPCOMING';
  if (upcoming.start <= now) {
    return 'NOW ' + upcoming.summary + ' · UNTIL ' + clockTime(upcoming.end);
  }
  return 'NEXT ' + clockTime(upcoming.start) + ' · ' + upcoming.summary;
}

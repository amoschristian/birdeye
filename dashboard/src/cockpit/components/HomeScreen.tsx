import type { AppConfig, Notification, TodoItem } from '../../types';
import { buildAppInboxes } from '../../utils/appInbox';
import { appBrandColor } from '../../utils/appVisuals';
import { messageText, notificationLabel, notificationSender } from '../../utils/conversations';
import { formatRelativeTime } from '../../utils/time';
import { dueLabel, openTasks, todayKey } from '../helpers';
import { ChannelIcon } from './ChannelIcon';

interface Props {
  apps: AppConfig[];
  notifications: Notification[];
  todos: TodoItem[];
  onOpenChannel: (appId: string) => void;
  onToggleTodo: (id: number) => void;
  onOpenTask: (todo: TodoItem) => void;
  onOpenTasks: () => void;
}

export function HomeScreen({
  apps,
  notifications,
  todos,
  onOpenChannel,
  onToggleTodo,
  onOpenTask,
  onOpenTasks,
}: Props) {
  const channels = buildAppInboxes(
    notifications,
    apps.filter((app) => app.id !== 'calendar')
  );

  const today = todayKey();
  const dueNow = openTasks(todos).filter((todo) => {
    const date = todo.due_date || todo.scheduled_date;
    return date !== null && date <= today;
  });

  return (
    <section class="screen" aria-label="Home">
      <div class="home">
        <div class="channels">
          {channels.map((inbox) => {
            const app = apps.find((candidate) => candidate.id === inbox.appId);
            if (!app) return null;

            const latest = inbox.unread[0] ?? null;
            const quiet = inbox.unreadCount === 0;
            const important = inbox.importantCount > 0;
            const sender = latest ? notificationSender(latest) : '';
            const room = latest ? notificationLabel(latest) : '';
            const where = sender && sender !== room ? `${sender} / ${room}` : room;
            const brand = appBrandColor(app.id);

            return (
              <button
                type="button"
                class={
                  'channel' +
                  (quiet ? ' channel--quiet' : '') +
                  (important ? ' channel--alert' : '')
                }
                key={app.id}
                disabled={quiet}
                onClick={() => onOpenChannel(app.id)}
                aria-label={`${app.name}, ${inbox.unreadCount} unread${
                  important ? `, ${inbox.importantCount} important` : ''
                }`}
              >
                <span
                  class="channel__edge"
                  style={{ backgroundColor: important ? 'var(--alert)' : brand }}
                />

                <span class="channel__head">
                  <span class="channel__icon">
                    <ChannelIcon app={app} />
                  </span>
                  <span class="channel__name">{app.name}</span>
                  <span class="channel__time">
                    {latest ? formatRelativeTime(latest.created_at) : '—'}
                  </span>
                </span>

                <span class="channel__body">
                  <span class="channel__figure">
                    <span class="channel__count">{quiet ? '—' : inbox.unreadCount}</span>
                    <span class="channel__unit">{quiet ? 'clear' : 'unread'}</span>
                  </span>

                  <span class="channel__preview">
                    <span class="channel__where">
                      {latest ? where || app.name : 'No messages'}
                    </span>
                    <span class="channel__msg">
                      {latest ? messageText(latest) : 'All quiet'}
                    </span>
                  </span>
                </span>

                <span class="channel__foot">
                  {important ? (
                    <span class="channel__flag">▲ {inbox.importantCount} important</span>
                  ) : (
                    <span class="channel__flag channel__flag--muted">
                      {quiet ? '0 unread' : `${inbox.unreadCount} new`}
                    </span>
                  )}
                  {!quiet && <span class="channel__open">Open ›</span>}
                </span>
              </button>
            );
          })}
        </div>

        <aside class="today" aria-label="Today">
          <header class="today__head">
            <span class="today__lamp" />
            <span class="today__title">Today</span>
            <span class="today__count">{dueNow.length}</span>
            <span class="spacer" />
            <button type="button" class="today__all" onClick={onOpenTasks}>
              All tasks ›
            </button>
          </header>

          <div class="today__list">
            {dueNow.length === 0 ? (
              <div class="empty">Nothing due today</div>
            ) : (
              dueNow.map((todo) => {
                const due = dueLabel(todo);

                return (
                  <div class="today__row" key={todo.id}>
                    <button
                      type="button"
                      class="today__check"
                      aria-label={`Complete ${todo.text}`}
                      onClick={() => onToggleTodo(todo.id)}
                    >
                      <span class="today__box" />
                    </button>

                    <button
                      type="button"
                      class="today__main"
                      onClick={() => onOpenTask(todo)}
                    >
                      <span class="today__text">{todo.text}</span>
                      <span class={'task__due ' + due.tone}>{due.text}</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

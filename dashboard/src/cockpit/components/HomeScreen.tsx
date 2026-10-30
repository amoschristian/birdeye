import type { AppConfig, Notification } from '../../types';
import { messageText, notificationLabel, notificationSender } from '../../utils/conversations';
import { formatRelativeTime } from '../../utils/time';
import { appOf } from '../helpers';

interface Props {
  top: Notification | null;
  priorityCount: number;
  unreadCount: number;
  apps: AppConfig[];
  onOpen: (notification: Notification) => void;
  onMarkRead: (notification: Notification) => void;
  onSeeAll: () => void;
}

export function HomeScreen({ top, priorityCount, unreadCount, apps, onOpen, onMarkRead, onSeeAll }: Props) {
  const app = top ? appOf(apps, top.app_id) : undefined;
  const sender = top ? notificationSender(top) : '';
  const label = top ? notificationLabel(top) : '';
  const from = sender && sender !== label ? `${sender} · ${label}` : label;
  const age = top ? formatRelativeTime(top.created_at) : '';
  const routine = Math.max(0, unreadCount - priorityCount);

  return (
    <section class="screen" aria-label="Home">
      <article class="priority panel">
        <header class="priority__head">
          <span class="label">
            {top ? (priorityCount > 0 ? `Priority 1 of ${priorityCount}` : 'Latest') : 'Standing by'}
          </span>
          <span class="spacer" />
          <span class="label label--dim">{app?.name ?? top?.app_name ?? '—'}</span>
          <span class="label label--dim">
            {top ? (age === 'now' ? 'now' : `${age} ago`) : '—'}
          </span>
        </header>

        <div class="priority__body">
          <p class="priority__from">{top ? from : 'No unread traffic'}</p>
          <p class="priority__msg">{top ? messageText(top) : 'All quiet'}</p>
        </div>
      </article>

      <div class="actions">
        <button
          type="button"
          class="btn btn--primary"
          disabled={!top}
          onClick={() => top && onOpen(top)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
          Open transmission
        </button>

        <button type="button" class="btn" disabled={!top} onClick={() => top && onMarkRead(top)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Mark read
        </button>
      </div>

      <div class="home__foot">
        <span class="home__counts">
          <b>{Math.max(0, priorityCount - 1)}</b> more priority · <b>{routine}</b> routine
        </span>
        <span class="spacer" />
        <button
          type="button"
          class="btn btn--outline"
          disabled={unreadCount === 0}
          onClick={onSeeAll}
        >
          See all {unreadCount} {unreadCount === 1 ? 'transmission' : 'transmissions'}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </section>
  );
}

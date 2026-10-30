import type { AppConfig, Notification } from '../../types';
import { messageText, notificationSender } from '../../utils/conversations';
import { formatRelativeTime } from '../../utils/time';
import { appOf, groupOf, isPriority, pageSlice, pad, type GroupFilter } from '../helpers';
import { ChannelIcon } from './ChannelIcon';
import { Pager } from './Pager';

interface Props {
  unread: Notification[];
  apps: AppConfig[];
  filter: GroupFilter;
  onFilter: (filter: GroupFilter) => void;
  page: number;
  onPage: (page: number) => void;
  onOpen: (notification: Notification) => void;
  onMarkRead: (id: number) => void;
  onMarkAll: () => void;
}

export function TrafficScreen({
  unread,
  apps,
  filter,
  onFilter,
  page,
  onPage,
  onOpen,
  onMarkRead,
  onMarkAll,
}: Props) {
  const work = unread.filter((notification) => groupOf(apps, notification.app_id) === 'work').length;
  const personal = unread.filter(
    (notification) => groupOf(apps, notification.app_id) === 'personal'
  ).length;

  const filtered =
    filter === 'all'
      ? unread
      : unread.filter((notification) => groupOf(apps, notification.app_id) === filter);

  const slice = pageSlice(filtered, page);

  return (
    <section class="screen" aria-label="Traffic">
      <header class="screen__head">
        <span class="screen__title">Traffic</span>
        <span class="screen__count">{unread.length} unread</span>

        <span class="spacer" />

        <div class="seg" role="group" aria-label="Filter by group">
          <button
            type="button"
            class={'seg__opt ' + (filter === 'all' ? 'is-active' : '')}
            onClick={() => onFilter('all')}
          >
            All <b>{unread.length}</b>
          </button>
          <button
            type="button"
            class={'seg__opt ' + (filter === 'work' ? 'is-active' : '')}
            onClick={() => onFilter('work')}
          >
            Work <b>{work}</b>
          </button>
          <button
            type="button"
            class={'seg__opt ' + (filter === 'personal' ? 'is-active' : '')}
            onClick={() => onFilter('personal')}
          >
            Personal <b>{personal}</b>
          </button>
        </div>

        <Pager page={slice.page} pages={slice.pages} onChange={onPage} />

        <button
          type="button"
          class="btn btn--sm"
          disabled={filtered.length === 0}
          onClick={onMarkAll}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {filter === 'all' ? 'Mark all read' : `Mark ${filter} read`}
        </button>
      </header>

      <div class="rows">
        {slice.items.length === 0 ? (
          <div class="empty">No unread traffic</div>
        ) : (
          slice.items.map((notification, index) => {
            const app = appOf(apps, notification.app_id);
            const priority = isPriority(notification);

            return (
              <div class={'row' + (priority ? ' row--priority' : '')} key={notification.id}>
                <button
                  type="button"
                  class="row__main"
                  onClick={() => onOpen(notification)}
                  aria-label={`${notificationSender(notification) || notification.app_name}: ${messageText(notification)}`}
                >
                  <span class="row__index">{pad(slice.page * 4 + index + 1)}</span>
                  <span class="row__icon">
                    <ChannelIcon app={app} />
                  </span>
                  <span class="row__who">
                    <span class="row__sender">
                      {notificationSender(notification) || app?.name || notification.app_name}
                    </span>
                    <span class="row__channel">{app?.name ?? notification.app_name}</span>
                  </span>
                  <span class="row__msg">{messageText(notification)}</span>
                  <span class="row__time">{formatRelativeTime(notification.created_at)}</span>
                </button>

                <button
                  type="button"
                  class="row__check"
                  aria-label="Mark as read"
                  onClick={() => onMarkRead(notification.id)}
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

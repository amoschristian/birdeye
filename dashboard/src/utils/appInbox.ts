import type { AppConfig, Notification } from '../types';

export interface AppInbox {
  appId: string;
  appName: string;
  unread: Notification[];
  read: Notification[];
  unreadCount: number;
  importantCount: number;
}

const GROUP_BANDS = ['work', 'personal'];

function bandIndex(app: AppConfig): number {
  const index = GROUP_BANDS.indexOf(app.group);
  return index === -1 ? GROUP_BANDS.length : index;
}

/**
 * Fixed order so tile positions never move between glances: work apps, then
 * personal, then anything ungrouped, alphabetical within each band.
 */
export function orderApps(apps: AppConfig[]): AppConfig[] {
  return [...apps].sort((a, b) => {
    const bandA = bandIndex(a);
    const bandB = bandIndex(b);
    if (bandA !== bandB) return bandA - bandB;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Unread leads with whatever needs the user most, then newest first.
 * attention_score is derived server-side from the decision probabilities
 * (or from the legacy rule when a row is unclassified), so the ranking
 * changes only when the notification set does — never on a re-render.
 */
function byAttentionThenRecency(a: Notification, b: Notification): number {
  if (a.attention_score !== b.attention_score) return b.attention_score - a.attention_score;
  return b.created_at - a.created_at;
}

export function buildAppInboxes(notifications: Notification[], apps: AppConfig[]): AppInbox[] {
  return orderApps(apps).map((app) => {
    const unread: Notification[] = [];
    const read: Notification[] = [];

    for (const notification of notifications) {
      if (notification.app_id !== app.id) continue;
      if (notification.is_read) read.push(notification);
      else unread.push(notification);
    }

    unread.sort(byAttentionThenRecency);
    read.sort((a, b) => b.created_at - a.created_at);

    return {
      appId: app.id,
      appName: app.name,
      unread,
      read,
      unreadCount: unread.length,
      importantCount: unread.filter((notification) => notification.is_important).length,
    };
  });
}

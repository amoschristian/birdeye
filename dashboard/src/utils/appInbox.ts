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

/** Unread leads with important messages, then newest first. */
function byImportanceThenRecency(a: Notification, b: Notification): number {
  if (a.is_important !== b.is_important) return a.is_important ? -1 : 1;
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

    unread.sort(byImportanceThenRecency);
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

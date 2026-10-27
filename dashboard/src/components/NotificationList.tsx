import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Check, ChevronLeft, Trash2 } from 'lucide-preact';
import type { AppConfig, Notification } from '../types';
import { messageText, notificationLabel, notificationSender } from '../utils/conversations';
import { appBrandColor } from '../utils/appVisuals';
import { formatRelativeTime } from '../utils/time';
import { AppIcon } from './AppIcon';

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="Back to the inbox"
      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px] text-muted transition-colors active:bg-raised active:text-text"
    >
      <ChevronLeft size={24} />
    </button>
  );
}

/** One app's unread messages. Pressing Read files the row under Archive. */
export function AppNotificationList({
  app,
  unread,
  archivedCount,
  onBack,
  onMarkRead,
  onReadAll,
  onOpenArchive,
  onOpenApp,
}: {
  app: AppConfig;
  unread: Notification[];
  archivedCount: number;
  onBack: () => void;
  onMarkRead: (id: number) => void;
  onReadAll: () => void;
  onOpenArchive: () => void;
  onOpenApp: () => void;
}) {
  return (
    <main class="flex flex-1 flex-col overflow-hidden bg-ink">
      <header class="flex h-16 shrink-0 items-center gap-2.5 border-b border-line/60 bg-surface px-4">
        <BackButton onBack={onBack} />

        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-ink/60">
          <AppIcon appId={app.id} class="h-6 w-6" emoji={app.icon} name={app.name} />
        </span>

        <div class="min-w-0 flex-1">
          <p class="truncate text-[22px] font-semibold leading-tight">{app.name}</p>
          <p class="truncate text-[15px] text-faint">
            {unread.length} unread
          </p>
        </div>

        {archivedCount > 0 && (
          <button
            type="button"
            onClick={onOpenArchive}
            class="flex h-11 shrink-0 items-center gap-1.5 rounded-[9px] border border-line/55 bg-surface/70 px-3 text-[15px] font-semibold text-muted transition-colors active:scale-[0.98]"
          >
            Archive
            <span class="font-mono text-[14px] tabular-nums text-faint">{archivedCount}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenApp}
          class="flex h-11 shrink-0 items-center rounded-[9px] border border-action/40 bg-action/10 px-3 text-[15px] font-semibold text-action transition-colors active:scale-[0.98]"
        >
          Open
        </button>

        {unread.length > 0 && (
          <button
            type="button"
            onClick={onReadAll}
            class="flex h-11 shrink-0 items-center gap-1.5 rounded-[9px] border border-ok/25 bg-ok/10 px-3 text-[15px] font-semibold text-ok transition-colors active:scale-[0.98]"
          >
            <Check size={16} />
            Read all
          </button>
        )}
      </header>

      <div class="flex-1 overflow-y-auto custom-scrollbar">
        {unread.length === 0 ? (
          <p class="px-6 py-8 text-[18px] text-muted">Nothing unread from {app.name}.</p>
        ) : (
          unread.map((notification) => (
            <Row
              key={notification.id}
              notification={notification}
              action="read"
              onRead={onMarkRead}
            />
          ))
        )}
      </div>
    </main>
  );
}

/** Everything that has been read, newest first, across every app. */
export function ArchiveList({
  items,
  apps,
  onBack,
  onDelete,
  onEmpty,
}: {
  items: Notification[];
  apps: AppConfig[];
  onBack: () => void;
  onDelete: (id: number) => void;
  onEmpty: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  // Emptying is the only unrecoverable action in the panel, so it asks twice.
  const handleEmpty = () => {
    if (!confirming) {
      setConfirming(true);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirming(false), 3000);
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirming(false);
    onEmpty();
  };

  return (
    <main class="flex flex-1 flex-col overflow-hidden bg-ink">
      <header class="flex h-16 shrink-0 items-center gap-2.5 border-b border-line/60 bg-surface px-4">
        <BackButton onBack={onBack} />

        <div class="min-w-0 flex-1">
          <p class="truncate text-[22px] font-semibold leading-tight">Archive</p>
          <p class="truncate text-[15px] text-faint">
            {items.length} items · pruned automatically after 7 days
          </p>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={handleEmpty}
            class={`flex h-11 shrink-0 items-center rounded-[9px] border px-3 text-[15px] font-semibold transition-colors active:scale-[0.98] ${
              confirming
                ? 'border-alert bg-alert text-ink'
                : 'border-alert/25 bg-alert/10 text-alert'
            }`}
          >
            {confirming ? 'Confirm empty' : 'Empty'}
          </button>
        )}
      </header>

      <div class="flex-1 overflow-y-auto custom-scrollbar">
        {items.length === 0 ? (
          <p class="px-6 py-8 text-[18px] text-muted">
            Nothing archived. Messages you read land here.
          </p>
        ) : (
          items.map((notification) => (
            <Row
              key={notification.id}
              notification={notification}
              app={apps.find((app) => app.id === notification.app_id)}
              action="delete"
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </main>
  );
}

function Row({
  notification,
  app,
  action,
  onRead,
  onDelete,
}: {
  notification: Notification;
  app?: AppConfig;
  action: 'read' | 'delete';
  onRead?: (id: number) => void;
  onDelete?: (id: number) => void;
}) {
  const isUnread = action === 'read';
  const room = notificationLabel(notification);
  const sender = notificationSender(notification);
  const showSender = sender !== '' && sender.toLowerCase() !== room.toLowerCase();
  const brand = appBrandColor(notification.app_id);

  return (
    <div
      class={`relative flex items-start gap-3.5 border-b border-line/40 py-3.5 pl-5 pr-4 ${
        isUnread ? 'bg-surface/25' : ''
      }`}
    >
      <span
        class="absolute inset-y-0 left-0 w-[3px]"
        style={{
          backgroundColor: notification.is_important && isUnread ? 'var(--color-alert)' : brand,
          opacity: isUnread ? 0.8 : 0.25,
        }}
        aria-hidden="true"
      />

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          {app && (
            <span class="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-ink/55">
              <AppIcon
                appId={notification.app_id}
                class="h-4 w-4"
                emoji={app.icon}
                name={app.name}
              />
            </span>
          )}

          <span
            class={`truncate text-[15px] ${
              isUnread ? 'font-semibold text-muted' : 'font-medium text-faint'
            }`}
          >
            {showSender ? sender : room}
            {showSender && <span class="font-normal text-faint"> · {room}</span>}
          </span>

          {app && <span class="shrink-0 text-[14px] font-semibold text-faint">{app.name}</span>}

          <span class="shrink-0 font-mono text-[14px] text-faint">
            {formatRelativeTime(notification.created_at)}
          </span>

          {notification.is_important && isUnread && (
            <span class="rounded-[4px] border border-alert/40 px-1.5 py-0.5 font-mono text-[13px] font-bold leading-none text-alert">
              Important
            </span>
          )}
        </div>

        <p
          class={`mt-1 max-w-[560px] line-clamp-2 text-[20px] leading-[1.38] ${
            isUnread ? 'text-text' : 'text-muted'
          }`}
        >
          {messageText(notification)}
        </p>
      </div>

      {action === 'read' ? (
        <button
          type="button"
          onClick={() => onRead?.(notification.id)}
          aria-label="Mark as read, moves it to the archive"
          class="flex h-[46px] shrink-0 items-center gap-1.5 self-center rounded-[9px] border border-ok/40 bg-ok/10 px-3.5 text-[16px] font-semibold text-ok transition-colors active:scale-[0.97]"
        >
          <Check size={16} />
          Read
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onDelete?.(notification.id)}
          aria-label="Delete notification"
          class="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-[9px] border border-line/45 text-faint transition-colors active:scale-95 active:text-alert"
        >
          <Trash2 size={18} />
        </button>
      )}
    </div>
  );
}

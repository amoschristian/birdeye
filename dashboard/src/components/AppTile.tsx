import { h } from 'preact';
import type { AppConfig } from '../types';
import type { AppInbox } from '../utils/appInbox';
import { messageText, notificationLabel, notificationSender } from '../utils/conversations';
import { appBrandColor } from '../utils/appVisuals';
import { formatRelativeTime } from '../utils/time';
import { AppIcon } from './AppIcon';

interface Props {
  inbox: AppInbox;
  app: AppConfig;
  onOpen: () => void;
}

/**
 * One app. The count is the largest thing here — a glance from a metre answers
 * "how much is waiting". The important flag outranks it, and survives even when
 * the preview is showing a routine message.
 */
export function AppTile({ inbox, app, onOpen }: Props) {
  const isQuiet = inbox.unreadCount === 0;
  const latest = isQuiet ? inbox.read[0] ?? null : inbox.unread[0] ?? null;
  const brand = appBrandColor(app.id);
  const room = latest ? notificationLabel(latest) : '';
  const sender = latest && !isQuiet ? notificationSender(latest) : '';
  const showSender = sender !== '' && sender.toLowerCase() !== room.toLowerCase();

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${app.name}, ${inbox.unreadCount} unread${
        inbox.importantCount > 0 ? `, ${inbox.importantCount} important` : ''
      }`}
      class={`relative flex max-h-[210px] min-h-0 flex-col overflow-hidden rounded-[10px] border py-3.5 pl-4 pr-3.5 text-left transition-colors active:scale-[0.99] ${
        isQuiet
          ? 'border-line/30 bg-transparent'
          : inbox.importantCount > 0
          ? 'border-alert/45 bg-alert/10'
          : 'border-line/55 bg-surface'
      }`}
    >
      <span
        class="absolute inset-y-0 left-0 w-[3px] rounded-full"
        style={{
          backgroundColor: inbox.importantCount > 0 && !isQuiet ? 'var(--color-alert)' : brand,
          opacity: isQuiet ? 0.2 : inbox.importantCount > 0 ? 1 : 0.85,
        }}
        aria-hidden="true"
      />

      <span class="flex items-center gap-2 leading-none">
        <span class="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-ink/55">
          <AppIcon appId={app.id} class="h-[17px] w-[17px]" emoji={app.icon} name={app.name} />
        </span>
        <span
          class={`min-w-0 truncate text-[16px] font-semibold ${isQuiet ? 'text-faint' : 'text-text'}`}
        >
          {app.name}
        </span>
        {inbox.importantCount > 0 && !isQuiet && (
          <span class="flex h-[18px] shrink-0 items-center rounded-[4px] bg-alert/18 px-1.5 font-mono text-[12px] font-bold text-alert">
            ! {inbox.importantCount}
          </span>
        )}
        <span
          class={`ml-auto shrink-0 font-mono tabular-nums ${
            isQuiet
              ? 'text-[22px] font-normal text-faint/60'
              : 'text-[26px] font-bold leading-none text-signal'
          }`}
        >
          {isQuiet ? '–' : inbox.unreadCount > 99 ? '99+' : inbox.unreadCount}
        </span>
      </span>

      {showSender && (
        <span class="mt-1.5 truncate text-[14px] text-faint">{sender}</span>
      )}

      <span
        class={`mt-1.5 line-clamp-2 text-[19px] leading-[1.4] ${
          isQuiet ? 'text-muted' : 'font-medium text-text'
        }`}
      >
        {isQuiet ? 'Nothing unread' : latest ? messageText(latest) : 'No messages yet'}
      </span>

      <span class="mt-auto flex items-center gap-2 pt-2">
        <span class="min-w-0 truncate text-[14px] text-faint">
          {room || (isQuiet ? 'no messages' : '')}
        </span>
        {latest && (
          <span class="ml-auto shrink-0 font-mono text-[14px] text-faint">
            {formatRelativeTime(latest.created_at)}
          </span>
        )}
      </span>
    </button>
  );
}

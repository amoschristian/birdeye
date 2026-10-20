import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AppConfig } from '../types';
import { appBrandColor, appRailLabel } from '../utils/appVisuals';
import { formatRelativeTime } from '../utils/time';
import { AppIcon } from './AppIcon';

interface Props {
  app: AppConfig;
  active: boolean;
  lastActivity?: number | null;
  lastSummary?: string;
  onFilter: (appId: string) => void;
}

export function AppButton({ app, active, lastActivity, lastSummary, onFilter }: Props) {
  const previousUnread = useRef(app.unread);
  const [bump, setBump] = useState(false);
  const brand = appBrandColor(app.id);
  const railLabel = appRailLabel(app.name);
  const activity = lastActivity ? formatRelativeTime(lastActivity) : 'quiet';

  useEffect(() => {
    const previous = previousUnread.current;
    previousUnread.current = app.unread;

    if (app.unread <= previous) return;

    setBump(false);
    const frame = requestAnimationFrame(() => setBump(true));
    const timer = setTimeout(() => setBump(false), 450);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [app.unread]);

  const unreadLabel = app.unread > 0 ? `${app.unread} unread` : 'no unread';
  const ariaLabel = `${app.name}, ${unreadLabel}${lastActivity ? `, last active ${formatRelativeTime(lastActivity)}` : ''}`;
  const tooltip = lastSummary ? `${app.name} — ${lastSummary}` : app.name;

  return (
    <button
      type="button"
      onClick={() => onFilter(app.id)}
      aria-pressed={active}
      aria-label={ariaLabel}
      title={tooltip}
      class={`group relative flex min-h-[58px] w-full items-center gap-2 rounded-[10px] py-1.5 pl-2.5 pr-1.5 text-left transition-all duration-150 active:scale-[0.985] ${
        active ? 'bg-raised' : 'hover:bg-surface/70'
      }`}
    >
      <span
        class="absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-full transition-opacity duration-200"
        style={{ backgroundColor: brand, opacity: active ? 1 : app.unread > 0 ? 0.55 : 0.22 }}
        aria-hidden="true"
      />

      <span
        class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border transition-colors ${
          active ? 'border-line/80 bg-ink/70' : 'border-transparent bg-ink/50'
        }`}
      >
        <AppIcon appId={app.id} class="h-[26px] w-[26px]" emoji={app.icon} name={railLabel} />
      </span>

      <span class="min-w-0 flex-1">
        <span
          class={`block truncate text-[17px] leading-tight ${
            active ? 'font-semibold text-text' : 'font-medium text-text/90'
          }`}
        >
          {railLabel}
        </span>
        <span class="mt-1 block truncate font-mono text-[14px] leading-none text-faint">
          {app.unread > 0 ? activity : 'quiet'}
        </span>
      </span>

      {app.unread > 0 ? (
        <span
          key={app.unread}
          class={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-[6px] bg-signal px-1 font-mono text-[14px] font-bold tabular-nums text-ink ${
            bump ? 'animate-badge-bump' : ''
          }`}
          aria-hidden="true"
        >
          {app.unread > 99 ? '99+' : app.unread}
        </span>
      ) : (
        <span class="w-7 shrink-0 text-center font-mono text-[14px] text-faint/50" aria-hidden="true">
          –
        </span>
      )}
    </button>
  );
}

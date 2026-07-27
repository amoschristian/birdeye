import { h } from 'preact';
import type { AppConfig } from '../types';
import { AppIcon } from './AppIcon';

interface Props {
  app: AppConfig;
  active: boolean;
  onFilter: (appId: string) => void;
}

export function AppButton({ app, active, onFilter }: Props) {
  const iconEmoji = app.icon || undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onFilter(app.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onFilter(app.id);
        }
      }}
      class={`relative w-16 h-14 flex flex-col items-center justify-center gap-0.5 border transition-all duration-150 active:brightness-125 select-none focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2 ${
        active
          ? 'bg-[#1E3A5F] border-[#00D4FF] text-[#00D4FF]'
          : 'bg-[#111827] border-[#1E3A5F] text-[#8BA3C7] hover:border-[#00D4FF]'
      }`}
      aria-label={`${app.name}${app.unread > 0 ? ` — ${app.unread} unread` : ''}`}
      title={app.name}
    >
      <AppIcon appId={app.id} class="w-7 h-7" emoji={iconEmoji} />

      {app.unread > 0 && (
        <span
          class="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] flex items-center justify-center px-1 text-[12px] font-bold text-[#0B1120] bg-[#FFB800] border-2 border-[#0B1120] font-mono tabular-nums"
          aria-label={`${app.unread} unread`}
        >
          {app.unread > 99 ? '99+' : app.unread}
        </span>
      )}
    </div>
  );
}

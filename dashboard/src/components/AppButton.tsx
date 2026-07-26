import { h } from 'preact';
import type { AppConfig } from '../types';
import { AppIcon } from './AppIcon';

interface Props {
  app: AppConfig;
  active: boolean;
  onFilter: (appId: string) => void;
}

export function AppButton({ app, active, onFilter }: Props) {
  const iconColor = active ? 'text-[#1a1b26]' : 'text-[#7aa2f7]';
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
      class={`relative w-12 h-14 flex items-center justify-center rounded-xl border cursor-pointer active:scale-95 transition-all duration-150 select-none ${
        active
          ? 'bg-[#7aa2f7] text-[#1a1b26] border-[#7aa2f7]'
          : 'bg-[#24283b] text-[#c0caf5] border-[#33467c] hover:border-[#7aa2f7]'
      }`}
      aria-label={`${app.name}${app.unread > 0 ? ` - ${app.unread} unread` : ''}`}
      title={app.name}
    >
      <AppIcon appId={app.id} class={iconColor} />

      {app.unread > 0 && (
        <span
          class="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] flex items-center justify-center px-1 text-xs font-bold text-white bg-[#f7768e] rounded-full shadow-sm"
          aria-label={`${app.unread} unread`}
        >
          {app.unread > 99 ? '99+' : app.unread}
        </span>
      )}
    </div>
  );
}

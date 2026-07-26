import { h } from 'preact';
import type { AppConfig } from '../types';
import { AppIcon } from './AppIcon';

interface Props {
  app: AppConfig;
  active: boolean;
  onFilter: (appId: string) => void;
}

export function AppButton({ app, active, onFilter }: Props) {
  const iconColor = active ? 'text-[#4da6ff]' : 'text-[#c8d6e0]';
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
      class={`relative w-16 h-12 flex items-center justify-center rounded-sm border cursor-pointer active:brightness-125 transition-all duration-100 select-none focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2 ${
        active
          ? 'bg-[#1c2430] text-[#4da6ff] border-[#4da6ff]'
          : 'bg-[#141b24] text-[#c8d6e0] border-[#252d38] hover:border-[#4da6ff]'
      }`}
      aria-label={`${app.name}${app.unread > 0 ? ` - ${app.unread} unread` : ''}`}
      title={app.name}
    >
      <AppIcon appId={app.id} class={iconColor} />

      {app.unread > 0 && (
        <span
          class="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] flex items-center justify-center px-1 text-[11px] font-bold text-[#0a0e14] bg-[#ff8c42] rounded-full border-2 border-[#141b24] font-mono"
          aria-label={`${app.unread} unread`}
        >
          {app.unread > 99 ? '99+' : app.unread}
        </span>
      )}
    </div>
  );
}

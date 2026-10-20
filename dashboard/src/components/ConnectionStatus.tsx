import { h } from 'preact';

interface Props {
  connected: boolean;
}

export function ConnectionStatus({ connected }: Props) {
  return (
    <span class="flex items-center gap-2" role="status" aria-live="polite">
      <span
        class={`block h-[10px] w-[10px] rounded-full transition-colors duration-200 ${
          connected ? 'bg-ok' : 'bg-warn'
        }`}
        aria-hidden="true"
      />
      <span
        class={`text-[16px] font-medium transition-colors duration-200 ${
          connected ? 'text-ok' : 'text-warn'
        }`}
      >
        {connected ? 'Online' : 'Reconnecting'}
      </span>
    </span>
  );
}

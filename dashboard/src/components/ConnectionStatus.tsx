import { h } from 'preact';

interface Props {
  connected: boolean;
}

export function ConnectionStatus({ connected }: Props) {
  return (
    <span class="flex items-center gap-2">
      <span
        class={`block w-2 h-2 transition-colors duration-200 ${
          connected ? 'bg-[#26DE81]' : 'bg-[#FF9F43]'
        }`}
        role="status"
        aria-label={connected ? 'Connected' : 'Reconnecting'}
        title={connected ? 'Connected' : 'Reconnecting'}
      />
      <span class={`text-[16px] font-semibold uppercase tracking-[0.06em] transition-colors duration-200 ${
        connected ? 'text-[#26DE81]' : 'text-[#FF9F43]'
      }`}>
        {connected ? 'ONLINE' : 'NO SIGNAL'}
      </span>
    </span>
  );
}

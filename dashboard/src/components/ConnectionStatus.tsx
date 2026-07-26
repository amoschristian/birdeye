import { h } from 'preact';

interface Props {
  connected: boolean;
}

export function ConnectionStatus({ connected }: Props) {
  return (
    <span class="flex items-center gap-2">
      <span
        class={`block w-2 h-2 rounded-full transition-all duration-300 ${
          connected
            ? 'bg-[#2ecc71] lamp-glow-green'
            : 'bg-[#ff8c42] lamp-glow-amber animate-lamp-pulse'
        }`}
        role="status"
        aria-label={connected ? 'Connected' : 'Reconnecting'}
        title={connected ? 'Connected — all systems nominal' : 'Reconnecting'}
      />
      {!connected && (
        <span class="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#ff8c42] animate-fade-in select-none">
          NO SIGNAL
        </span>
      )}
      {connected && (
        <span class="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#2ecc71] select-none">
          ONLINE
        </span>
      )}
    </span>
  );
}

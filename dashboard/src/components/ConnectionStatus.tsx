import { h } from 'preact';

interface Props {
  connected: boolean;
}

export function ConnectionStatus({ connected }: Props) {
  return (
    <span
      class={`block w-2.5 h-2.5 rounded-full ${connected ? 'bg-[#9ece6a]' : 'bg-[#f7768e]'}`}
      role="status"
      aria-label={connected ? 'Connected' : 'Disconnected'}
      title={connected ? 'Connected' : 'Disconnected'}
    />
  );
}

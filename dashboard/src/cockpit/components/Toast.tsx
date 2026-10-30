export function Toast({ message }: { message: string | null }) {
  return (
    <div class={'toast' + (message ? ' is-on' : '')} role="status" aria-live="polite">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>{message ?? ''}</span>
    </div>
  );
}

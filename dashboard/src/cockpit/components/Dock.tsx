import type { SpotifyState } from '../../types';
import { Marquee } from './Marquee';
import { SpotifyArt } from './SpotifyArt';

export type Screen = 'home' | 'traffic' | 'plan' | 'tasks' | 'processes';

interface Props {
  screen: Screen;
  onSelect: (screen: Screen) => void;
  planCount: number;
  taskCount: number;
  muted: boolean;
  onToggleMute: () => void;
  spotify: SpotifyState | null;
  mediaOpen: boolean;
  onMedia: () => void;
}

export function Dock({
  screen,
  onSelect,
  planCount,
  taskCount,
  muted,
  onToggleMute,
  spotify,
  mediaOpen,
  onMedia,
}: Props) {
  const nowPlaying = spotify && spotify.available && spotify.title ? spotify : null;
  const nowLabel = nowPlaying
    ? [nowPlaying.artist, nowPlaying.title].filter(Boolean).join(' — ')
    : '';

  return (
    <nav class="dock" aria-label="Screens">
      <button
        type="button"
        class={'dock__btn ' + (screen === 'home' ? 'is-active' : '')}
        onClick={() => onSelect('home')}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
        <span class="dock__label">Home</span>
      </button>

      <button
        type="button"
        class={'dock__btn ' + (screen === 'plan' ? 'is-active' : '')}
        onClick={() => onSelect('plan')}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span class="dock__label">
          Flight plan {planCount > 0 && <span class="dock__count">{planCount}</span>}
        </span>
      </button>

      <button
        type="button"
        class={'dock__btn ' + (screen === 'tasks' ? 'is-active' : '')}
        onClick={() => onSelect('tasks')}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        <span class="dock__label">
          Tasks {taskCount > 0 && <span class="dock__count">{taskCount}</span>}
        </span>
      </button>

      <button
        type="button"
        class={'dock__btn ' + (screen === 'processes' ? 'is-active' : '')}
        onClick={() => onSelect('processes')}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
        <span class="dock__label">Processes</span>
      </button>

      <button
        type="button"
        class={'dock__btn dock__media ' + (mediaOpen ? 'is-open' : '')}
        aria-expanded={mediaOpen}
        aria-controls="media-popup"
        onClick={onMedia}
      >
        <span class="dock__thumb">
          <SpotifyArt url={nowPlaying ? nowPlaying.artUrl : ''} size="thumb" />
        </span>
        <span class="dock__label dock__label--track">
          {nowLabel ? <Marquee text={nowLabel} /> : 'Media'}
        </span>
      </button>

      <button
        type="button"
        class={'dock__mute ' + (muted ? 'is-muted' : '')}
        aria-pressed={muted}
        onClick={onToggleMute}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </svg>
        <span>{muted ? 'Muted' : 'Mute'}</span>
      </button>
    </nav>
  );
}

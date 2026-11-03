import type { ComponentChildren } from 'preact';
import type { SpotifyLoopMode, SpotifyState } from '../../types';
import type { SpotifyCommand } from '../../hooks/useWebSocket';
import { mediaClock } from '../helpers';
import { SpotifyArt } from './SpotifyArt';

interface Props {
  open: boolean;
  spotify: SpotifyState | null;
  onClose: () => void;
  onCommand: (command: SpotifyCommand) => void;
}

const LOOP_LABEL: Record<SpotifyLoopMode, string> = {
  None: 'Loop off',
  Playlist: 'Loop all',
  Track: 'Loop one',
};

const NEXT_LOOP: Record<SpotifyLoopMode, SpotifyLoopMode> = {
  None: 'Playlist',
  Playlist: 'Track',
  Track: 'None',
};

interface Status {
  label: string;
  tone: 'live' | 'idle' | 'off';
  hint: string;
}

function statusOf(spotify: SpotifyState | null, track: SpotifyState | null): Status {
  if (!spotify) return { label: 'Connecting', tone: 'idle', hint: 'Waiting for audio source' };
  if (!spotify.available) return { label: 'Offline', tone: 'off', hint: 'Open Spotify to connect' };
  if (!track) return { label: 'Idle', tone: 'idle', hint: 'Nothing playing' };
  if (track.playing) return { label: 'Playing', tone: 'live', hint: '' };
  return { label: 'Paused', tone: 'idle', hint: '' };
}

function Control({
  label,
  primary,
  disabled,
  onClick,
  children,
}: {
  label: string;
  primary?: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      type="button"
      class={'media__ctl' + (primary ? ' media__ctl--primary' : '')}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function MediaDrawer({ open, spotify, onClose, onCommand }: Props) {
  if (!open) return null;

  const track = spotify && spotify.available && spotify.title ? spotify : null;
  const status = statusOf(spotify, track);
  const duration = track ? track.duration : 0;
  const position = track ? Math.min(track.position, duration) : 0;
  const percent = duration > 0 ? Math.min(position / duration, 1) * 100 : 0;
  const shuffle = track ? track.shuffle : false;
  const loop = track ? track.loop : 'None';

  return (
    <section class="media" id="media-popup" aria-label="Now playing">
      <button type="button" class="media__close" aria-label="Close media" onClick={onClose}>
        ×
      </button>

      <div class="media__art">
        <SpotifyArt url={track ? track.artUrl : ''} size="large" />
      </div>

      <div class="media__info">
        <div class="media__meta">
          <span class={'media__state media__state--' + status.tone}>{status.label}</span>
          {track && track.album && <span class="media__album">{track.album}</span>}
        </div>

        <span class="media__title">{track ? track.title : status.hint}</span>
        <span class="media__artist">{track ? track.artist : ''}</span>

        <div class="media__progress">
          <span class="media__bar" aria-hidden="true">
            <i style={{ width: percent + '%' }} />
          </span>
          <span class="media__times">
            <b>{mediaClock(position)}</b>
            <span>{mediaClock(duration)}</span>
          </span>
        </div>

        <div class="media__actions">
          <div class="media__modes">
            <button
              type="button"
              class={'media__mode' + (shuffle ? ' is-on' : '')}
              aria-pressed={shuffle}
              disabled={!track}
              onClick={() => onCommand({ command: 'shuffle', value: !shuffle })}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21 16 21 21 16 21" />
                <line x1="15" y1="15" x2="21" y2="21" />
                <line x1="4" y1="4" x2="9" y2="9" />
              </svg>
              <span>Shuffle</span>
            </button>

            <button
              type="button"
              class={'media__mode' + (loop !== 'None' ? ' is-on' : '')}
              aria-pressed={loop !== 'None'}
              disabled={!track}
              onClick={() => onCommand({ command: 'loop', value: NEXT_LOOP[loop] })}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
              <span>{LOOP_LABEL[loop]}</span>
            </button>
          </div>

          <div class="media__controls">
            <Control label="Previous track" disabled={!track} onClick={() => onCommand({ command: 'previous' })}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polygon points="19 20 9 12 19 4 19 20" />
                <line x1="5" y1="19" x2="5" y2="5" />
              </svg>
            </Control>

            <Control
              label={track?.playing ? 'Pause' : 'Play'}
              primary
              disabled={!track}
              onClick={() => onCommand({ command: 'play_pause' })}
            >
              {track?.playing ? (
                <svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="5" width="4" height="14" />
                  <rect x="14" y="5" width="4" height="14" />
                </svg>
              ) : (
                <svg width="38" height="38" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <polygon points="7 4 20 12 7 20 7 4" />
                </svg>
              )}
            </Control>

            <Control label="Next track" disabled={!track} onClick={() => onCommand({ command: 'next' })}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polygon points="5 4 15 12 5 20 5 4" />
                <line x1="19" y1="5" x2="19" y2="19" />
              </svg>
            </Control>
          </div>
        </div>
      </div>
    </section>
  );
}

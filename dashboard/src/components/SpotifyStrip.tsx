import { h } from 'preact';
import { SkipBack, Play, Pause, SkipForward } from 'lucide-preact';
import type { SpotifyState } from '../types';

interface SpotifyStripProps {
  data: SpotifyState | null;
  onCommand: (command: 'play_pause' | 'previous' | 'next') => void;
}

function formatDuration(ms: number): string {
  if (!ms) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function SpotifyStrip({ data, onCommand }: SpotifyStripProps) {
  if (!data) {
    return (
      <div class="h-16 shrink-0 border-t border-[#33467c] bg-[#1a1b26] flex items-center justify-center">
        <span class="text-xs text-[#565f89]">🎵 Connecting...</span>
      </div>
    );
  }

  if (!data.available) {
    return (
      <div class="h-16 shrink-0 border-t border-[#33467c] bg-[#1a1b26] flex items-center justify-center">
        <span class="text-xs text-[#565f89]">🎵 Spotify not running</span>
      </div>
    );
  }

  if (!data.title) {
    return (
      <div class="h-16 shrink-0 border-t border-[#33467c] bg-[#1a1b26] flex items-center justify-center">
        <span class="text-xs text-[#565f89]">🎵 Nothing playing</span>
      </div>
    );
  }

  const isAd = !data.album && !data.artUrl;

  return (
    <div class="h-16 shrink-0 border-t border-[#33467c] bg-[#1a1b26] flex items-center px-3 gap-3">
      {/* Album art or fallback icon */}
      {data.artUrl ? (
        <img
          src={data.artUrl}
          alt=""
          class="w-12 h-12 rounded-lg object-cover shrink-0"
          loading="lazy"
        />
      ) : (
        <div class="w-12 h-12 rounded-lg bg-[#24283b] flex items-center justify-center shrink-0">
          <span class="text-lg text-[#565f89]">♪</span>
        </div>
      )}

      {/* Track info + thin progress bar */}
      <div class="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        {isAd ? (
          <span class="text-sm text-[#e0af68] truncate">{data.title} — Advertisement</span>
        ) : (
          <>
            <span class="text-sm font-medium text-[#c0caf5] truncate">{data.title}</span>
            <span class="text-xs text-[#565f89] truncate">{data.artist}</span>
          </>
        )}
        {!isAd && data.duration > 0 && (
          <div class="w-full h-0.5 bg-[#33467c] rounded-full overflow-hidden">
            <div
              class="h-full bg-[#7aa2f7] rounded-full transition-all duration-1000"
              style={{ width: `${Math.min((data.position / data.duration) * 100, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Control buttons — plain white icons, more space */}
      {!isAd && (
        <div class="flex items-center gap-5 shrink-0">
          <button
            onClick={() => onCommand('previous')}
            class="text-white hover:text-[#7aa2f7] active:scale-90 transition-all select-none"
            aria-label="Previous track"
          >
            <SkipBack size={26} />
          </button>
          <button
            onClick={() => onCommand('play_pause')}
            class="text-white hover:text-[#7aa2f7] active:scale-90 transition-all select-none"
            aria-label={data.playing ? 'Pause' : 'Play'}
          >
            {data.playing ? <Pause size={30} /> : <Play size={30} />}
          </button>
          <button
            onClick={() => onCommand('next')}
            class="text-white hover:text-[#7aa2f7] active:scale-90 transition-all select-none"
            aria-label="Next track"
          >
            <SkipForward size={26} />
          </button>
        </div>
      )}

      {/* Duration (compact) */}
      {!isAd && data.duration > 0 && (
        <span class="text-sm text-[#565f89] tabular-nums shrink-0">
          {formatDuration(data.position)}/{formatDuration(data.duration)}
        </span>
      )}
    </div>
  );
}

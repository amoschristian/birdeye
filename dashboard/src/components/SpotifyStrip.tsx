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
      <div class="h-14 shrink-0 border-t border-[#252d38] bg-[#0a0e14] flex items-center px-3">
        <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#8a9ba8]">AUDIO —</span>
      </div>
    );
  }

  if (!data.available) {
    return (
      <div class="h-14 shrink-0 border-t border-[#252d38] bg-[#0a0e14] flex items-center px-3">
        <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#8a9ba8]">AUDIO OFFLINE</span>
      </div>
    );
  }

  if (!data.title) {
    return (
      <div class="h-14 shrink-0 border-t border-[#252d38] bg-[#0a0e14] flex items-center px-3">
        <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#8a9ba8]">AUDIO IDLE</span>
      </div>
    );
  }

  const isAd = !data.album && !data.artUrl;

  return (
    <div class="h-14 shrink-0 border-t border-[#252d38] bg-[#0a0e14] flex items-center px-3 gap-3">
      {/* Album art */}
      {data.artUrl ? (
        <img src={data.artUrl} alt="" class="w-10 h-10 object-cover shrink-0" loading="lazy" />
      ) : (
        <div class="w-10 h-10 bg-[#141b24] flex items-center justify-center shrink-0">
          <span class="text-lg text-[#8a9ba8]">♪</span>
        </div>
      )}

      {/* Track info */}
      <div class="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        {isAd ? (
          <span class="text-[14px] text-[#ff8c42] truncate font-mono">{data.title}</span>
        ) : (
          <>
            <span class="text-[14px] font-medium text-[#c8d6e0] truncate">{data.title}</span>
            <span class="font-mono text-[13px] text-[#8a9ba8] truncate">{data.artist}</span>
          </>
        )}
        {!isAd && data.duration > 0 && (
          <div class="w-full h-[2px] bg-[#252d38] overflow-hidden">
            <div
              class="h-full bg-[#4da6ff] transition-all duration-1000"
              style={{ width: `${Math.min((data.position / data.duration) * 100, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Controls */}
      {!isAd && (
        <div class="flex items-center gap-5 shrink-0">
          <button
            onClick={() => onCommand('previous')}
            class="text-[#c8d6e0] hover:text-[#4da6ff] active:brightness-125 transition-all select-none focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2 rounded-sm"
            aria-label="Previous track"
          >
            <SkipBack size={24} />
          </button>
          <button
            onClick={() => onCommand('play_pause')}
            class="text-[#c8d6e0] hover:text-[#4da6ff] active:brightness-125 transition-all select-none focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2 rounded-sm"
            aria-label={data.playing ? 'Pause' : 'Play'}
          >
            {data.playing ? <Pause size={28} /> : <Play size={28} />}
          </button>
          <button
            onClick={() => onCommand('next')}
            class="text-[#c8d6e0] hover:text-[#4da6ff] active:brightness-125 transition-all select-none focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2 rounded-sm"
            aria-label="Next track"
          >
            <SkipForward size={24} />
          </button>
        </div>
      )}

      {/* Duration */}
      {!isAd && data.duration > 0 && (
        <span class="font-mono text-[14px] text-[#8a9ba8] tabular-nums shrink-0">
          {formatDuration(data.position)}/{formatDuration(data.duration)}
        </span>
      )}
    </div>
  );
}

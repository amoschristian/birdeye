import { h } from 'preact';
import { SkipBack, Play, Pause, SkipForward } from 'lucide-preact';
import type { SpotifyState, MonitorData } from '../types';

interface BottomBarProps {
  spotifyData: SpotifyState | null;
  onSpotifyCommand: (command: 'play_pause' | 'previous' | 'next') => void;
  monitorData: MonitorData | null;
}

function formatDuration(ms: number): string {
  if (!ms) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function thresholdColor(percent: number): string {
  if (percent < 60) return '#9ece6a';
  if (percent < 85) return '#e0af68';
  return '#f7768e';
}

function MiniBar({ percent }: { percent: number }) {
  const color = thresholdColor(percent);
  return (
    <div class="w-10 h-1.5 bg-[#33467c] rounded-full overflow-hidden inline-block align-middle">
      <div
        class="h-full rounded-full"
        style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

function SpotifyLeft({ data, onCommand }: { data: SpotifyState | null; onCommand: (command: 'play_pause' | 'previous' | 'next') => void }) {
  if (!data) {
    return <span class="text-xs text-[#565f89]">🎵 Connecting...</span>;
  }

  if (!data.available) {
    return <span class="text-xs text-[#565f89]">🎵 Spotify not running</span>;
  }

  if (!data.title) {
    return <span class="text-xs text-[#565f89]">🎵 Nothing playing</span>;
  }

  const isAd = !data.album && !data.artUrl;

  return (
    <div class="flex items-center gap-2 min-w-0 flex-1">
      {/* Album art */}
      {data.artUrl ? (
        <img src={data.artUrl} alt="" class="w-10 h-10 rounded-lg object-cover shrink-0" loading="lazy" />
      ) : (
        <div class="w-10 h-10 rounded-lg bg-[#24283b] flex items-center justify-center shrink-0">
          <span class="text-base text-[#565f89]">♪</span>
        </div>
      )}

      {/* Track info */}
      <div class="min-w-0 flex flex-col justify-center gap-0.5 flex-1">
        {isAd ? (
          <span class="text-xs text-[#e0af68] truncate">{data.title} — Ad</span>
        ) : (
          <>
            <span class="text-xs font-medium text-[#c0caf5] truncate">{data.title}</span>
            <span class="text-[11px] text-[#565f89] truncate">{data.artist}</span>
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

      {/* Controls */}
      {!isAd && (
        <div class="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onCommand('previous')}
            class="text-white hover:text-[#7aa2f7] active:scale-90 transition-all select-none"
            aria-label="Previous track"
          >
            <SkipBack size={20} />
          </button>
          <button
            onClick={() => onCommand('play_pause')}
            class="text-white hover:text-[#7aa2f7] active:scale-90 transition-all select-none"
            aria-label={data.playing ? 'Pause' : 'Play'}
          >
            {data.playing ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button
            onClick={() => onCommand('next')}
            class="text-white hover:text-[#7aa2f7] active:scale-90 transition-all select-none"
            aria-label="Next track"
          >
            <SkipForward size={20} />
          </button>
        </div>
      )}

      {/* Duration */}
      {!isAd && data.duration > 0 && (
        <span class="text-[11px] text-[#565f89] tabular-nums shrink-0">
          {formatDuration(data.position)}/{formatDuration(data.duration)}
        </span>
      )}
    </div>
  );
}

function MonitorRight({ data }: { data: MonitorData | null }) {
  if (!data) {
    return (
      <div class="flex items-center gap-4 text-xs text-[#565f89]">
        <span>CPU —</span>
        <span>RAM —</span>
      </div>
    );
  }

  const isStale = (Date.now() / 1000 - data.ts) > 10;
  const opacity = isStale ? 'opacity-40' : '';

  return (
    <div class={`flex items-center gap-4 text-xs font-medium tabular-nums ${opacity}`}>
      {/* CPU */}
      <span class="flex items-center gap-1.5">
        <span class="text-[#565f89]">CPU</span>
        <MiniBar percent={data.cpu} />
        <span class="w-9 text-right" style={{ color: thresholdColor(data.cpu) }}>{data.cpu.toFixed(1)}%</span>
      </span>

      {/* RAM */}
      <span class="flex items-center gap-1.5">
        <span class="text-[#565f89]">RAM</span>
        <MiniBar percent={data.ram.percent} />
        <span class="w-9 text-right" style={{ color: thresholdColor(data.ram.percent) }}>{data.ram.percent.toFixed(1)}%</span>
      </span>
    </div>
  );
}

export function BottomBar({ spotifyData, onSpotifyCommand, monitorData }: BottomBarProps) {
  return (
    <div class="h-16 shrink-0 border-t border-[#33467c] bg-[#1a1b26] flex">
      {/* Left: Spotify */}
      <div class="flex-1 min-w-0 flex items-center px-3 border-r border-[#33467c]">
        <SpotifyLeft data={spotifyData} onCommand={onSpotifyCommand} />
      </div>

      {/* Right: CPU + RAM */}
      <div class="flex items-center justify-center px-4 w-[340px] shrink-0">
        <MonitorRight data={monitorData} />
      </div>
    </div>
  );
}

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
  if (percent < 60) return '#2ecc71';
  if (percent < 85) return '#ff8c42';
  return '#ff4d4d';
}

function GaugeBar({ percent }: { percent: number }) {
  const color = thresholdColor(percent);
  return (
    <div class="w-12 h-1.5 bg-[#252d38] overflow-hidden inline-block align-middle">
      <div
        class="h-full"
        style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

function SpotifyLeft({ data, onCommand }: { data: SpotifyState | null; onCommand: (command: 'play_pause' | 'previous' | 'next') => void }) {
  if (!data) {
    return <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#8a9ba8]">AUDIO —</span>;
  }

  if (!data.available) {
    return <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#8a9ba8]">AUDIO OFFLINE</span>;
  }

  if (!data.title) {
    return <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#8a9ba8]">AUDIO IDLE</span>;
  }

  const isAd = !data.album && !data.artUrl;

  return (
    <div class="flex items-center gap-2 min-w-0 flex-1">
      {/* Album art */}
      {data.artUrl ? (
        <img src={data.artUrl} alt="" class="w-9 h-9 object-cover shrink-0" loading="lazy" />
      ) : (
        <div class="w-9 h-9 bg-[#141b24] flex items-center justify-center shrink-0">
          <span class="text-base text-[#8a9ba8]">♪</span>
        </div>
      )}

      {/* Track info */}
      <div class="min-w-0 flex flex-col justify-center gap-0.5 flex-1">
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
        <div class="flex items-center gap-4 shrink-0">
          <button
            onClick={() => onCommand('previous')}
            class="text-[#c8d6e0] hover:text-[#4da6ff] active:brightness-125 transition-all select-none focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2 rounded-sm"
            aria-label="Previous track"
          >
            <SkipBack size={18} />
          </button>
          <button
            onClick={() => onCommand('play_pause')}
            class="text-[#c8d6e0] hover:text-[#4da6ff] active:brightness-125 transition-all select-none focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2 rounded-sm"
            aria-label={data.playing ? 'Pause' : 'Play'}
          >
            {data.playing ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button
            onClick={() => onCommand('next')}
            class="text-[#c8d6e0] hover:text-[#4da6ff] active:brightness-125 transition-all select-none focus-visible:outline-2 focus-visible:outline-[#4da6ff] focus-visible:outline-offset-2 rounded-sm"
            aria-label="Next track"
          >
            <SkipForward size={18} />
          </button>
        </div>
      )}

      {/* Duration */}
      {!isAd && data.duration > 0 && (
        <span class="font-mono text-[13px] text-[#8a9ba8] tabular-nums shrink-0">
          {formatDuration(data.position)}
        </span>
      )}
    </div>
  );
}

function MonitorRight({ data }: { data: MonitorData | null }) {
  if (!data) {
    return (
      <div class="flex items-center gap-6">
        <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#8a9ba8]">CPU —</span>
        <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#8a9ba8]">RAM —</span>
      </div>
    );
  }

  const isStale = (Date.now() / 1000 - data.ts) > 10;
  const opacity = isStale ? 'opacity-40' : '';

  return (
    <div class={`flex items-center gap-6 ${opacity}`}>
      {/* CPU */}
      <span class="flex items-center gap-2">
        <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#8a9ba8]">CPU</span>
        <GaugeBar percent={data.cpu} />
        <span class="font-mono text-[14px] font-medium tabular-nums w-14 text-right" style={{ color: thresholdColor(data.cpu) }}>{data.cpu.toFixed(1)}%</span>
      </span>

      {/* RAM */}
      <span class="flex items-center gap-2">
        <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#8a9ba8]">RAM</span>
        <GaugeBar percent={data.ram.percent} />
        <span class="font-mono text-[14px] font-medium tabular-nums w-14 text-right" style={{ color: thresholdColor(data.ram.percent) }}>{data.ram.percent.toFixed(1)}%</span>
      </span>
    </div>
  );
}

export function BottomBar({ spotifyData, onSpotifyCommand, monitorData }: BottomBarProps) {
  return (
    <div class="h-14 shrink-0 border-t border-[#252d38] bg-[#0a0e14] flex">
      {/* Left: Spotify */}
      <div class="flex-1 min-w-0 flex items-center px-3 border-r border-[#252d38]">
        <SpotifyLeft data={spotifyData} onCommand={onSpotifyCommand} />
      </div>

      {/* Right: CPU + RAM */}
      <div class="flex items-center justify-center px-4 w-[340px] shrink-0">
        <MonitorRight data={monitorData} />
      </div>
    </div>
  );
}

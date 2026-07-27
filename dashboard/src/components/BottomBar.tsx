import { h } from 'preact';
import { SkipBack, Play, Pause, SkipForward } from 'lucide-preact';
import type { SpotifyState, MonitorData } from '../types';

interface BottomBarProps {
  spotifyData: SpotifyState | null;
  onSpotifyCommand: (command: 'play_pause' | 'previous' | 'next') => void;
  monitorData: MonitorData | null;
}

function thresholdColor(percent: number): string {
  if (percent < 60) return '#26DE81';
  if (percent < 85) return '#FF9F43';
  return '#FF4757';
}

function formatDuration(ms: number): string {
  if (!ms) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function GaugeBar({ percent }: { percent: number }) {
  const color = thresholdColor(percent);
  return (
    <div class="w-12 h-1 bg-[#1E3A5F] overflow-hidden">
      <div
        class="h-full transition-all duration-300"
        style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function BottomBar({ spotifyData, onSpotifyCommand, monitorData }: BottomBarProps) {
  return (
    <div class="h-14 shrink-0 border-t border-[#1E3A5F] bg-[#0B1120] flex">
      {/* Spotify — left */}
      <div class="flex-1 min-w-0 flex items-center px-3 py-1 border-r border-[#1E3A5F]">
        <SpotifySection data={spotifyData} onCommand={onSpotifyCommand} />
      </div>

      {/* CPU/RAM — right */}
      <div class="flex items-center px-4 gap-6 shrink-0">
        <MonitorSection data={monitorData} />
      </div>
    </div>
  );
}

function SpotifySection({ data, onCommand }: { data: SpotifyState | null; onCommand: (command: 'play_pause' | 'previous' | 'next') => void }) {
  if (!data) {
    return <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#4A6080]">AUDIO —</span>;
  }

  if (!data.available) {
    return <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#4A6080]">AUDIO OFFLINE</span>;
  }

  if (!data.title) {
    return <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#4A6080]">AUDIO IDLE</span>;
  }

  const isAd = !data.album && !data.artUrl;

  return (
    <div class="flex items-center gap-2 min-w-0 flex-1">
      {/* Album art */}
      {data.artUrl ? (
        <img src={data.artUrl} alt="" class="w-9 h-9 object-cover shrink-0" loading="lazy" />
      ) : (
        <div class="w-9 h-9 bg-[#111827] flex items-center justify-center shrink-0">
          <span class="text-[18px] text-[#4A6080]">♪</span>
        </div>
      )}

      {/* Track info */}
      <div class="min-w-0 flex flex-col justify-center flex-1">
        {isAd ? (
          <span class="text-[20px] text-[#FF9F43] truncate font-mono">{data.title}</span>
        ) : (
          <>
            <span class="text-[20px] font-medium text-[#E8F0FE] truncate font-mono">{data.title}</span>
            <span class="text-[16px] text-[#8BA3C7] truncate">{data.artist}</span>
          </>
        )}
        {!isAd && data.duration > 0 && (
          <div class="w-full h-[2px] bg-[#1E3A5F] overflow-hidden mt-0.5">
            <div
              class="h-full bg-[#00D4FF] transition-all duration-1000"
              style={{ width: `${Math.min((data.position / data.duration) * 100, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Transport controls */}
      {!isAd && (
        <div class="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onCommand('previous')}
            class="text-[#8BA3C7] hover:text-[#00D4FF] active:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2"
            aria-label="Previous"
          >
            <SkipBack size={20} />
          </button>
          <button
            onClick={() => onCommand('play_pause')}
            class="text-[#E8F0FE] hover:text-[#00D4FF] active:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2"
            aria-label={data.playing ? 'Pause' : 'Play'}
          >
            {data.playing ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button
            onClick={() => onCommand('next')}
            class="text-[#8BA3C7] hover:text-[#00D4FF] active:brightness-125 transition-all focus-visible:outline-2 focus-visible:outline-[#00D4FF] focus-visible:outline-offset-2"
            aria-label="Next"
          >
            <SkipForward size={20} />
          </button>
        </div>
      )}

      {/* Duration */}
      {!isAd && data.duration > 0 && (
        <span class="font-mono text-[16px] text-[#4A6080] tabular-nums shrink-0 ml-1">
          {formatDuration(data.position)}
        </span>
      )}
    </div>
  );
}

function MonitorSection({ data }: { data: MonitorData | null }) {
  if (!data) {
    return (
      <div class="flex items-center gap-6">
        <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#4A6080]">CPU —</span>
        <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#4A6080]">RAM —</span>
      </div>
    );
  }

  const isStale = (Date.now() / 1000 - data.ts) > 10;
  const opacity = isStale ? 'opacity-40' : '';

  return (
    <div class={`flex items-center gap-6 ${opacity}`}>
      <span class="flex items-center gap-2">
        <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#8BA3C7]">CPU</span>
        <GaugeBar percent={data.cpu} />
        <span
          class="font-mono text-[20px] font-medium tabular-nums w-16 text-right"
          style={{ color: thresholdColor(data.cpu) }}
        >
          {data.cpu.toFixed(1)}%
        </span>
      </span>

      <span class="w-px h-4 bg-[#1E3A5F]" />

      <span class="flex items-center gap-2">
        <span class="text-[16px] font-semibold uppercase tracking-[0.06em] text-[#8BA3C7]">RAM</span>
        <GaugeBar percent={data.ram.percent} />
        <span
          class="font-mono text-[20px] font-medium tabular-nums w-16 text-right"
          style={{ color: thresholdColor(data.ram.percent) }}
        >
          {data.ram.percent.toFixed(1)}%
        </span>
      </span>
    </div>
  );
}

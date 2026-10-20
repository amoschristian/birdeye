import { h } from 'preact';
import { Pause, Play, SkipBack, SkipForward, Music2 } from 'lucide-preact';
import type { SpotifyState, MonitorData } from '../types';
import { formatDuration } from '../utils/time';

interface BottomBarProps {
  spotifyData: SpotifyState | null;
  onSpotifyCommand: (command: 'play_pause' | 'previous' | 'next' | 'seek', positionMs?: number) => void;
  monitorData: MonitorData | null;
}

function thresholdColor(percent: number): string {
  if (percent < 60) return 'var(--color-ok)';
  if (percent < 85) return 'var(--color-warn)';
  return 'var(--color-alert)';
}

function formatRate(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)}B`;
  if (bytesPerSecond < 1024 * 1024) return `${Math.round(bytesPerSecond / 1024)}K`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)}M`;
}

function formatGigabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
}

export function BottomBar({ spotifyData, onSpotifyCommand, monitorData }: BottomBarProps) {
  return (
    <div class="flex h-[64px] shrink-0 border-t border-line/60 bg-ink">
      <div class="flex min-w-0 flex-1 items-center border-r border-line/60 px-4">
        <SpotifySection data={spotifyData} onCommand={onSpotifyCommand} />
      </div>

      <div class="flex shrink-0 items-center gap-4 px-4">
        <MonitorSection data={monitorData} />
      </div>
    </div>
  );
}

function AudioPlaceholder({ label, hint }: { label: string; hint: string }) {
  return (
    <div class="flex min-w-0 items-center gap-3">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px] border border-line/50 bg-surface text-faint">
        <Music2 size={21} />
      </span>
      <span class="min-w-0">
        <span class="block truncate text-[17px] font-medium text-muted">{label}</span>
        <span class="mt-0.5 block truncate text-[14px] text-faint">{hint}</span>
      </span>
    </div>
  );
}

function SpotifySection({
  data,
  onCommand,
}: {
  data: SpotifyState | null;
  onCommand: (command: 'play_pause' | 'previous' | 'next' | 'seek', positionMs?: number) => void;
}) {
  if (!data) return <AudioPlaceholder label="Audio connecting…" hint="Waiting for Spotify" />;
  if (!data.available) return <AudioPlaceholder label="Audio offline" hint="Open Spotify to connect" />;
  if (!data.title) return <AudioPlaceholder label="Nothing playing" hint="Spotify is ready" />;

  const isAd = !data.album && !data.artUrl;

  return (
    <div class="flex min-w-0 flex-1 items-center gap-3">
      {data.artUrl ? (
        <img
          src={data.artUrl}
          alt=""
          class="h-11 w-11 shrink-0 rounded-[9px] object-cover"
          loading="lazy"
        />
      ) : (
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[9px] border border-line/50 bg-surface text-faint">
          <Music2 size={21} />
        </span>
      )}

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class={`truncate text-[19px] font-semibold leading-tight ${isAd ? 'text-warn' : 'text-text'}`}>
            {data.title}
          </span>
          {isAd && (
            <span class="shrink-0 rounded-[4px] border border-warn/40 px-1.5 py-0.5 text-[14px] font-semibold leading-none text-warn">
              Advertisement
            </span>
          )}
        </div>

        {!isAd && (
          <>
            <div class="mt-0.5 flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-[16px] leading-tight text-muted">
                {data.artist || data.album}
              </span>
              {data.duration > 0 && (
                <span class="shrink-0 font-mono text-[14px] tabular-nums text-faint">
                  {formatDuration(data.position)} / {formatDuration(data.duration)}
                </span>
              )}
            </div>
            {data.duration > 0 && (
              <ScrubBar
                duration={data.duration}
                position={data.position}
                onScrub={(positionMs) => onCommand('seek', positionMs)}
              />
            )}
          </>
        )}
      </div>

      {!isAd && (
        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onCommand('previous')}
            class="flex h-12 w-12 items-center justify-center rounded-[9px] text-muted transition-all hover:bg-surface hover:text-text active:scale-95"
            aria-label="Previous track"
          >
            <SkipBack size={20} />
          </button>
          <button
            type="button"
            onClick={() => onCommand('play_pause')}
            class="flex h-12 w-12 items-center justify-center rounded-[9px] bg-raised text-text transition-all hover:bg-line active:scale-95"
            aria-label={data.playing ? 'Pause' : 'Play'}
          >
            {data.playing ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button
            type="button"
            onClick={() => onCommand('next')}
            class="flex h-12 w-12 items-center justify-center rounded-[9px] text-muted transition-all hover:bg-surface hover:text-text active:scale-95"
            aria-label="Next track"
          >
            <SkipForward size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

function ScrubBar({
  duration,
  position,
  onScrub,
}: {
  duration: number;
  position: number;
  onScrub: (ms: number) => void;
}) {
  const percent = duration > 0 ? Math.min(position / duration, 1) : 0;

  return (
    <div class="relative mt-1.5 h-1 w-full rounded-full bg-line/60">
      <div
        class="absolute inset-y-0 left-0 rounded-full bg-action"
        style={{ width: `${percent * 100}%` }}
      />
      <input
        type="range"
        min={0}
        max={duration || 1}
        value={Math.min(position, duration)}
        step={1000}
        onChange={(event) => onScrub(Number((event.target as HTMLInputElement).value))}
        aria-label="Seek"
        class="absolute -top-2.5 left-0 h-6 w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

function StatMeter({
  label,
  percent,
  detail,
}: {
  label: string;
  percent: number | null;
  detail?: string;
}) {
  const color = percent === null ? 'var(--color-faint)' : thresholdColor(percent);

  return (
    <span class="flex w-[100px] shrink-0 flex-col gap-1" title={detail}>
      <span class="flex items-baseline justify-between">
        <span class="text-[14px] font-semibold tracking-[0.06em] text-faint">{label}</span>
        <span class="w-[50px] text-right font-mono text-[17px] font-medium tabular-nums" style={{ color }}>
          {percent === null ? '—' : `${percent.toFixed(0)}%`}
        </span>
      </span>
      <span class="h-[3px] w-full overflow-hidden rounded-full bg-line/70">
        <span
          class="block h-full rounded-full transition-all duration-300"
          style={{
            width: percent === null ? '0%' : `${Math.min(percent, 100)}%`,
            backgroundColor: color,
          }}
        />
      </span>
    </span>
  );
}

function MonitorSection({ data }: { data: MonitorData | null }) {
  if (!data) {
    return (
      <div class="flex shrink-0 items-center gap-4">
        <StatMeter label="CPU" percent={null} detail="Waiting for telemetry" />
        <StatMeter label="RAM" percent={null} detail="Waiting for telemetry" />
        <StatMeter label="DISK" percent={null} detail="Waiting for telemetry" />
        <span class="flex w-[124px] shrink-0 flex-col gap-1 overflow-hidden">
          <span class="text-[14px] font-semibold tracking-[0.06em] text-faint">NET</span>
          <span class="font-mono text-[14px] text-faint">—</span>
        </span>
      </div>
    );
  }

  const isStale = Date.now() / 1000 - data.ts > 10;
  const ramDetail = `${formatGigabytes(data.ram.used)} of ${formatGigabytes(data.ram.total)} used`;
  const diskDetail = `${formatGigabytes(data.disk.used)} of ${formatGigabytes(data.disk.total)} used`;

  return (
    <div class={`flex items-center gap-4 transition-opacity duration-300 ${isStale ? 'opacity-40' : ''}`}>
      <StatMeter label="CPU" percent={data.cpu} detail="Processor load" />
      <StatMeter label="RAM" percent={data.ram.percent} detail={ramDetail} />
      <StatMeter label="DISK" percent={data.disk.percent} detail={diskDetail} />

      <span class="flex w-[124px] shrink-0 flex-col gap-1 overflow-hidden" title="Network throughput">
        <span class="text-[14px] font-semibold tracking-[0.06em] text-faint">NET</span>
        <span class="flex flex-col gap-0.5 font-mono text-[14px] leading-none tabular-nums">
          <span class="flex items-center gap-1 text-ok">
            <span class="shrink-0">↓</span>
            <span class="w-[76px] text-right">{formatRate(data.net.dl)}/s</span>
          </span>
          <span class="flex items-center gap-1 text-action">
            <span class="shrink-0">↑</span>
            <span class="w-[76px] text-right">{formatRate(data.net.ul)}/s</span>
          </span>
        </span>
      </span>
    </div>
  );
}

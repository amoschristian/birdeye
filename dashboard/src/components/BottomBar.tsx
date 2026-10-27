import { h } from 'preact';
import { Music2 } from 'lucide-preact';
import type { SpotifyState, MonitorData } from '../types';
import { formatDuration } from '../utils/time';

interface BottomBarProps {
  spotifyData: SpotifyState | null;
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

/**
 * Now-playing and telemetry only. Playback control lives in Spotify itself —
 * three 48px transport buttons in a 64px bar were too small to hit on a
 * touchscreen, so the strip became a readout rather than a half-working remote.
 */
export function BottomBar({ spotifyData, monitorData }: BottomBarProps) {
  return (
    <div class="flex h-[64px] shrink-0 items-center gap-3 border-t border-line/60 bg-ink px-4">
      <NowPlaying data={spotifyData} />
      <MonitorCluster data={monitorData} />
    </div>
  );
}

function AudioPlaceholder({ label, hint }: { label: string; hint: string }) {
  return (
    <div class="flex min-w-0 flex-1 items-center gap-2.5">
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-line/50 bg-surface text-faint">
        <Music2 size={18} />
      </span>
      <span class="min-w-0">
        <span class="block truncate text-[16px] font-medium text-muted">{label}</span>
        <span class="mt-0.5 block truncate text-[14px] text-faint">{hint}</span>
      </span>
    </div>
  );
}

function NowPlaying({ data }: { data: SpotifyState | null }) {
  if (!data) return <AudioPlaceholder label="Audio connecting…" hint="Waiting for Spotify" />;
  if (!data.available) return <AudioPlaceholder label="Audio offline" hint="Open Spotify to connect" />;
  if (!data.title) return <AudioPlaceholder label="Nothing playing" hint="Spotify is ready" />;

  const isAd = !data.album && !data.artUrl;
  const hasProgress = !isAd && data.duration > 0;
  const percent = hasProgress ? Math.min((data.position / data.duration) * 100, 100) : 0;

  return (
    <div class="flex min-w-0 flex-1 items-center gap-2.5">
      {data.artUrl ? (
        <img
          src={data.artUrl}
          alt=""
          class="h-9 w-9 shrink-0 rounded-[8px] object-cover"
          loading="lazy"
        />
      ) : (
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-line/50 bg-surface text-faint">
          <Music2 size={18} />
        </span>
      )}

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class={`truncate text-[16px] font-semibold leading-tight ${isAd ? 'text-warn' : 'text-text'}`}>
            {data.title}
          </span>
          {isAd && (
            <span class="shrink-0 rounded-[4px] border border-warn/40 px-1.5 py-0.5 text-[14px] font-semibold leading-none text-warn">
              Advertisement
            </span>
          )}
        </div>

        {!isAd && (
          <div class="mt-0.5 flex items-baseline gap-2.5">
            <span class="min-w-0 flex-1 truncate text-[14px] leading-tight text-faint">
              {data.artist || data.album}
            </span>
            {hasProgress && (
              <span class="shrink-0 font-mono text-[13px] tabular-nums text-faint">
                {formatDuration(data.position)} / {formatDuration(data.duration)}
              </span>
            )}
          </div>
        )}

        {hasProgress && (
          <div
            class="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-line/60"
            title={`${formatDuration(data.position)} of ${formatDuration(data.duration)}`}
            aria-hidden="true"
          >
            <div class="h-full rounded-full bg-action" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function MonitorStat({
  label,
  percent,
  detail,
}: {
  label: string;
  percent: number | null;
  detail: string;
}) {
  const color = percent === null ? 'var(--color-faint)' : thresholdColor(percent);

  return (
    <div class="flex w-[96px] shrink-0 flex-col gap-[5px]" title={detail}>
      <div class="flex items-baseline justify-between">
        <span class="text-[14px] font-semibold tracking-[0.06em] text-faint">{label}</span>
        <span class="w-[44px] text-right font-mono text-[17px] font-medium tabular-nums" style={{ color }}>
          {percent === null ? '—' : `${percent.toFixed(0)}%`}
        </span>
      </div>
      <div class="h-[3px] w-full overflow-hidden rounded-full bg-line/70">
        <div
          class="h-full rounded-full transition-all duration-300"
          style={{
            width: percent === null ? '0%' : `${Math.min(percent, 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

/**
 * A gauge-shaped column so NET shares the cluster's rhythm: muted label on the
 * top line, data on the bottom line, fixed-width fields so a byte count growing
 * from K to M never shifts anything to its right.
 */
function NetworkRates({ data }: { data: MonitorData | null }) {
  return (
    <div class="flex w-[146px] shrink-0 flex-col gap-[5px]" title="Network throughput per second">
      <span class="text-[14px] font-semibold tracking-[0.06em] text-faint">NET</span>
      <span class="flex items-center gap-2.5 font-mono text-[15px] font-medium tabular-nums">
        <span class="flex items-center gap-1 text-ok">
          <span class="text-[14px]">↓</span>
          <span class="min-w-[46px] text-right">{data ? formatRate(data.net.dl) : '—'}</span>
        </span>
        <span class="flex items-center gap-1 text-action">
          <span class="text-[14px]">↑</span>
          <span class="min-w-[46px] text-right">{data ? formatRate(data.net.ul) : '—'}</span>
        </span>
      </span>
    </div>
  );
}

function MonitorCluster({ data }: { data: MonitorData | null }) {
  const isStale = data !== null && Date.now() / 1000 - data.ts > 10;
  const ramDetail = data
    ? `${formatGigabytes(data.ram.used)} of ${formatGigabytes(data.ram.total)} used`
    : 'Waiting for telemetry';

  return (
    <div
      class={`flex h-10 shrink-0 items-center gap-3.5 transition-opacity duration-300 ${
        isStale ? 'opacity-40' : ''
      }`}
    >
      <NetworkRates data={data} />
      <span class="h-8 w-px bg-line/55" aria-hidden="true" />
      <MonitorStat label="CPU" percent={data ? data.cpu : null} detail="Processor load" />
      <MonitorStat label="RAM" percent={data ? data.ram.percent : null} detail={ramDetail} />
    </div>
  );
}

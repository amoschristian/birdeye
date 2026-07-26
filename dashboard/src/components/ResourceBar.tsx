import { h } from 'preact';
import type { MonitorData } from '../types';

interface ResourceBarProps {
  data: MonitorData | null;
}

function thresholdColor(percent: number): string {
  if (percent < 60) return '#9ece6a';
  if (percent < 85) return '#e0af68';
  return '#f7768e';
}

function MiniBar({ percent }: { percent: number }) {
  const color = thresholdColor(percent);
  return (
    <div class="w-12 h-2.5 bg-[#33467c] rounded-full overflow-hidden inline-block align-middle">
      <div
        class="h-full rounded-full"
        style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function ResourceBar({ data }: ResourceBarProps) {
  if (!data) {
    return (
      <div class="flex items-center gap-3 text-sm text-[#565f89] w-[210px] justify-end">
        <span>CPU —</span>
        <span>RAM —</span>
      </div>
    );
  }

  const isStale = (Date.now() / 1000 - data.ts) > 10;
  const opacity = isStale ? 'opacity-40' : '';

  return (
    <div class={`flex items-center gap-3 text-sm font-medium tabular-nums w-[210px] justify-end ${opacity}`}>
      {/* CPU */}
      <span class="flex items-center gap-2">
        <span class="text-[#565f89]">CPU</span>
        <MiniBar percent={data.cpu} />
        <span class="w-10 text-right" style={{ color: thresholdColor(data.cpu) }}>{data.cpu.toFixed(1)}%</span>
      </span>

      <span class="w-px h-4 bg-[#33467c]" />

      {/* RAM */}
      <span class="flex items-center gap-2">
        <span class="text-[#565f89]">RAM</span>
        <MiniBar percent={data.ram.percent} />
        <span class="w-10 text-right" style={{ color: thresholdColor(data.ram.percent) }}>{data.ram.percent.toFixed(1)}%</span>
      </span>
    </div>
  );
}

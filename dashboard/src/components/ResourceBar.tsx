import { h } from 'preact';
import type { MonitorData } from '../types';

interface ResourceBarProps {
  data: MonitorData | null;
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

export function ResourceBar({ data }: ResourceBarProps) {
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
      <span class="flex items-center gap-2">
        <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#8a9ba8]">CPU</span>
        <GaugeBar percent={data.cpu} />
        <span class="font-mono text-[14px] font-medium tabular-nums w-14 text-right" style={{ color: thresholdColor(data.cpu) }}>{data.cpu.toFixed(1)}%</span>
      </span>

      <span class="w-px h-4 bg-[#252d38]" />

      <span class="flex items-center gap-2">
        <span class="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#8a9ba8]">RAM</span>
        <GaugeBar percent={data.ram.percent} />
        <span class="font-mono text-[14px] font-medium tabular-nums w-14 text-right" style={{ color: thresholdColor(data.ram.percent) }}>{data.ram.percent.toFixed(1)}%</span>
      </span>
    </div>
  );
}

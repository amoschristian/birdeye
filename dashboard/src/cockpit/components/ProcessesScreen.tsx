import type { ProcessInfo } from '../../types';
import { formatBytes, pageSlice, type ProcessSort } from '../helpers';
import { Pager } from './Pager';

interface Props {
  processes: ProcessInfo[];
  sort: ProcessSort;
  onSort: (sort: ProcessSort) => void;
  page: number;
  onPage: (page: number) => void;
  armedPid: number | null;
  killedPids: Set<number>;
  onKill: (pid: number) => void;
}

export function ProcessesScreen({
  processes,
  sort,
  onSort,
  page,
  onPage,
  armedPid,
  killedPids,
  onKill,
}: Props) {
  const sorted = [...processes].sort((a, b) => b[sort] - a[sort]);
  const slice = pageSlice(sorted, page);
  const max = sorted.length ? Math.max(1, sorted[0][sort]) : 1;

  return (
    <section class="screen" aria-label="Processes">
      <header class="screen__head">
        <span class="screen__title">Processes</span>
        <span class="screen__sub">
          Top by {sort === 'cpu' ? 'CPU' : 'memory'}
        </span>

        <span class="spacer" />

        <div class="seg" role="group" aria-label="Sort processes">
          <button
            type="button"
            class={'seg__opt ' + (sort === 'cpu' ? 'is-active' : '')}
            onClick={() => onSort('cpu')}
          >
            CPU
          </button>
          <button
            type="button"
            class={'seg__opt ' + (sort === 'mem' ? 'is-active' : '')}
            onClick={() => onSort('mem')}
          >
            Memory
          </button>
        </div>

        <Pager page={slice.page} pages={slice.pages} onChange={onPage} />
      </header>

      <div class="rows">
        {slice.items.length === 0 ? (
          <div class="empty">Waiting for system data</div>
        ) : (
          slice.items.map((process) => {
            const lit = Math.max(0, Math.min(20, Math.round((process[sort] / max) * 20)));
            const value = sort === 'cpu' ? process.cpu.toFixed(1) + '%' : formatBytes(process.mem);
            const meta =
              sort === 'cpu'
                ? `PID ${process.pid} · ${formatBytes(process.mem)}`
                : `PID ${process.pid} · ${process.cpu.toFixed(1)}% CPU`;
            const killed = killedPids.has(process.pid);
            const armed = armedPid === process.pid && !killed;

            return (
              <div class={'proc' + (killed ? ' is-killed' : '')} key={process.pid}>
                <div class="proc__main">
                  <span class="proc__id">
                    <span class="proc__name">{process.name}</span>
                    <span class="proc__meta">{meta}</span>
                  </span>
                  <span class="ladder" aria-hidden="true">
                    {Array.from({ length: 20 }, (_, index) => (
                      <i key={index} class={index < lit ? 'is-on' : ''} />
                    ))}
                  </span>
                  <span class="proc__value">{value}</span>
                </div>

                <button
                  type="button"
                  class={
                    'proc__kill' +
                    (killed ? ' is-killed' : '') +
                    (armed ? ' is-armed' : '')
                  }
                  disabled={killed}
                  aria-label={`Kill ${process.name}`}
                  onClick={() => onKill(process.pid)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                    <line x1="12" y1="2" x2="12" y2="12" />
                  </svg>
                  <span>{killed ? 'Killed' : armed ? 'Sure?' : 'Kill'}</span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

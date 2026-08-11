// CorgiBar — a pixel corgi patrolling above the audio/comms bar.
//
// The corgi is a standard Codex pet atlas: 1536×1872, 8 cols × 9 rows,
// 192×208 cells. It patrols left/right across the full width, bouncing off
// the edges, and takes random breaks: idle blinking, waiting, reviewing,
// waving at the viewer, and excited jumps.
// Static idle frame under prefers-reduced-motion. No dependencies — just a
// background-image sprite sheet driven by a requestAnimationFrame loop.
//
// Rendered as an absolute overlay (no layout space reserved): the corgi
// patrols the bottom edge of the content, just above the 56px bottom bar.
// pointer-events-none so it never blocks touches.
//
// NOTE: this sheet's rows are swapped vs the Codex convention — the
// "runRight" row faces LEFT and the "runLeft" row faces RIGHT (verified
// by eye/nose pixel centroid). Rows are used accordingly below.
import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

const ATLAS = '/corgi/spritesheet.webp';
const ATLAS_W = 1536;
const ATLAS_H = 1872;
const CELL_W = 192;
const CELL_H = 208;
const SCALE = 0.3;
const SPRITE_W = Math.round(CELL_W * SCALE); // 58
const SPRITE_H = Math.round(CELL_H * SCALE); // 62
const STRIP_H = SPRITE_H + 4;
const BOTTOM_BAR_H = 56;

const ROW = {
  idle: 0,
  runRight: 1, // actually faces left on this sheet
  runLeft: 2,  // actually faces right on this sheet
  wave: 3,
  jump: 4,
  wait: 6,
  review: 8,
} as const;
const FRAME_COUNT = {
  idle: 6,
  runRight: 8,
  runLeft: 8,
  wave: 4,
  jump: 5,
  wait: 6,
  review: 6,
} as const;

const WALK_FPS = 10; // sprite frames per second while walking
const EDGE_MARGIN = 8; // px from each edge before turning around
const WALK_SPEED = 40; // px per second — a leisurely patrol
const WALK_TIME_MIN = 6000; // ms of walking before a break
const WALK_TIME_MAX = 15000;

type BreakMode = 'idle' | 'wait' | 'review' | 'wave' | 'jump';
type Mode = 'walk' | BreakMode;

// Break types and their animation fps + duration ranges (ms).
const BREAK_FPS: Record<BreakMode, number> = {
  idle: 10,
  wait: 8,
  review: 8,
  wave: 8,
  jump: 10,
};
const BREAK_TIME: Record<BreakMode, [number, number]> = {
  idle: [2500, 4000],
  wait: [2500, 4000],
  review: [2500, 4000],
  wave: [1500, 2500],
  jump: [1500, 2500],
};
const BREAK_WEIGHTS: Array<[BreakMode, number]> = [
  ['idle', 30],
  ['jump', 20],
  ['wave', 15],
  ['wait', 15],
  ['review', 12],
];

interface State {
  mode: Mode;
  dir: 1 | -1;
  x: number;
  frame: number;
  frameAcc: number;
  modeUntil: number;
  width: number;
  greeted: boolean;
}

function randomDuration(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickBreak(): BreakMode {
  const total = BREAK_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [mode, w] of BREAK_WEIGHTS) {
    roll -= w;
    if (roll <= 0) return mode;
  }
  return 'idle';
}

export function CorgiBar() {
  const stripRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Preload the sprite sheet once; reveal the corgi when ready.
  useEffect(() => {
    const img = new Image();
    img.onload = () => setLoaded(true);
    img.src = ATLAS;
  }, []);

  useEffect(() => {
    const strip = stripRef.current!;
    const inner = innerRef.current!;
    const sprite = spriteRef.current!;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state: State = {
      mode: reduced ? 'idle' : 'walk',
      dir: 1,
      x: EDGE_MARGIN,
      frame: 0,
      frameAcc: 0,
      modeUntil: performance.now() + 2000, // short first walk, then a greeting break
      width: strip.clientWidth,
      greeted: false,
    };

    const advanceFrame = (dt: number, count: number, fps: number) => {
      state.frameAcc += dt;
      const step = 1 / fps;
      while (state.frameAcc >= step) {
        state.frameAcc -= step;
        state.frame = (state.frame + 1) % count;
      }
    };

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      if (!reduced) {
        if (state.mode === 'walk') {
          state.x += state.dir * WALK_SPEED * dt;
          const maxX = state.width - SPRITE_W - EDGE_MARGIN;
          if (state.x <= EDGE_MARGIN) {
            state.x = EDGE_MARGIN;
            state.dir = 1;
          } else if (state.x >= maxX) {
            state.x = maxX;
            state.dir = -1;
          }
          if (now >= state.modeUntil) {
            // First break after boot is always a wave — a greeting.
            state.mode = state.greeted ? pickBreak() : 'wave';
            state.greeted = true;
            state.modeUntil = now + randomDuration(...BREAK_TIME[state.mode]);
          }
        } else if (now >= state.modeUntil) {
          state.mode = 'walk';
          state.modeUntil = now + randomDuration(WALK_TIME_MIN, WALK_TIME_MAX);
        }
      }

      const row =
        state.mode === 'walk'
          ? state.dir === 1
            ? ROW.runLeft // faces right
            : ROW.runRight // faces left
          : ROW[state.mode];
      const count =
        state.mode === 'walk' ? FRAME_COUNT.runRight : FRAME_COUNT[state.mode];
      const fps =
        state.mode === 'walk' ? WALK_FPS : BREAK_FPS[state.mode];

      if (!reduced) advanceFrame(dt, count, fps);

      inner.style.transform = `translate3d(${state.x}px, 0, 0)`;
      sprite.style.backgroundPosition = `${-(state.frame * CELL_W * SCALE)}px ${-(row * CELL_H * SCALE)}px`;

      raf = requestAnimationFrame(tick);
    };

    const onResize = () => {
      state.width = strip.clientWidth;
    };
    window.addEventListener('resize', onResize);

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div
      ref={stripRef}
      class="absolute left-0 right-0 z-10 pointer-events-none"
      style={{ bottom: BOTTOM_BAR_H, height: STRIP_H }}
      aria-hidden="true"
    >
      <div ref={innerRef} class="absolute bottom-0 left-0 will-change-transform">
        <div
          ref={spriteRef}
          style={{
            width: SPRITE_W,
            height: SPRITE_H,
            backgroundImage: `url(${ATLAS})`,
            backgroundSize: `${ATLAS_W * SCALE}px ${ATLAS_H * SCALE}px`,
            imageRendering: 'pixelated',
            opacity: loaded ? 1 : 0,
          }}
        />
      </div>
    </div>
  );
}

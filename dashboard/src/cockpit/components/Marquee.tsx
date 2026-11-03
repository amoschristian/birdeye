import { useEffect, useRef } from 'preact/hooks';

interface Props {
  /** Already joined artist/title text — empty when nothing is playing. */
  text: string;
}

const PIXELS_PER_SECOND = 18;

/**
 * Ping-pong ticker: the track label is longer than the dock button, so the
 * text drifts to its end and back. Nothing animates when it fits, and the
 * shift distance comes from a real measurement rather than a guessed width.
 */
export function Marquee({ text }: Props) {
  const frameRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    const inner = innerRef.current;
    if (!frame || !inner) return;

    const measure = () => {
      const overflow = inner.scrollWidth - frame.clientWidth;

      if (overflow <= 0) {
        inner.classList.remove('is-scrolling');
        inner.style.removeProperty('--marquee-shift');
        return;
      }

      inner.style.setProperty('--marquee-shift', `-${overflow}px`);
      inner.style.setProperty(
        'animation-duration',
        `${Math.max(3, overflow / PIXELS_PER_SECOND)}s`
      );
      inner.classList.add('is-scrolling');
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [text]);

  return (
    <span class="marquee" ref={frameRef}>
      <span class="marquee__inner" ref={innerRef}>
        {text}
      </span>
    </span>
  );
}

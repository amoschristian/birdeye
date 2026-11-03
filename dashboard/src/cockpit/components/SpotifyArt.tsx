import { useEffect, useState } from 'preact/hooks';

interface Props {
  url: string;
  size: 'thumb' | 'large';
}

/**
 * Spotify hands us MPRIS art URLs, which are often unreadable from the browser.
 * Any failure (or a missing URL) falls back to a music glyph so the button and
 * the panel keep their layout.
 */
export function SpotifyArt({ url, size }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  const frame = 'art art--' + size;

  if (!url || failed) {
    return (
      <span class={frame + ' art--blank'} aria-hidden="true">
        <svg
          width={size === 'large' ? 56 : 18}
          height={size === 'large' ? 56 : 18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </span>
    );
  }

  return <img class={frame} src={url} alt="" onError={() => setFailed(true)} />;
}

import { useState } from 'preact/hooks';

const SOUNDS: Record<string, string> = {
  default: '/sounds/default.mp3',
  kalert: '/sounds/kalert.mp3',
};

const MUTED_STORAGE_KEY = 'birdeye:notification-sounds-muted';
let _audioUnlocked = false;
let _muted = false;

function readMutedPreference(): boolean {
  try {
    return window.localStorage.getItem(MUTED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined') {
  _muted = readMutedPreference();
}

export function useSound() {
  const [muted, setMuted] = useState(_muted);

  const setMutedPreference = (value: boolean) => {
    _muted = value;
    setMuted(value);
    try {
      window.localStorage.setItem(MUTED_STORAGE_KEY, String(value));
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  };

  const toggleMuted = () => {
    setMutedPreference(!_muted);
  };

  const play = (soundKey: string) => {
    if (_muted) return;

    const path = SOUNDS[soundKey] || SOUNDS.default;
    const audio = new Audio(path);
    audio.volume = 0.3;
    audio.play().catch(() => {
      if (!_audioUnlocked) {
        console.warn('Birdeye: audio autoplay blocked — tap the dashboard to unlock sounds');
        const unlock = () => {
          _audioUnlocked = true;
          if (!_muted) audio.play().catch(() => {});
          document.removeEventListener('pointerdown', unlock);
        };
        document.addEventListener('pointerdown', unlock, { once: true });
      }
    });
  };

  return { play, muted, toggleMuted };
}

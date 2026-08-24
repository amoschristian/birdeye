import { useCallback, useState } from 'preact/hooks';

const SOUNDS: Record<string, string> = {
  default: '/sounds/default.mp3',
  kalert: '/sounds/kalert.mp3',
};

const MUTED_STORAGE_KEY = 'birdeye:notification-sounds-muted';
let _audioUnlocked = false;
let _manualMuted = false;
let _eventMuted = false;

function readMutedPreference(): boolean {
  try {
    return window.localStorage.getItem(MUTED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined') {
  _manualMuted = readMutedPreference();
}

export function useSound() {
  const [manualMuted, setManualMutedState] = useState(_manualMuted);
  const [eventMuted, setEventMutedState] = useState(_eventMuted);

  const setManualMuted = useCallback((value: boolean) => {
    _manualMuted = value;
    setManualMutedState(value);
    try {
      window.localStorage.setItem(MUTED_STORAGE_KEY, String(value));
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  }, []);

  const setEventMuted = useCallback((value: boolean) => {
    _eventMuted = value;
    setEventMutedState(value);
  }, []);

  const toggleMuted = useCallback(() => {
    // A manual tap can override an event-scoped mute. The manual preference
    // remains persisted after the event ends.
    if (_eventMuted) {
      setEventMuted(false);
      setManualMuted(false);
      return;
    }
    setManualMuted(!_manualMuted);
  }, [setEventMuted, setManualMuted]);

  const play = useCallback((soundKey: string) => {
    if (_manualMuted || _eventMuted) return;

    const path = SOUNDS[soundKey] || SOUNDS.default;
    const audio = new Audio(path);
    audio.volume = 0.3;
    audio.play().catch(() => {
      if (!_audioUnlocked) {
        console.warn('Birdeye: audio autoplay blocked — tap the dashboard to unlock sounds');
        const unlock = () => {
          _audioUnlocked = true;
          if (!_manualMuted && !_eventMuted) audio.play().catch(() => {});
          document.removeEventListener('pointerdown', unlock);
        };
        document.addEventListener('pointerdown', unlock, { once: true });
      }
    });
  }, []);

  return {
    play,
    muted: manualMuted || eventMuted,
    manualMuted,
    eventMuted,
    toggleMuted,
    setEventMuted,
  };
}

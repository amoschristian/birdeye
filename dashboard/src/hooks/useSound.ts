import { useCallback, useEffect, useState } from 'preact/hooks';

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

  // Keep mute in sync across dashboard tabs (panel + desktop/phone).
  // localStorage writes fire `storage` events in every *other* tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MUTED_STORAGE_KEY) return;
      _manualMuted = e.newValue === 'true';
      setManualMutedState(_manualMuted);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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
    // The button is a straightforward global mute/unmute: if any mute is on
    // (manual or calendar-event-scoped) turn it all off, otherwise mute.
    if (_manualMuted || _eventMuted) {
      setEventMuted(false);
      setManualMuted(false);
    } else {
      setManualMuted(true);
    }
  }, [setEventMuted, setManualMuted]);

  const play = useCallback((soundKey: string) => {
    if (_manualMuted || _eventMuted) return;

    const path = SOUNDS[soundKey] || SOUNDS.default;
    const audio = new Audio(path);
    audio.volume = 0.3;
    audio.play()
      .then(() => {
        _audioUnlocked = true;
      })
      .catch(() => {
        // Autoplay blocked (no user gesture yet). Unlock on the next tap so
        // later notifications can play — but never replay this sound: that
        // tap might be the MUTE button (pointerdown fires before click).
        if (!_audioUnlocked) {
          console.warn('Birdeye: audio autoplay blocked — tap the dashboard to unlock sounds');
          const unlock = () => {
            _audioUnlocked = true;
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
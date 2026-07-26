const SOUNDS: Record<string, string> = {
  default: '/sounds/default.mp3',
  kalert: '/sounds/kalert.mp3',
};

let _audioUnlocked = false;

export function useSound() {
  const play = (soundKey: string) => {
    const path = SOUNDS[soundKey] || SOUNDS.default;
    const audio = new Audio(path);
    audio.volume = 0.3;
    audio.play().catch(() => {
      if (!_audioUnlocked) {
        console.warn('Birdeye: audio autoplay blocked — tap the dashboard to unlock sounds');
        const unlock = () => {
          _audioUnlocked = true;
          audio.play().catch(() => {});
          document.removeEventListener('pointerdown', unlock);
        };
        document.addEventListener('pointerdown', unlock, { once: true });
      }
    });
  };

  return { play };
}

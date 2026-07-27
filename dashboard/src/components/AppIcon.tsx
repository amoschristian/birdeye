import { h } from 'preact';

const iconMap: Record<string, string> = {
  'discord-work': '/icons/discord.png',
  'discord-personal': '/icons/discord.png',
  'google-chat': '/icons/google-chat.png',
  'telegram-desktop': '/icons/telegram.png',
  'whatsapp': '/icons/whatsapp.png',
};

interface Props {
  appId: string;
  class?: string;
  emoji?: string;
}

export function AppIcon({ appId, class: className, emoji }: Props) {
  const src = iconMap[appId];
  if (src) {
    return (
      <img
        src={src}
        alt=""
        class={`object-contain ${className || 'w-6 h-6'}`}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }

  // Fallback: emoji from app config, or generic dot
  if (emoji) {
    return <span class={`flex items-center justify-center text-xl ${className || 'w-6 h-6'}`}>{emoji}</span>;
  }

  return (
    <span class={`flex items-center justify-center ${className || 'w-6 h-6'}`}>
      <svg viewBox="0 0 24 24" fill="currentColor" class="w-full h-full">
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
      </svg>
    </span>
  );
}

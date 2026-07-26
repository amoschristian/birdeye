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
}

export function AppIcon({ appId, class: className }: Props) {
  const src = iconMap[appId];
  if (src) {
    return (
      <img
        src={src}
        alt=""
        class={`w-8 h-8 object-contain ${className || ''}`}
        onError={(e) => {
          // Hide broken image on load failure
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }

  // Fallback: generic bell icon for unknown apps
  return (
    <span class={className || ''}>
      <svg viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8">
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
      </svg>
    </span>
  );
}

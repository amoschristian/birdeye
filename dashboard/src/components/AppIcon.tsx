import { h } from 'preact';
import { useState } from 'preact/hooks';
import { appBrandColor } from '../utils/appVisuals';

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
  name?: string;
}

export function AppIcon({ appId, class: className, emoji, name }: Props) {
  const [failed, setFailed] = useState(false);
  const src = iconMap[appId];
  const sizeClass = className || 'w-6 h-6';

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        loading="lazy"
        class={`object-contain ${sizeClass}`}
        onError={() => setFailed(true)}
      />
    );
  }

  if (emoji) {
    return (
      <span class={`flex items-center justify-center text-[18px] leading-none ${sizeClass}`} aria-hidden="true">
        {emoji}
      </span>
    );
  }

  return (
    <span
      class={`flex items-center justify-center text-[15px] font-semibold leading-none ${sizeClass}`}
      style={{ color: appBrandColor(appId) }}
      aria-hidden="true"
    >
      {name ? name.trim().charAt(0).toUpperCase() : '•'}
    </span>
  );
}

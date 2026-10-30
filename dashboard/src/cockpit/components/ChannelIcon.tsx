import type { AppConfig } from '../../types';

const ICONS: Record<string, string> = {
  'discord-work': '/icons/discord.png',
  'discord-personal': '/icons/discord.png',
  'google-chat': '/icons/google-chat.png',
  whatsapp: '/icons/whatsapp.png',
};

export function ChannelIcon({ app }: { app?: AppConfig }) {
  const source = app ? ICONS[app.id] : undefined;
  if (source) return <img class="row__icon-img" src={source} alt="" />;
  return <span class="row__icon-emoji">{app?.icon ?? '•'}</span>;
}

const APP_BRAND_COLORS: Record<string, string> = {
  "discord-work": "#7c83ff",
  "discord-personal": "#7c83ff",
  "google-chat": "#4fc3a1",
  "telegram-desktop": "#57b8e8",
  whatsapp: "#63d69b",
  calendar: "#ffb65c",
};

const FALLBACK_BRANDS = ["#8f86ff", "#ffb65c", "#7be3a6", "#ffa26b", "#ff7186", "#57b8e8"];

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function appBrandColor(appId: string): string {
  return APP_BRAND_COLORS[appId] ?? FALLBACK_BRANDS[hashString(appId) % FALLBACK_BRANDS.length];
}

/**
 * The rail shows the conversation platform, while the group heading
 * ("Work", "Personal") carries the account distinction. "Discord Work"
 * becomes "Discord" under Work.
 */
export function appRailLabel(name: string): string {
  return name.replace(/\s+(Work|Personal)$/i, "");
}

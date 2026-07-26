/**
 * Parse Discord notification summary to extract a grouping key.
 *
 * Discord formats:
 *   DMs:           "Theo"
 *   Channels:      "⁨Fahrur⁩ (⁨#rr-incoming⁩, ⁨Task Forces⁩)"
 *   Channels alt:  "⁨hery.sehastian⁩ (⁨hiding-leads⁩)"
 *
 * Returns:
 *   - For channel messages: the room name (without # prefix)
 *   - For DMs: the sender name
 */

// U+2068 FIRST STRONG ISOLATE / U+2069 POP DIRECTIONAL ISOLATE
const ISO = '\u2068';
const PDI = '\u2069';

export interface GroupInfo {
  key: string;      // unique group key (room name or sender, lowercased)
  label: string;    // display label
  sender?: string;  // extracted sender, if available
}

export function parseGroupKey(appId: string, summary: string): GroupInfo {
  // Try to match the channel pattern: ⁨Sender⁩ (⁨#channel⁩, ⁨Server⁩)
  // or simpler: ⁨Sender⁩ (⁨channel⁩)
  const channelMatch = summary.match(
    new RegExp(`${ISO}(.+?)${PDI}\\s*\\(\\s*${ISO}#?(.+?)${PDI}`)
  );
  if (channelMatch) {
    const sender = channelMatch[1];
    const room = channelMatch[2];
    return {
      key: `${appId}:room:${room.toLowerCase()}`,
      label: room,
      sender,
    };
  }

  // DM — use the raw summary as sender
  const sender = summary.replace(new RegExp(`[${ISO}${PDI}]`, 'g'), '').trim();
  return {
    key: `${appId}:dm:${sender.toLowerCase()}`,
    label: sender,
    sender,
  };
}

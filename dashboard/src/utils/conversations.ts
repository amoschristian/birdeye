import type { Notification } from '../types';
import { parseGroupKey } from './groupKey';

/**
 * Chromium puts the notification's origin on the first line of the body
 * ("discord.com\n\nAlice: hi"). The server uses that line to attribute the
 * notification and then stores the body verbatim, so it has to come off before
 * the text is shown — otherwise every row repeats the site name.
 */
const ORIGIN_LINE = /^(?:[a-z0-9-]+\.)+[a-z]{2,6}$/;

export function stripOriginLine(body: string): string {
  const lines = body.split('\n');
  if (lines.length < 2) return body.trim();
  if (!ORIGIN_LINE.test(lines[0].trim())) return body.trim();
  return lines.slice(1).join('\n').trim();
}

/**
 * `summary` carries the notification title — for a room message that is
 * "Sender (#channel, Server)", for a DM it is the sender. The message itself
 * lives in `body`, so that is what a row leads with.
 */
export function messageText(notification: Notification): string {
  const body = stripOriginLine(notification.body || '');
  return body || notification.summary;
}

/** The person who sent it, when the summary names one. */
export function notificationSender(notification: Notification): string {
  return parseGroupKey(notification.app_id, notification.summary).sender || '';
}

/** The room, or the person for a DM. */
export function notificationLabel(notification: Notification): string {
  return parseGroupKey(notification.app_id, notification.summary).label;
}

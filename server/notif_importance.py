"""
Notification importance classification — server-side.

Determines whether a notification is "important" based on content:
- Direct messages (DMs) → always important
- Mentions of the user (@amos, @all, @core-dev, etc.) → always important

Important notifications always float to the top of the Focus mode card,
regardless of when they arrived.
"""

import re
import logging

logger = logging.getLogger(__name__)

# ── User identifiers ──────────────────────────────────────────────
# The user's known handles, with and without @ prefix
USER_HANDLES = ["amos", "amos.christian", "amos.christian.harahap"]
USER_MENTION_WORDS = [f"@{h}" for h in USER_HANDLES] + USER_HANDLES

# Group/role mentions that involve the user
GROUP_MENTIONS = [
    "@all", "@everyone",
    "@core-dev", "@core-dev",
    "@team-hera", "@team-hera",
    "@hera",
]

# ── Compiled patterns ─────────────────────────────────────────────

# For each handle: match any of the forms "amos", "@amos", "amos.christian", "@amos.christian"
# Use word-boundary-aware matching to avoid partial matches (e.g. "amosa")
_HANDLE_PATTERNS = []
for handle in USER_HANDLES:
    _HANDLE_PATTERNS.append(
        re.compile(rf'(?<![@\w.])@?{re.escape(handle)}(?![@\w.\-])', re.IGNORECASE)
    )

# For group mentions: match "@all", "@core-dev" etc. as whole words
_GROUP_PATTERNS = []
for mention in GROUP_MENTIONS:
    _GROUP_PATTERNS.append(
        re.compile(rf'(?<!\w){re.escape(mention)}(?!\w)', re.IGNORECASE)
    )

# Combine everything into one fast pattern for early-out
_ALL_MENTION_PATTERN = re.compile(
    "|".join(
        rf'(?<![@\w.])@?{re.escape(h)}(?![@\w.\-])' for h in USER_HANDLES
    ) + "|" +
    "|".join(
        rf'(?<!\w){re.escape(m)}(?!\w)' for m in GROUP_MENTIONS
    ),
    re.IGNORECASE,
)


def has_direct_mention(summary: str, body: str) -> bool:
    """Check if the notification content contains a direct mention of the user."""
    combined = f"{summary} {body}"
    return bool(_ALL_MENTION_PATTERN.search(combined))


def is_dm_notification(app_id: str, summary: str) -> bool:
    """
    Determine if a notification is a direct message (not a group/channel message).

    Detection depends on the app's notification formatting:

    **Discord (browser + native)**:
      DM summary:   "⁨Sender⁩"                          (just a name, no parens)
      Channel msg:  "⁨Sender⁩ (⁨#channel⁩, ⁨Server⁩)"  (has parens with room)
      or simpler:   "⁨Sender⁩ (⁨#channel⁩)"

    **Telegram Desktop**:
      DMs come through D-Bus with just the sender name as summary.
      Group messages include the group name.

    **Google Chat**:
      DM summary:   "Sender"  or "Sender: message"
      Room msg:     "RoomName" with body containing "Sender: message"

    **WhatsApp**:
      Almost everything is a DM or small group. Hard to distinguish
      from notification content alone — will rely on mention detection.
    """
    if app_id in ("discord-work", "discord-personal"):
        # Discord format check:
        # DM = just the sender name without parentheses
        # Channel = has (#channel) or (#channel, Server) in the summary
        if "(" in summary or ")" in summary or "#" in summary:
            return False
        return True

    if app_id == "google-chat":
        # Google Chat DMs typically have no room prefix in the summary.
        # If summary is short and contains no "#" or room indicators, it's likely a DM.
        if "#" in summary or summary.startswith("["):
            return False
        return True

    # For other apps (WhatsApp, Telegram), content-based detection is more reliable.
    # These are also less structured, so we lean on mention detection instead.
    return False


def classify_importance(
    app_id: str,
    app_name: str,
    summary: str,
    body: str,
) -> bool:
    """
    Determine whether a notification is important.

    A notification is important if:
    1. It's a direct message (DM) → ALWAYS important
    2. It contains a direct mention of the user or a group they're in

    Returns True if the notification should be pinned to the top of Focus mode.
    """
    if not summary and not body:
        return False

    # Check DM first — explicit DMs are always important
    if is_dm_notification(app_id, summary):
        logger.debug(f"Important (DM): app={app_id} summary=\"{summary[:50]}\"")
        return True

    # Check for direct mentions in summary or body
    if has_direct_mention(summary, body):
        logger.debug(f"Important (mention): app={app_id} summary=\"{summary[:50]}\"")
        return True

    return False

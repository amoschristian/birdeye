"""
Spotify state store.

Receives playback state from the Chrome extension (which reads it from the
Spotify web player via a content script). Provides snapshots to the dashboard
and accepts control commands that are forwarded to the extension.
"""

import logging
import time

logger = logging.getLogger(__name__)

_EMPTY_STATE = {
    "type": "spotify",
    "available": False,
    "playing": False,
    "title": "",
    "artist": "",
    "album": "",
    "artUrl": "",
    "duration": 0,
    "position": 0,
}


class SpotifyStateStore:
    """Store the latest Spotify playback state with position extrapolation."""

    def __init__(self):
        self._state: dict = dict(_EMPTY_STATE)
        self._last_update_ts: float = 0.0

    def get_state(self) -> dict:
        """Return the latest Spotify state, adjusting position for elapsed time."""
        state = dict(self._state)
        if state["playing"] and state["duration"] > 0 and self._last_update_ts > 0:
            elapsed = int((time.monotonic() - self._last_update_ts) * 1000)
            state["position"] = min(
                state["position"] + elapsed,
                state["duration"],
            )
        return state

    def update_state(self, data: dict):
        """Update state from extension data."""
        self._state = {
            "type": "spotify",
            "available": data.get("available", False),
            "playing": data.get("playing", False),
            "title": data.get("title", ""),
            "artist": data.get("artist", ""),
            "album": data.get("album", ""),
            "artUrl": data.get("artUrl", ""),
            "duration": data.get("duration", 0),
            "position": data.get("position", 0),
        }
        self._last_update_ts = time.monotonic()

    def check_stale(self, timeout_seconds: float = 10.0):
        """If we haven't received an update in timeout_seconds, mark unavailable."""
        if self._last_update_ts > 0 and (time.monotonic() - self._last_update_ts) > timeout_seconds:
            self.set_unavailable()

    def set_unavailable(self):
        """Mark Spotify as unavailable (e.g. when web player tab closes)."""
        self._state = dict(_EMPTY_STATE)
        self._last_update_ts = 0.0


# Module-level singleton
spotify_listener = SpotifyStateStore()

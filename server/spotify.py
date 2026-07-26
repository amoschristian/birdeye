"""
Spotify MPRIS D-Bus listener.

Listens to org.mpris.MediaPlayer2.spotify for playback state and metadata.
Uses a background thread with GLib main loop for D-Bus signal dispatch.
Provides the latest state snapshot, and accepts control commands (play/pause,
next, previous) from the dashboard.
"""

import asyncio
import logging
import threading
import time
from typing import Optional

import dbus
import dbus.mainloop.glib
from gi.repository import GLib

logger = logging.getLogger(__name__)

SPOTIFY_SERVICE = "org.mpris.MediaPlayer2.spotify"
SPOTIFY_PATH = "/org/mpris/MediaPlayer2"
SPOTIFY_IFACE = "org.mpris.MediaPlayer2.Player"
PROPERTIES_IFACE = "org.freedesktop.DBus.Properties"

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


def _micros_to_seconds(micros: int) -> int:
    """Convert microseconds to milliseconds (for WS payload)."""
    return micros // 1000 if micros else 0


class SpotifyListener:
    """Listen to Spotify MPRIS signals and provide state snapshots.

    D-Bus signals are processed in a background thread running a GLib main
    loop. The async side receives updates via an asyncio.Event.
    """

    def __init__(self):
        self._state: dict = dict(_EMPTY_STATE)
        self._update_event = asyncio.Event()
        self._running = False
        self._async_task: Optional[asyncio.Task] = None
        self._glib_thread: Optional[threading.Thread] = None
        self._glib_loop: Optional[GLib.MainLoop] = None
        self._bus: Optional[dbus.Bus] = None
        self._available = False
        self._lock = threading.Lock()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def get_state(self) -> dict:
        """Return the latest Spotify state dict."""
        with self._lock:
            return dict(self._state)

    async def wait_for_update(self) -> bool:
        """Wait for the next state update. Returns True if an update arrived."""
        self._update_event.clear()
        try:
            await asyncio.wait_for(self._update_event.wait(), timeout=5)
            return True
        except asyncio.TimeoutError:
            return False

    async def start(self):
        """Initialize D-Bus connection and start signal listener thread."""
        if self._running:
            return
        self._running = True
        self._loop = asyncio.get_event_loop()

        # Install GLib main loop as default for D-Bus
        dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)

        try:
            self._bus = dbus.SessionBus()
        except Exception as e:
            logger.warning(f"Cannot connect to D-Bus session bus: {e}")
            self._set_state_unavailable()
            return

        # Start GLib main loop in background thread
        self._glib_loop = GLib.MainLoop()
        self._glib_thread = threading.Thread(
            target=self._glib_loop.run,
            name="spotify-dbus",
            daemon=True,
        )
        self._glib_thread.start()

        # Subscribe to signals on the main thread (GLib main loop runs in thread)
        try:
            obj = self._bus.get_object(SPOTIFY_SERVICE, SPOTIFY_PATH)
            iface = dbus.Interface(obj, PROPERTIES_IFACE)
            iface.connect_to_signal(
                "PropertiesChanged",
                self._on_properties_changed,
                dbus_interface=PROPERTIES_IFACE,
            )
            self._available = True
            logger.info("Spotify MPRIS listener active")
            self._fetch_state()
        except dbus.exceptions.DBusException:
            logger.info("Spotify not running (no MPRIS endpoint)")
            self._set_state_unavailable()

        # Watch for Spotify appearing/disappearing
        try:
            dbus_iface = dbus.Interface(
                self._bus.get_object(
                    "org.freedesktop.DBus",
                    "/org/freedesktop/DBus",
                ),
                "org.freedesktop.DBus",
            )
            dbus_iface.connect_to_signal(
                "NameOwnerChanged",
                self._on_name_owner_changed,
                arg0=SPOTIFY_SERVICE,
            )
        except Exception as e:
            logger.warning(f"Cannot subscribe to NameOwnerChanged: {e}")

        # Start the async position polling task
        self._async_task = asyncio.create_task(self._position_poll_loop())

    async def stop(self):
        """Stop the listener and clean up."""
        self._running = False
        if self._async_task:
            self._async_task.cancel()
            try:
                await self._async_task
            except asyncio.CancelledError:
                pass
            self._async_task = None

        if self._glib_loop:
            self._glib_loop.quit()
            self._glib_loop = None
        if self._glib_thread and self._glib_thread.is_alive():
            self._glib_thread.join(timeout=3)
            self._glib_thread = None

        self._bus = None
        logger.info("Spotify listener stopped")

    def send_command(self, command: str):
        """Send a control command to Spotify via MPRIS."""
        if not self._available:
            return
        try:
            obj = self._bus.get_object(SPOTIFY_SERVICE, SPOTIFY_PATH)
            iface = dbus.Interface(obj, SPOTIFY_IFACE)
            if command == "play_pause":
                iface.PlayPause()
            elif command == "next":
                iface.Next()
            elif command == "previous":
                iface.Previous()
        except Exception as e:
            logger.warning(f"Spotify command '{command}' failed: {e}")

    # ── Internal methods ──────────────────────────────────────────

    def _set_state_unavailable(self):
        with self._lock:
            self._available = False
            self._state = dict(_EMPTY_STATE)
        self._signal_update()

    def _update_and_signal(self, new_state: dict):
        """Atomically update state and signal the async side."""
        with self._lock:
            self._state = new_state
        self._signal_update()

    def _signal_update(self):
        """Wake up the async waiter (thread-safe)."""
        if self._loop and self._loop.is_running():
            self._loop.call_soon_threadsafe(self._update_event.set)

    def _on_name_owner_changed(self, name: str, old_owner: str, new_owner: str):
        """Called when Spotify's D-Bus name owner changes (from signal thread)."""
        if name != SPOTIFY_SERVICE:
            return
        if new_owner and not old_owner:
            logger.info("Spotify appeared on D-Bus")
            try:
                obj = self._bus.get_object(SPOTIFY_SERVICE, SPOTIFY_PATH)
                iface = dbus.Interface(obj, PROPERTIES_IFACE)
                iface.connect_to_signal(
                    "PropertiesChanged",
                    self._on_properties_changed,
                    dbus_interface=PROPERTIES_IFACE,
                )
                self._available = True
                self._fetch_state()
                self._signal_update()
            except Exception as e:
                logger.warning(f"Cannot connect to new Spotify instance: {e}")
        elif not new_owner and old_owner:
            logger.info("Spotify left D-Bus")
            self._set_state_unavailable()

    def _on_properties_changed(self, interface: str, changed: dict, invalidated: list):
        """Called when any MPRIS property changes (from signal thread)."""
        if interface != SPOTIFY_IFACE:
            return
        if "PlaybackStatus" in changed or "Metadata" in changed:
            self._fetch_state()
            self._signal_update()
        elif "Position" in changed:
            self._update_position(int(changed["Position"]))

    def _fetch_state(self):
        """Fetch the current playback state via D-Bus GetAll."""
        if not self._available:
            return
        try:
            obj = self._bus.get_object(SPOTIFY_SERVICE, SPOTIFY_PATH)
            props = dbus.Interface(obj, PROPERTIES_IFACE)
            all_props = props.GetAll(SPOTIFY_IFACE)
            new_state = self._parse_props(all_props)
            with self._lock:
                self._state = new_state
        except Exception as e:
            logger.warning(f"Error fetching Spotify state: {e}")
            self._set_state_unavailable()

    def _parse_props(self, props: dict) -> dict:
        """Parse MPRIS properties into our state dict."""
        metadata = props.get("Metadata", {}) or {}
        playback_status = str(props.get("PlaybackStatus", "Stopped"))
        position = int(props.get("Position", 0))

        title = str(metadata.get("xesam:title", ""))
        artist_list = metadata.get("xesam:artist", []) or []
        if isinstance(artist_list, dbus.Array):
            artist_list = list(artist_list)
        artist = ", ".join(str(a) for a in artist_list) if artist_list else ""
        album = str(metadata.get("xesam:album", ""))
        art_url = str(metadata.get("mpris:artUrl", ""))
        duration = int(metadata.get("mpris:length", 0))

        return {
            "type": "spotify",
            "available": True,
            "playing": playback_status == "Playing",
            "title": title,
            "artist": artist,
            "album": album,
            "artUrl": art_url,
            "duration": _micros_to_seconds(duration),
            "position": _micros_to_seconds(position),
        }

    def _update_position(self, position_micros: int):
        """Update just the position field (frequent updates, from signal thread)."""
        with self._lock:
            self._state["position"] = _micros_to_seconds(position_micros)

    async def _position_poll_loop(self):
        """Fallback: poll position every second when playing."""
        while self._running:
            await asyncio.sleep(1)
            if self._available and self._state.get("playing"):
                try:
                    obj = self._bus.get_object(SPOTIFY_SERVICE, SPOTIFY_PATH)
                    props = dbus.Interface(obj, PROPERTIES_IFACE)
                    position = props.Get(SPOTIFY_IFACE, "Position")
                    self._update_position(int(position))
                    self._signal_update()
                except Exception:
                    pass


# Module-level singleton
spotify_listener = SpotifyListener()

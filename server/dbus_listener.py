"""
D-Bus notification listener.

Watches org.freedesktop.Notifications.Notify method calls AND their
method_return values via dbus-monitor subprocess. This is completely
passive — it parses dbus-monitor output and does not interfere with
notification delivery to GNOME Shell.

Also captures the notification ID (return value) and the original sender's
D-Bus unique name (from x-shell-sender hint) so Birdeye can later invoke
notification actions via the GNOME Shell extension.
"""

import asyncio
import logging
import queue
import re
import subprocess
import threading
import time
from typing import Optional

logger = logging.getLogger(__name__)

_BROWSER_NAMES = {
    "chrome", "chromium", "firefox", "brave", "google-chrome",
    "microsoft-edge", "google chrome", "brave-browser", "chromium-browser",
}

# Regexes for parsing dbus-monitor output
_RE_METHOD_CALL = re.compile(
    r"method call time=\S+ sender=(\S+) -> destination=(\S+) "
    r"serial=(\d+) path=\S+; interface=\S+; member=(\S+)"
)
_RE_METHOD_RETURN = re.compile(
    r"method return time=\S+ sender=(\S+) -> destination=(\S+) "
    r"serial=\d+ reply_serial=(\d+)"
)
_RE_UINT32 = re.compile(r"^\s*uint32 (\d+)")
_RE_STRING = re.compile(r'^\s*string\s+"(.*)"$')
_RE_STRING_START = re.compile(r'^\s*string\s+"(.*)$')
_RE_STRING_END = re.compile(r'^(.*)"$')


def _is_browser_notification(app_name: str, desktop_entry: str) -> bool:
    """Check if the notification comes from a browser."""
    if app_name.lower() in _BROWSER_NAMES:
        return True
    if desktop_entry:
        entry_lower = desktop_entry.lower().replace(".desktop", "")
        if any(b in entry_lower for b in _BROWSER_NAMES):
            return True
    return False


def _parse_method_call_block(block: str) -> dict | None:
    """
    Parse a dbus-monitor Notify method call block from the FORWARDED call
    (sender=:1.44 → destination=:1.36). This is the GNOME Shell→main call
    that includes x-shell-sender hint.

    Returns a dict with notification content + x_shell_sender + shell_serial,
    or None if parsing fails.
    """
    try:
        lines = block.strip().split("\n")

        # Parse header line to get serial and senders
        header = lines[0]
        hdr_match = _RE_METHOD_CALL.search(header)
        if not hdr_match:
            return None
        sender = hdr_match.group(1)
        destination = hdr_match.group(2)
        serial = int(hdr_match.group(3))

        # We only care about the forwarded call: daemon (:1.44) → gnome-shell (:1.36)
        # The daemon's unique name changes but the well-known name is
        # org.gnome.Shell.Notifications. We match by destination being
        # the main gnome-shell.
        # Actually, we capture ALL Notify calls and let main.py sort them out.

        # Parse body using state machine
        app_name = None
        summary = None
        body = None
        seen_uint32_after_app = False
        string_count = 0

        i = 1  # skip header line
        while i < len(lines):
            ln = lines[i]
            stripped = ln.strip()

            if stripped.startswith("array "):
                break
            if stripped.startswith("int32 ") or stripped.startswith("int64 "):
                break

            m = _RE_STRING.match(ln)
            if m:
                val = m.group(1)
            else:
                m_start = _RE_STRING_START.match(ln)
                if m_start:
                    parts = [m_start.group(1)]
                    i += 1
                    while i < len(lines):
                        end_m = _RE_STRING_END.match(lines[i])
                        if end_m:
                            parts.append(end_m.group(1))
                            break
                        parts.append(lines[i].strip())
                        i += 1
                    val = "\n".join(parts)
                else:
                    if app_name is not None and not seen_uint32_after_app:
                        if "uint32" in stripped:
                            seen_uint32_after_app = True
                            string_count = 0
                    i += 1
                    continue

            string_count += 1

            if not seen_uint32_after_app:
                if string_count == 1:
                    app_name = val
            else:
                if string_count == 2:
                    summary = val
                elif string_count == 3:
                    body = val
                    break

            i += 1

        if app_name is None:
            return None

        # Extract x-shell-sender and desktop-entry from hints dict.
        # dbus-monitor splits dict entries across multiple lines:
        #   dict entry(
        #      string "key"
        #      variant  string "value"
        #   )
        # The Notify call has TWO arrays: first is actions (skip), second is hints.
        x_shell_sender = ""
        desktop_entry = ""
        arrays_seen = 0
        in_dict_entry = False
        current_hint_key = None

        for ln in lines:
            stripped = ln.strip()

            if stripped.startswith("array ["):
                arrays_seen += 1
                continue

            if stripped == "]":
                in_dict_entry = False
                current_hint_key = None
                continue

            # Only parse inside the second array (hints)
            if arrays_seen != 2:
                continue

            if stripped.startswith("dict entry("):
                in_dict_entry = True
                current_hint_key = None
                continue

            if stripped == ")":
                in_dict_entry = False
                current_hint_key = None
                continue

            if not in_dict_entry:
                continue

            # Try key line: string "keyname"
            key_m = re.match(r'^string\s+"([^"]+)"$', stripped)
            if key_m:
                current_hint_key = key_m.group(1)
                continue

            # Try value line: variant  type  value
            if current_hint_key:
                val_m = re.search(r'variant\s+string\s+"([^"]*)"', stripped)
                if val_m:
                    val = val_m.group(1)
                    if current_hint_key == "x-shell-sender":
                        x_shell_sender = val
                    elif current_hint_key == "desktop-entry":
                        desktop_entry = val
                    current_hint_key = None

        return {
            "app_name": app_name,
            "summary": summary or "",
            "body": body or "",
            "desktop_entry": desktop_entry,
            "x_shell_sender": x_shell_sender,
            "sender": sender,
            "destination": destination,
            "shell_serial": serial,
            "timestamp": time.time(),
        }
    except Exception:
        return None


def _parse_method_return_block(block: str) -> tuple[int, int] | None:
    """
    Parse a method_return block from the main gnome-shell (sender=:1.36)
    to the daemon (destination=:1.44). Returns (reply_serial, notification_id)
    or None.
    """
    try:
        lines = block.strip().split("\n")
        header = lines[0]

        hdr_match = _RE_METHOD_RETURN.search(header)
        if not hdr_match:
            return None

        reply_serial = int(hdr_match.group(3))

        # Find uint32 value in the body
        for ln in lines[1:]:
            m = _RE_UINT32.match(ln)
            if m:
                return (reply_serial, int(m.group(1)))

        return None
    except Exception:
        return None


class DBusListener:
    """Watch desktop notifications via dbus-monitor subprocess."""

    def __init__(self):
        self._thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._queue: queue.Queue = queue.Queue()
        self._async_queue: Optional[asyncio.Queue] = None
        self._stop_event = threading.Event()
        self._started = False
        self._process: Optional[subprocess.Popen] = None
        self._seen_keys: dict[str, float] = {}
        # Map shell_serial → notification dict (populated when return arrives)
        self._pending: dict[int, dict] = {}

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop
        self._async_queue = asyncio.Queue()

    async def notifications(self):
        if self._async_queue is None:
            return
        while True:
            notif = await self._async_queue.get()
            yield notif

    def start(self):
        if self._started:
            return
        self._started = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_monitor, daemon=True)
        self._thread.start()
        logger.info("D-Bus monitor thread started")

    def stop(self):
        self._stop_event.set()
        if self._process:
            try:
                self._process.terminate()
            except Exception:
                pass
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3)

    def _bridge_to_async(self, notif: dict):
        self._queue.put(notif)
        if self._loop and self._async_queue is not None:
            self._loop.call_soon_threadsafe(
                self._async_queue.put_nowait, notif
            )

    def _run_monitor(self):
        """Thread target: run dbus-monitor and parse its output."""
        if not self._check_dbus_monitor():
            return

        try:
            self._process = subprocess.Popen(
                [
                    "dbus-monitor", "--session", "--monitor",
                    "type='method_call',"
                    "interface='org.freedesktop.Notifications',"
                    "member='Notify'",
                    "type='method_return'",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except (FileNotFoundError, subprocess.SubprocessError) as e:
            logger.warning(f"Cannot start dbus-monitor: {e}")
            return

        logger.info("D-Bus monitor active (calls + returns)...")

        buffer: list[str] = []
        in_block = False
        block_is_call = False

        try:
            while not self._stop_event.is_set():
                line = self._process.stdout.readline()
                if not line:
                    break

                # Detect start of a method_call or method_return block
                if line.startswith("method call "):
                    if buffer:
                        self._flush_buffer(buffer, block_is_call)
                    buffer = [line]
                    in_block = True
                    block_is_call = True
                elif line.startswith("method return "):
                    if buffer:
                        self._flush_buffer(buffer, block_is_call)
                    buffer = [line]
                    in_block = True
                    block_is_call = False
                elif line.startswith("signal "):
                    # Flush any pending block, skip signals
                    if buffer:
                        self._flush_buffer(buffer, block_is_call)
                    buffer = []
                    in_block = False
                elif in_block:
                    buffer.append(line)

        except Exception as e:
            logger.error(f"dbus-monitor read error: {e}")
        finally:
            if buffer:
                self._flush_buffer(buffer, block_is_call)
            if self._process:
                try:
                    self._process.terminate()
                except Exception:
                    pass

    def _flush_buffer(self, buffer: list[str], is_call: bool):
        """Process a complete method_call or method_return block."""
        if not buffer:
            return

        if is_call:
            notif = _parse_method_call_block("".join(buffer))
            if notif:
                # Only process forwarded calls (daemon→gnome-shell) which have
                # x_shell_sender. These get paired with method_return to capture
                # the notification ID needed for deep-linking.
                # Original calls (app→daemon) have no x_shell_sender and are
                # skipped — they'd create duplicate notifications without IDs.
                if notif.get("x_shell_sender"):
                    serial = notif["shell_serial"]
                    self._pending[serial] = notif
                    # Clean old pending entries (older than 10s)
                    now = time.time()
                    stale = [
                        s for s, n in self._pending.items()
                        if now - n.get("timestamp", 0) > 10.0
                    ]
                    for s in stale:
                        del self._pending[s]
        else:
            result = _parse_method_return_block("".join(buffer))
            if result:
                reply_serial, notif_id = result
                if reply_serial in self._pending:
                    notif = self._pending.pop(reply_serial)
                    notif["notif_id"] = notif_id
                    self._process_notification(notif)

    def _check_dbus_monitor(self) -> bool:
        """Verify dbus-monitor is available."""
        try:
            result = subprocess.run(
                ["which", "dbus-monitor"],
                capture_output=True, text=True, timeout=3,
            )
            if result.returncode != 0:
                logger.warning("dbus-monitor not found in PATH")
                return False
            return True
        except Exception:
            logger.warning("Cannot check for dbus-monitor")
            return False

    def _process_notification(self, notif: dict):
        """Filter and forward a notification to the async bridge."""
        app_name = notif.get("app_name", "")
        summary = notif.get("summary", "")
        body = notif.get("body", "")
        desktop_entry = notif.get("desktop_entry", "")

        if _is_browser_notification(app_name, desktop_entry):
            logger.debug(f"D-Bus browser notification: {app_name} — «{summary[:50]}»")

        # Deduplicate: GNOME Shell forwards every Notify call, so dbus-monitor
        # sees it twice. Skip duplicates within 2s BUT let through the version
        # that has notif_id (the forwarded call), even if the original was seen first.
        now = time.time()
        key = f"{app_name}|{summary}|{body}"
        has_notif_id = notif.get("notif_id") is not None
        if key in self._seen_keys:
            age = now - self._seen_keys[key]
            if age < 2.0 and not has_notif_id:
                return
        self._seen_keys[key] = now

        # Purge stale keys
        cutoff = now - 5.0
        self._seen_keys = {
            k: v for k, v in self._seen_keys.items() if v > cutoff
        }

        self._bridge_to_async({
            "app_name": app_name,
            "summary": summary,
            "body": body,
            "desktop_entry": desktop_entry,
            "x_shell_sender": notif.get("x_shell_sender", ""),
            "notif_id": notif.get("notif_id"),  # may be None for original calls
            "timestamp": now,
        })
        logger.info(
            f"D-Bus notification from {app_name}: {summary[:60]}"
            + (f" (id={notif.get('notif_id')})" if notif.get('notif_id') else "")
        )

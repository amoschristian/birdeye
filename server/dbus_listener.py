"""
D-Bus notification listener.

Watches org.freedesktop.Notifications.Notify method calls via dbus-monitor
subprocess. This is completely passive — it parses dbus-monitor output and
does not interfere with notification delivery to GNOME Shell.
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
_RE_METHOD_CALL = re.compile(r"method call .+ member=Notify")
_RE_STRING = re.compile(r'^\s*string\s+"(.*)"$')
_RE_STRING_START = re.compile(r'^\s*string\s+"(.*)$')
_RE_STRING_END = re.compile(r'^(.*)"$')
_RE_DICT_ENTRY = re.compile(r'^\s*dict entry\(\s*string\s+"([^"]+)"\s*\n?\s*variant\s+(.*)$', re.MULTILINE)


def _is_browser_notification(app_name: str, desktop_entry: str) -> bool:
    """Check if the notification comes from a browser."""
    # Check by app_name first (Brave, Chrome, etc.)
    if app_name.lower() in _BROWSER_NAMES:
        return True
    # Check by desktop-entry hint
    if desktop_entry:
        entry_lower = desktop_entry.lower().replace(".desktop", "")
        if any(b in entry_lower for b in _BROWSER_NAMES):
            return True
    return False


def _parse_monitor_line(line: str) -> dict | None:
    """
    Parse a dbus-monitor Notify method call block.

    Notify signature: STRING app_name, UINT32 replaces_id, STRING app_icon,
                      STRING summary, STRING body, ARRAY actions, ARRAY hints,
                      INT32 expire_timeout

    Must parse by structure — not just count first 4 strings — because the
    body can be empty "" and then strings from the actions array would be
    mistaken for body (e.g. Telegram's action key "default").
    """
    try:
        lines = line.strip().split("\n")

        # Step through lines following the Notify call structure.
        # State machine: looking for app_name → uint32 → app_icon → summary → body
        app_name = None
        summary = None
        body = None
        seen_uint32_after_app = False
        string_count = 0

        i = 0
        while i < len(lines):
            ln = lines[i]
            stripped = ln.strip()

            # Stop at actions array — body is the last field before arrays
            if stripped.startswith("array "):
                break

            # Stop at int32 expire_timeout
            if stripped.startswith("int32 ") or stripped.startswith("int64 "):
                break

            # Try single-line string first
            m = _RE_STRING.match(ln)
            if m:
                val = m.group(1)
            else:
                # Maybe a multi-line string — starts with string "... but no closing "
                m_start = _RE_STRING_START.match(ln)
                if m_start:
                    parts = [m_start.group(1)]
                    i += 1
                    while i < len(lines):
                        end_m = _RE_STRING_END.match(lines[i])
                        if end_m:
                            parts.append(end_m.group(1))
                            break
                        # Preserve continuation lines, stripping dbus-monitor indentation
                        parts.append(lines[i].strip())
                        i += 1
                    val = "\n".join(parts)
                else:
                    # Not a string line — check for uint32 separator and continue
                    if app_name is not None and not seen_uint32_after_app:
                        if "uint32" in stripped:
                            seen_uint32_after_app = True
                            string_count = 0
                    i += 1
                    continue

            string_count += 1

            if not seen_uint32_after_app:
                # Before uint32: first string is app_name
                if string_count == 1:
                    app_name = val
            else:
                # After uint32: string #1 = app_icon (skip), #2 = summary, #3 = body
                if string_count == 2:
                    summary = val
                elif string_count == 3:
                    body = val
                    break  # we have everything we need

            i += 1

        if app_name is None:
            return None

        # Extract desktop-entry from hints dict
        desktop_entry = ""
        for i, ln in enumerate(lines):
            if "desktop-entry" in ln:
                for j in range(i + 1, min(i + 4, len(lines))):
                    m = _RE_STRING.match(lines[j])
                    if m:
                        desktop_entry = m.group(1)
                        break
                break

        return {
            "app_name": app_name,
            "summary": summary or "",
            "body": body or "",
            "desktop_entry": desktop_entry,
            "timestamp": time.time(),
        }
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
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except (FileNotFoundError, subprocess.SubprocessError) as e:
            logger.warning(f"Cannot start dbus-monitor: {e}")
            return

        logger.info("D-Bus monitor active (dbus-monitor subprocess)...")

        # Accumulate lines for one Notify call
        buffer: list[str] = []
        in_notify = False

        try:
            while not self._stop_event.is_set():
                line = self._process.stdout.readline()
                if not line:
                    break

                if _RE_METHOD_CALL.search(line):
                    # Start of a new Notify call — flush previous
                    if buffer:
                        notif = _parse_monitor_line("".join(buffer))
                        if notif:
                            self._process_notification(notif)
                    buffer = [line]
                    in_notify = True
                elif in_notify:
                    buffer.append(line)
                    # Check if this is the last line of the call
                    # (int32 expire_timeout — or end of array)
                    stripped = line.strip()
                    if stripped.startswith("int32 ") or stripped.startswith("int64 "):
                        notif = _parse_monitor_line("".join(buffer))
                        if notif:
                            self._process_notification(notif)
                        buffer = []
                        in_notify = False
        except Exception as e:
            logger.error(f"dbus-monitor read error: {e}")
        finally:
            if self._process:
                try:
                    self._process.terminate()
                except Exception:
                    pass

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

        # Browser notifications are no longer filtered here.
        # The extension intercepts page-level Notification() calls, but some
        # (e.g. service worker showNotification) bypass JS interception.
        # Let them through — main.py will attempt keyword matching against
        # config.json and drop only truly unmatched browser notifications.
        if _is_browser_notification(app_name, desktop_entry):
            logger.debug(f"D-Bus browser notification: {app_name} — «{summary[:50]}»")

        # Deduplicate: GNOME Shell forwards every Notify call, so
        # dbus-monitor sees it twice within ~1ms. Skip duplicates.
        now = time.time()
        key = f"{app_name}|{summary}|{body}"
        if key in self._seen_keys:
            if now - self._seen_keys[key] < 2.0:
                return
        self._seen_keys[key] = now

        # Purge stale keys (older than 5 seconds)
        cutoff = now - 5.0
        self._seen_keys = {
            k: v for k, v in self._seen_keys.items() if v > cutoff
        }

        self._bridge_to_async({
            "app_name": app_name,
            "summary": summary,
            "body": body,
            "desktop_entry": desktop_entry,
            "timestamp": now,
        })
        logger.info(f"D-Bus notification from {app_name}: {summary[:60]}")

import os
import re
import subprocess
import shutil
import time
import logging

logger = logging.getLogger(__name__)


# ── Environment detection ──────────────────────────────────────────


def _is_wayland() -> bool:
    """Detect if running under a Wayland session."""
    return os.environ.get("XDG_SESSION_TYPE", "").lower() == "wayland"


def _is_gnome() -> bool:
    """Detect if running under GNOME.

    Uses multiple strategies since the server process may lack XDG_CURRENT_DESKTOP.
    """
    desktop = os.environ.get("XDG_CURRENT_DESKTOP", "").lower()
    if "gnome" in desktop:
        return True
    # Fallback: look for gnome-shell process (works regardless of env vars)
    if shutil.which("pgrep"):
        try:
            result = subprocess.run(
                ["pgrep", "-x", "gnome-shell"],
                capture_output=True, text=True, timeout=2,
            )
            if result.returncode == 0 and result.stdout.strip():
                return True
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
    # Fallback: gsettings can query GNOME schemas
    if shutil.which("gsettings"):
        try:
            result = subprocess.run(
                ["gsettings", "get", "org.gnome.desktop.wm.keybindings",
                 "switch-to-workspace-1"],
                capture_output=True, text=True, timeout=2,
            )
            if result.returncode == 0:
                return True
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
    return False


# ── GNOME accelerator → ydotool keycodes ───────────────────────────

# Maps GNOME accelerator key names to Linux input event codes.
_GNOME_KEY_TO_CODE: dict[str, int] = {
    # Modifiers
    "super": 125,   # KEY_LEFTMETA
    "hyper": 125,   # KEY_LEFTMETA (same as Super on most systems)
    "alt": 56,      # KEY_LEFTALT
    "control": 29,  # KEY_LEFTCTRL
    "primary": 29,  # KEY_LEFTCTRL (Control on Linux)
    "shift": 42,    # KEY_LEFTSHIFT
    # Navigation
    "home": 102,        # KEY_HOME
    "end": 107,         # KEY_END
    "page_up": 104,     # KEY_PAGEUP
    "page_down": 109,   # KEY_PAGEDOWN
    "up": 103,          # KEY_UP
    "down": 108,        # KEY_DOWN
    "left": 105,        # KEY_LEFT
    "right": 106,       # KEY_RIGHT
    "tab": 15,          # KEY_TAB
    "escape": 1,        # KEY_ESC
    "space": 57,        # KEY_SPACE
    "return": 28,       # KEY_ENTER
    # Function keys
    **{f"f{i}": 58 + i for i in range(1, 13)},  # KEY_F1=59 … KEY_F12=70
    # Numbers (top row)
    **{str(i): 1 + i for i in range(10)},        # KEY_0=11, KEY_1=2 … KEY_9=10
    # Letters
    **{chr(c): c - 65 + 30 for c in range(ord('a'), ord('z') + 1)},  # KEY_A=30 … KEY_Z=43
}


def _parse_accelerator(accelerator: str) -> list[int]:
    """
    Parse a GNOME accelerator string into a list of keycodes (modifiers first, then
    the non-modifier key, then modifiers again in reverse for release).

    Example: '<Super>Home' -> [125, 102]   (modifiers first, then key)
             '<Control><Alt>Down' -> [29, 56, 108]
    """
    modifiers: list[int] = []
    keys: list[int] = []

    # Find all angle-bracket tokens like <Super>, <Control>, <Alt>, <Shift>
    for match in re.finditer(r'<(\w+)>', accelerator):
        name = match.group(1).lower()
        code = _GNOME_KEY_TO_CODE.get(name)
        if code:
            modifiers.append(code)

    # The remaining text after stripping all <…> tokens is the main key
    rest = re.sub(r'<\w+>', '', accelerator).strip()
    if rest:
        name = rest.lower().replace(' ', '_')
        code = _GNOME_KEY_TO_CODE.get(name)
        if code:
            keys.append(code)
        else:
            logger.debug(f"_parse_accelerator: unknown key '{rest}' in '{accelerator}'")

    # Return modifiers + keys (caller will build press/release sequence)
    return modifiers + keys


def _get_gnome_workspace_binding(workspace_num: int) -> str | None:
    """
    Read the GNOME keybinding for switch-to-workspace-N from gsettings.
    Returns the first accelerator string (e.g. '<Super>Home') or None.
    """
    if not shutil.which("gsettings"):
        return None
    try:
        result = subprocess.run(
            ["gsettings", "get", "org.gnome.desktop.wm.keybindings",
             f"switch-to-workspace-{workspace_num}"],
            capture_output=True, text=True, timeout=3,
        )
        if result.returncode != 0:
            return None
        # Output looks like: ['<Super>Home']  or  @as []  or  ['<Super>Page_Up', '<Super><Alt>Left']
        raw = result.stdout.strip()
        if raw.startswith("@as") or raw == "[]" or not raw:
            return None
        # Extract the first accelerator string inside quotes
        match = re.search(r"'([^']+)'", raw)
        if match:
            return match.group(1)
        return None
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        logger.debug(f"gsettings workspace binding lookup failed: {e}")
        return None


# ── Helpers ────────────────────────────────────────────────────────


def _run(args: list[str], timeout: int = 3) -> bool:
    """Run a subprocess, return True if exit code is 0."""
    try:
        subprocess.run(args, check=True, capture_output=True, text=True, timeout=timeout)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return False


# ── GNOME Shell Extension: activate-window-by-title ────────────────


def _focus_via_gnome_extension(wm_class: str) -> bool:
    """Focus a window by WM_CLASS using the activate-window-by-title GNOME extension.

    Tries multiple strategies since Wayland-native windows often have different
    WM_CLASS values than expected:
    1. Exact WM_CLASS match
    2. Substring match with the raw class
    3. Substring match with the class stripped of common suffixes (Desktop, Chat, etc.)
    4. Substring match with just the first word
    """
    if not shutil.which("gdbus"):
        return False

    def _try_call(method: str, arg: str) -> bool:
        try:
            result = subprocess.run(
                [
                    "gdbus", "call", "--session",
                    "--dest", "org.gnome.Shell",
                    "--object-path", "/de/lucaswerkmeister/ActivateWindowByTitle",
                    "--method", f"de.lucaswerkmeister.ActivateWindowByTitle.{method}",
                    arg,
                ],
                capture_output=True, text=True, timeout=3,
            )
            return "true" in result.stdout.lower()
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False

    # 1. Exact WM_CLASS
    if _try_call("activateByWmClass", wm_class):
        logger.info(f"GNOME extension focused {wm_class}")
        return True

    # 2. Substring raw class
    if _try_call("activateBySubstring", wm_class):
        logger.info(f"GNOME extension focused {wm_class} (by substring)")
        return True

    # 3. Strip common suffixes and try
    import re
    stripped = re.sub(r'(?i)(desktop|chat|client|app|web|beta|alpha)$', '', wm_class).strip()
    if stripped and stripped != wm_class:
        if _try_call("activateBySubstring", stripped):
            logger.info(f"GNOME extension focused {stripped} (stripped from {wm_class})")
            return True
        # Also try title-case
        title_case = stripped.title()
        if title_case != stripped and title_case != wm_class:
            if _try_call("activateBySubstring", title_case):
                logger.info(f"GNOME extension focused {title_case} (title-case)")
                return True

    # 4. Try just the first word of the class (e.g. "Telegram" from "TelegramDesktop")
    words = re.findall(r'[A-Z][a-z]+', wm_class)
    if words:
        first_word = words[0]
        if first_word != wm_class and first_word != stripped:
            if _try_call("activateBySubstring", first_word):
                logger.info(f"GNOME extension focused {first_word} (first word of {wm_class})")
                return True

    return False


# ── Public API ─────────────────────────────────────────────────────


def focus_window(window_id: int | str) -> bool:
    """
    Focus a window by its X11 window ID.

    Only works on X11. On Wayland, window IDs from the X11 compatibility
    layer may or may not work depending on the app.
    """
    wid = str(window_id)

    if _is_wayland():
        logger.debug(f"focus_window({wid}): Wayland detected, X11 tools unlikely to work")
        if shutil.which("wmctrl"):
            if _run(["wmctrl", "-i", "-a", wid]):
                return True
        if shutil.which("xdotool"):
            if _run(["xdotool", "windowactivate", wid]):
                return True
        return False

    if shutil.which("wmctrl"):
        return _run(["wmctrl", "-i", "-a", wid])
    if shutil.which("xdotool"):
        return _run(["xdotool", "windowactivate", wid])
    return False


def focus_window_by_class(wm_class: str, desktop_id: str | None = None) -> bool:
    """
    Find and raise a window by its WM_CLASS.

    On Wayland: uses the activate-window-by-title GNOME Shell extension
    (fast, reliable, no ydotool jank).
    On X11: uses wmctrl then xdotool.
    """
    if _is_wayland():
        # Primary: GNOME Shell extension D-Bus call
        if _focus_via_gnome_extension(wm_class):
            return True

        # Fallback: gtk-launch (may not switch workspaces)
        if desktop_id and shutil.which("gtk-launch"):
            logger.info(f"Wayland fallback: gtk-launch {desktop_id}")
            try:
                subprocess.run(
                    ["gtk-launch", desktop_id],
                    capture_output=True, text=True, timeout=5,
                )
                return True
            except (subprocess.TimeoutExpired, FileNotFoundError) as e:
                logger.warning(f"gtk-launch failed: {e}")

        return False

    # ── X11 path ──
    if shutil.which("wmctrl"):
        try:
            result = subprocess.run(
                ["wmctrl", "-x", "-a", wm_class],
                capture_output=True, text=True, timeout=3,
            )
            if result.returncode == 0:
                logger.info(f"wmctrl focused {wm_class}")
                return True
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            pass

    if shutil.which("xdotool"):
        for search_arg in ("--class", "--classname", "--name"):
            try:
                result = subprocess.run(
                    ["xdotool", "search", search_arg, wm_class],
                    capture_output=True, text=True, timeout=3,
                )
                if result.returncode == 0 and result.stdout.strip():
                    xid = result.stdout.strip().split()[0]
                    logger.info(f"xdotool: found {wm_class} -> {xid}")
                    return _run(["xdotool", "windowactivate", xid])
            except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
                pass

        try:
            listed = subprocess.run(
                ["xdotool", "search", "--all", ""],
                capture_output=True, text=True, timeout=5,
            )
            if listed.returncode == 0:
                for xid in listed.stdout.strip().split():
                    name_result = subprocess.run(
                        ["xdotool", "getwindowname", xid],
                        capture_output=True, text=True, timeout=1,
                    )
                    if name_result.returncode == 0 and wm_class.lower() in name_result.stdout.strip().lower():
                        logger.info(f"xdotool: found {wm_class} by name -> {xid}")
                        return _run(["xdotool", "windowactivate", xid])
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            pass

    logger.warning(f"focus_window_by_class: no method worked for {wm_class}")
    return False


def _send_keys_ydotool(keycodes: list[int]) -> bool:
    """
    Send a keystroke sequence via ydotool.
    keycodes are modifiers first, then the main key.
    Sequence: press all modifiers, press main key, release main key, release modifiers (reversed).
    """
    if not keycodes:
        return False
    # Split: last element is the main key, everything else is modifiers
    modifiers = keycodes[:-1]
    main_key = keycodes[-1]

    # Build ydotool arguments: press modifiers, press key, release key, release modifiers
    args = ["ydotool", "key"]
    for code in modifiers:
        args.append(f"{code}:1")
    args.append(f"{main_key}:1")
    args.append(f"{main_key}:0")
    for code in reversed(modifiers):
        args.append(f"{code}:0")

    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=3)
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def _send_keys_wtype(keycodes: list[int]) -> bool:
    """
    Send a keystroke sequence via wtype.
    keycodes are modifiers first, then the main key.
    """
    if not keycodes or not shutil.which("wtype"):
        return False
    # wtype doesn't use keycodes, it uses key names.
    # We'd need the reverse mapping. For now, wtype path is unused since
    # we map accelerator strings through ydotool keycodes.
    return False


def switch_to_workspace(workspace_num: int) -> bool:
    """
    Switch to a workspace by number (1-indexed).

    Tries multiple strategies:
    1. wmctrl -s N (X11, also works on some Wayland compositors)
    2. GNOME gsettings keybinding → ydotool (reads the actual user-configured shortcut)
    3. ydotool Super+N fallback (generic, works on many WMs)
    """
    if workspace_num < 1:
        return False

    # ── Strategy 1: wmctrl (0-indexed) ──
    if shutil.which("wmctrl"):
        try:
            desktop_idx = workspace_num - 1
            result = subprocess.run(
                ["wmctrl", "-s", str(desktop_idx)],
                capture_output=True, text=True, timeout=3,
            )
            if result.returncode == 0:
                logger.info(f"wmctrl switched to workspace {workspace_num}")
                return True
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            logger.debug(f"wmctrl workspace switch failed: {e}")

    # ── Strategy 2: GNOME gsettings keybinding → ydotool ──
    if _is_gnome() and shutil.which("ydotool"):
        binding = _get_gnome_workspace_binding(workspace_num)
        if binding:
            keycodes = _parse_accelerator(binding)
            if keycodes and _send_keys_ydotool(keycodes):
                logger.info(f"ydotool (GNOME binding '{binding}') switched to workspace {workspace_num}")
                return True
            else:
                logger.debug(f"GNOME binding '{binding}' parsed to {keycodes}, ydotool failed")
        else:
            logger.debug(f"No GNOME keybinding for workspace {workspace_num}")

    # ── Strategy 3: ydotool Super+N fallback (generic) ──
    if shutil.which("ydotool"):
        # Hardcoded Super+N — only used when GNOME gsettings lookup fails
        # or we're not on GNOME. Works on KDE, Sway, and other WMs.
        keycodes = [125, 1 + workspace_num]  # KEY_LEFTMETA + KEY_1..KEY_9
        if 2 <= keycodes[1] <= 10 and _send_keys_ydotool(keycodes):
            logger.info(f"ydotool (Super+{workspace_num} fallback) switched to workspace {workspace_num}")
            return True

    logger.warning(f"switch_to_workspace: no method worked for workspace {workspace_num}")
    return False


def get_window_workspace(wm_class: str) -> int | None:
    """
    Find which workspace (0-indexed) a window with the given WM_CLASS
    is on. Uses wmctrl -lx. Returns None if the window can't be found.
    """
    if not shutil.which("wmctrl"):
        return None
    try:
        result = subprocess.run(
            ["wmctrl", "-lx"],
            capture_output=True, text=True, timeout=3,
        )
        # Each line: <window_id> <desktop> <wm_class> <host> <title>
        for line in result.stdout.splitlines():
            parts = line.split(None, 3)
            if len(parts) >= 3:
                # parts[1] is desktop number (0-indexed), parts[2] is WM_CLASS
                if wm_class.lower() in parts[2].lower():
                    try:
                        return int(parts[1])
                    except (ValueError, IndexError):
                        pass
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        pass
    return None


def get_current_workspace() -> int | None:
    """
    Get the currently active workspace index (0-based).
    Uses wmctrl -d and looks for the '*' marker. Returns None on failure.
    """
    if not shutil.which("wmctrl"):
        return None
    try:
        result = subprocess.run(
            ["wmctrl", "-d"],
            capture_output=True, text=True, timeout=3,
        )
        for line in result.stdout.splitlines():
            if '*' in line:
                parts = line.split()
                if parts:
                    return int(parts[0])
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError, ValueError):
        pass
    return None


def focus_window_by_class_and_switch(wm_class: str, desktop_id: str | None = None) -> bool:
    """
    Focus a window by WM_CLASS AND switch to its workspace.

    First tries focus_window_by_class (GNOME extension, wmctrl, xdotool).
    Then, regardless of whether focus succeeded, try to detect the window's
    workspace and switch to it so the user lands on the right desktop.
    """
    focused = focus_window_by_class(wm_class, desktop_id)

    workspace = get_window_workspace(wm_class)
    if workspace is not None:
        # wmctrl uses 0-indexed desktops; switch_to_workspace takes 1-indexed
        ws_num = workspace + 1
        current = get_current_workspace()
        if current is not None and current == workspace:
            logger.info(f"{wm_class} already on current workspace {ws_num}, not switching")
        elif ws_num >= 1:
            logger.info(f"{wm_class} found on workspace {ws_num} (current={current}), switching")
            switched = switch_to_workspace(ws_num)
            return focused or switched

    return focused


def focus_browser() -> bool:
    """
    Bring the browser window to the foreground.

    On Wayland: tries the GNOME Shell extension with common browser WM_CLASSes.
    On X11: uses wmctrl / xdotool.

    Note: for browser tabs, the extension's chrome.windows.update(focused)
    call usually handles focus via xdg-activation on modern compositors.
    This is a belt-and-suspenders fallback.
    """
    if _is_wayland():
        for browser_class in (
            "Brave-browser", "brave-browser",
            "Google-chrome", "google-chrome",
            "Chromium", "chromium",
            "Firefox", "firefox",
        ):
            if _focus_via_gnome_extension(browser_class):
                return True
        return False

    # ── X11 path ──
    if shutil.which("wmctrl"):
        try:
            result = subprocess.run(
                ["wmctrl", "-l"],
                capture_output=True, text=True, timeout=3,
            )
            for line in result.stdout.splitlines():
                lower = line.lower()
                if any(k in lower for k in ("chrome", "chromium", "brave", "firefox")):
                    wid = line.split()[0]
                    logger.info(f"focus_browser: wmctrl -> {wid}")
                    return _run(["wmctrl", "-i", "-a", wid])
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            pass

    if shutil.which("xdotool"):
        for cls in ("brave-browser", "Brave-browser",
                    "google-chrome", "Google-chrome",
                    "chromium", "Chromium",
                    "firefox", "Firefox"):
            try:
                result = subprocess.run(
                    ["xdotool", "search", "--class", cls],
                    capture_output=True, text=True, timeout=3,
                )
                if result.returncode == 0 and result.stdout.strip():
                    xid = result.stdout.strip().split()[0]
                    logger.info(f"focus_browser: xdotool -> {xid}")
                    return _run(["xdotool", "windowactivate", xid])
            except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
                pass

    logger.warning("focus_browser: no method worked")
    return False

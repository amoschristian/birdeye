"""
Invoke notification actions via the Birdeye GNOME Shell extension.

The extension (birdeye-action-invoker@blackhawk) exposes a D-Bus method
that emits the ActionInvoked signal from within the gnome-shell process.
The notification daemon proxies this signal to the original sender app.
"""

import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

try:
    import gi
    gi.require_version('Gio', '2.0')
    from gi.repository import Gio, GLib
    _HAS_GIO = True
except (ImportError, ValueError):
    _HAS_GIO = False
    logger.warning("python-gobject not available; D-Bus action invocation disabled")


async def invoke_action(notif_id: int, action_key: str = "default") -> bool:
    """
    Call the Birdeye GNOME Shell extension to invoke a notification action.

    The extension emits the ActionInvoked D-Bus signal from within the
    gnome-shell process. The separate notification daemon process picks
    it up and forwards it to the original notification sender (e.g.,
    browser, Telegram), causing it to focus the specific tab/chat.
    """
    if not _HAS_GIO:
        logger.warning("Cannot invoke action: python-gobject not available")
        return False

    try:
        connection = Gio.bus_get_sync(Gio.BusType.SESSION, None)

        result = connection.call_sync(
            'org.gnome.Shell',  # extension exports on gnome-shell's connection
            '/org/birdeye/ActionInvoker',
            'org.birdeye.ActionInvoker',
            'InvokeAction',
            GLib.Variant('(us)', [notif_id, action_key]),
            GLib.VariantType('(b)'),
            Gio.DBusCallFlags.NONE,
            2000,  # 2s timeout
            None,
        )

        success = result.unpack()[0]
        if success:
            logger.info(f"ActionInvoked: notif_id={notif_id} action='{action_key}' → success")
        else:
            logger.warning(f"ActionInvoked: notif_id={notif_id} returned false")
        return success

    except Exception as e:
        logger.warning(f"ActionInvoked failed: {e}")
        return False


def invoke_action_sync(notif_id: int, action_key: str = "default") -> bool:
    """Synchronous wrapper for invoke_action."""
    if not _HAS_GIO:
        return False

    try:
        connection = Gio.bus_get_sync(Gio.BusType.SESSION, None)

        result = connection.call_sync(
            'org.gnome.Shell',  # extension exports on gnome-shell's connection
            '/org/birdeye/ActionInvoker',
            'org.birdeye.ActionInvoker',
            'InvokeAction',
            GLib.Variant('(us)', [notif_id, action_key]),
            GLib.VariantType('(b)'),
            Gio.DBusCallFlags.NONE,
            2000,
            None,
        )
        return result.unpack()[0]
    except Exception as e:
        logger.warning(f"ActionInvoked (sync) failed: {e}")
        return False

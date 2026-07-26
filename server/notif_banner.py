import subprocess
import logging

logger = logging.getLogger(__name__)

_SUPPRESSED = False


def suppress_native_banners() -> bool:
    """Disable GNOME notification popup banners. Returns True on success."""
    global _SUPPRESSED
    try:
        result = subprocess.run(
            ["gsettings", "set", "org.gnome.desktop.notifications", "show-banners", "false"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            _SUPPRESSED = True
            logger.info("Native notification banners suppressed (show-banners=false)")
            return True
        else:
            logger.warning(f"gsettings failed: {result.stderr.strip()}")
            return False
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        logger.warning(f"Cannot suppress native banners: {e}")
        return False


def restore_native_banners():
    """Restore GNOME notification popup banners to their original state."""
    global _SUPPRESSED
    if not _SUPPRESSED:
        return
    try:
        subprocess.run(
            ["gsettings", "set", "org.gnome.desktop.notifications", "show-banners", "true"],
            capture_output=True, text=True, timeout=5,
        )
        _SUPPRESSED = False
        logger.info("Native notification banners restored (show-banners=true)")
    except Exception as e:
        logger.warning(f"Failed to restore native banners: {e}")

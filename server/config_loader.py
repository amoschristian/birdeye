import json
import logging
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).resolve().parent / "config.json"


@dataclass
class AppConfig:
    id: str
    name: str
    type: str  # "browser" or "native"
    urlPattern: Optional[str] = None
    domain: Optional[str] = None
    windowClass: Optional[str] = None
    desktopId: Optional[str] = None  # .desktop file ID for gtk-launch (Wayland native apps)
    matchKeywords: list[str] = field(default_factory=list)  # for matching D-Bus notifications by title/body
    group: str = ""  # "work" or "personal" for sidebar grouping
    icon: str = "🔔"
    sound: str = "default"
    enabled: bool = True


class Config:
    def __init__(self, path: str | Path = CONFIG_PATH):
        self._path = str(path)
        self.apps: dict[str, AppConfig] = {}

    def load(self):
        try:
            with open(self._path) as f:
                raw = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            logger.warning(f"Cannot load config: {e}. Using empty config.")
            self.apps = {}
            return

        apps_raw = raw.get("apps", {})
        for app_id, app_data in apps_raw.items():
            self.apps[app_id] = AppConfig(
                id=app_id,
                name=app_data.get("name", app_id),
                type=app_data.get("type", "browser"),
                urlPattern=app_data.get("urlPattern"),
                domain=app_data.get("domain"),
                windowClass=app_data.get("windowClass"),
                desktopId=app_data.get("desktopId"),
                matchKeywords=app_data.get("matchKeywords", []),
                group=app_data.get("group", ""),
                icon=app_data.get("icon", "🔔"),
                sound=app_data.get("sound", "default"),
                enabled=app_data.get("enabled", True),
            )
        logger.info(f"Loaded {len(self.apps)} app config(s)")

    def get(self, app_id: str) -> AppConfig | None:
        return self.apps.get(app_id)

    def get_enabled(self) -> list[AppConfig]:
        return [a for a in self.apps.values() if a.enabled]

    def get_by_url(self, url: str) -> AppConfig | None:
        """Match a URL against known urlPatterns (for extension tab matching)."""
        for app in self.apps.values():
            if app.urlPattern and app.urlPattern in url:
                return app
        return None

    def to_dict(self) -> list[dict]:
        return [
            {
                "id": a.id,
                "name": a.name,
                "type": a.type,
                "group": a.group,
                "icon": a.icon,
                "sound": a.sound,
                "enabled": a.enabled,
            }
            for a in self.get_enabled()
        ]


config = Config()

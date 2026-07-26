import time
from pydantic import BaseModel


class TabState(BaseModel):
    tab_id: int
    window_id: int
    app_id: str
    app_name: str
    unread: int
    last_message: str | None = None
    last_time: float


_tabs: dict[str, TabState] = {}


def update_tab(data: dict) -> TabState:
    key = f"{data['appId']}:{data['tabId']}"
    now = time.time()

    existing = _tabs.get(key)
    if existing:
        existing.unread = data.get("unread", existing.unread)
        existing.last_time = now
        if data.get("type") == "notification":
            existing.last_message = data.get("body", data.get("title", existing.last_message))
            existing.window_id = data.get("windowId", existing.window_id)
        return existing

    # Clean up stale entries for the same tab with a different appId
    # (happens when extension reloads with a changed provider id)
    tab_id = data["tabId"]
    stale_keys = [k for k, v in _tabs.items() if v.tab_id == tab_id and k != key]
    for sk in stale_keys:
        del _tabs[sk]

    tab = TabState(
        tab_id=tab_id,
        window_id=data.get("windowId", 0),
        app_id=data["appId"],
        app_name=data.get("appName", ""),
        unread=data.get("unread", 0),
        last_message=data.get("body", data.get("title", "")),
        last_time=now,
    )
    _tabs[key] = tab
    return tab


def remove_tab(app_id: str, tab_id: int):
    _tabs.pop(f"{app_id}:{tab_id}", None)


def get_all() -> list[TabState]:
    return list(_tabs.values())

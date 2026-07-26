import json
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import state
import wm
from db import db
from config_loader import config
from monitor import system_monitor
from spotify import spotify_listener
from cal_listener import calendar_listener

logger = logging.getLogger(__name__)

router = APIRouter()

_extension_conns: set[WebSocket] = set()
_dashboard_conns: set[WebSocket] = set()


# ── Broadcast helpers ──────────────────────────────────────────────


async def _send(conn: WebSocket, payload: dict):
    """Safely send JSON to a single connection."""
    try:
        await conn.send_json(payload)
    except Exception:
        pass


async def _broadcast(conns: set[WebSocket], payload: dict):
    """Broadcast a dict to all connections in a set, removing dead ones."""
    dead: list[WebSocket] = []
    for conn in conns:
        try:
            await conn.send_json(payload)
        except Exception:
            dead.append(conn)
    for conn in dead:
        conns.discard(conn)


async def broadcast_state():
    """Send full state snapshot to all dashboard connections."""
    tabs_list = [t.model_dump() for t in state.get_all()]
    notif_list = [n.__dict__ for n in db.get_all()]
    apps_list = config.to_dict()
    payload = {
        "type": "state",
        "tabs": tabs_list,
        "notifications": notif_list,
        "apps": apps_list,
    }
    await _broadcast(_dashboard_conns, payload)


async def broadcast_tabs():
    """Send only tabs + apps (no notifications) — for extension update/remove events."""
    if not _dashboard_conns:
        return
    tabs_list = [t.model_dump() for t in state.get_all()]
    apps_list = config.to_dict()
    payload = {
        "type": "tabs",
        "tabs": tabs_list,
        "apps": apps_list,
    }
    await _broadcast(_dashboard_conns, payload)


async def broadcast_notification(notification):
    """Broadcast a single new notification to all dashboards."""
    payload = {
        "type": "notification",
        "notification": notification.__dict__,
    }
    await _broadcast(_dashboard_conns, payload)


async def broadcast_notification_read(notification_id: int):
    """Echo mark-read to all dashboards."""
    payload = {
        "type": "notification_read",
        "id": notification_id,
    }
    await _broadcast(_dashboard_conns, payload)


async def broadcast_monitor():
    """Broadcast latest monitor snapshot to all dashboards."""
    if not _dashboard_conns:
        return
    payload = system_monitor.get_snapshot()
    await _broadcast(_dashboard_conns, payload)


async def broadcast_spotify():
    """Broadcast latest Spotify state to all dashboards."""
    if not _dashboard_conns:
        return
    payload = spotify_listener.get_state()
    await _broadcast(_dashboard_conns, payload)



async def broadcast_calendar():
    """Broadcast today + tomorrow upcoming events (max 8) to all dashboards."""
    if not _dashboard_conns:
        return
    now = datetime.now()
    tomorrow_end = now.replace(hour=23, minute=59, second=59) + timedelta(days=1)
    tomorrow_end_ts = tomorrow_end.timestamp()

    all_events = calendar_listener.get_upcoming(limit=50)
    # Filter to today + tomorrow only
    filtered = [e for e in all_events if e.get("start", 0) <= tomorrow_end_ts][:8]
    payload = {"type": "calendar", "events": filtered}
    await _broadcast(_dashboard_conns, payload)


async def broadcast_todos():
    """Broadcast full todo list to all dashboards."""
    if not _dashboard_conns:
        return
    todos_list = [t.__dict__ for t in db.get_all_todos()]
    payload = {"type": "todos", "todos": todos_list}
    await _broadcast(_dashboard_conns, payload)

# ── Extension WebSocket ────────────────────────────────────────────


@router.websocket("/ws/extension")
async def ws_extension(websocket: WebSocket):
    await websocket.accept()
    _extension_conns.add(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            logger.info(f"Extension → {msg_type}: {data.get('appId', '?')} unread={data.get('unread', '?')} title={data.get('title', '?')[:40]}")

            if msg_type == "notification":
                state.update_tab(data)
                # Persist as a notification card (browser extension notifications
                # don't go through D-Bus, so we store them directly in the DB)
                db.create_notification(
                    app_id=data.get("appId", ""),
                    app_name=data.get("appName", ""),
                    summary=data.get("title", ""),
                    body=data.get("body", ""),
                )
                await broadcast_state()
            elif msg_type == "update":
                state.update_tab(data)
                await broadcast_tabs()
            elif msg_type == "remove":
                state.remove_tab(data.get("appId", ""), data.get("tabId", 0))
                await broadcast_tabs()

            elif msg_type == "focus_ack":
                # Forward focus ack from extension to all dashboards
                payload = {
                    "type": "focus_ack",
                    "appId": data.get("appId", ""),
                    "success": data.get("success", False),
                }
                await _broadcast(_dashboard_conns, payload)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"Extension WS error: {e}")
    finally:
        _extension_conns.discard(websocket)


# ── Dashboard WebSocket ────────────────────────────────────────────


@router.websocket("/ws/dashboard")
async def ws_dashboard(websocket: WebSocket):
    await websocket.accept()
    _dashboard_conns.add(websocket)

    # Send initial state snapshot (tabs + notifications + apps + monitor + spotify + calendar + todos)
    await broadcast_state()
    await broadcast_monitor()
    await broadcast_spotify()
    await broadcast_calendar()
    await broadcast_todos()

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "mark_read":
                notif_id = data.get("id")
                if notif_id is not None:
                    ok = db.mark_read(notif_id)
                    if ok:
                        await broadcast_notification_read(notif_id)

            elif action == "mark_all_read":
                app_id = data.get("appId")
                count = db.mark_all_read(app_id if app_id else None)
                if count > 0:
                    await broadcast_state()

            elif action == "clear_read":
                count = db.clear_read()
                if count > 0:
                    await broadcast_state()

            elif action == "switch_workspace":
                ws_num = data.get("workspace", 1)
                success = wm.switch_to_workspace(ws_num)
                await _send(websocket, {
                    "type": "workspace_ack",
                    "workspace": ws_num,
                    "success": success,
                })

            elif action == "spotify":
                command = data.get("command", "")
                if command in ("play_pause", "next", "previous"):
                    spotify_listener.send_command(command)

            elif action == "todo_add":
                text = data.get("text", "").strip()
                if text:
                    todo = db.create_todo(text)
                    if todo:
                        await broadcast_todos()

            elif action == "todo_toggle":
                todo_id = data.get("id")
                if todo_id is not None:
                    db.toggle_todo(todo_id)
                    await broadcast_todos()

            elif action == "todo_edit":
                todo_id = data.get("id")
                text = data.get("text", "").strip()
                if todo_id is not None and text:
                    db.update_todo_text(todo_id, text)
                    await broadcast_todos()

            elif action == "todo_priority":
                todo_id = data.get("id")
                priority = data.get("priority", "")
                if todo_id is not None and priority in ('high', 'medium', 'low'):
                    db.update_todo_priority(todo_id, priority)
                    await broadcast_todos()

            elif action == "todo_date":
                todo_id = data.get("id")
                due_date = data.get("due_date")
                if todo_id is not None:
                    db.update_todo_due_date(todo_id, due_date if due_date else None)
                    await broadcast_todos()

            elif action == "todo_reorder":
                todo_id = data.get("id")
                order_index = data.get("order_index")
                if todo_id is not None and order_index is not None:
                    db.reorder_todo(todo_id, int(order_index))
                    await broadcast_todos()

            elif action == "todo_delete":
                todo_id = data.get("id")
                if todo_id is not None:
                    db.delete_todo(todo_id)
                    await broadcast_todos()

            elif action == "focus":
                app_id = data.get("appId", "")
                app_config = config.get(app_id)
                if app_config is None:
                    await _send(websocket, {"type": "focus_ack", "appId": app_id, "success": False})
                    continue

                if app_config.type == "browser":
                    # Find most recent tab for this app, send focus to extension
                    tabs = [t for t in state.get_all() if t.app_id == app_id]
                    if tabs:
                        tab = max(tabs, key=lambda t: t.last_time)
                        focus_msg = {
                            "type": "focus",
                            "appId": app_id,
                            "tabId": tab.tab_id,
                            "windowId": tab.window_id,
                        }
                        await _broadcast(_extension_conns, focus_msg)

                    # Always also try to focus the browser window directly.
                    # The extension handles tab-level focus; wm handles
                    # bringing the browser window to the foreground, which
                    # is essential on multi-monitor and Wayland setups.
                    wm_success = wm.focus_browser()
                    await _send(websocket, {
                        "type": "focus_ack",
                        "appId": app_id,
                        "success": True,
                    })
                else:
                    # Native app: use wm to focus by window class
                    wm_class = app_config.windowClass
                    desktop_id = app_config.desktopId
                    if wm_class:
                        success = wm.focus_window_by_class(wm_class, desktop_id)
                    else:
                        success = False
                    await _send(websocket, {"type": "focus_ack", "appId": app_id, "success": success})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"Dashboard WS error: {e}")
    finally:
        _dashboard_conns.discard(websocket)

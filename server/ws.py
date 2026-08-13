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
from notif_importance import classify_importance

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
    """Broadcast full todo list with nested subtasks to all dashboards."""
    if not _dashboard_conns:
        return
    todos = db.get_all_todos()
    subtasks_map = db.get_all_subtasks()
    todos_list = []
    for t in todos:
        d = t.__dict__.copy()
        d["subtasks"] = [s.__dict__ for s in subtasks_map.get(t.id, [])]
        todos_list.append(d)
    payload = {"type": "todos", "todos": todos_list}
    await _broadcast(_dashboard_conns, payload)


async def broadcast_todo_reminder(todo):
    """Broadcast a single todo reminder to all dashboards (not a notification)."""
    payload = {"type": "todo_reminder", "todo": todo.__dict__}
    await _broadcast(_dashboard_conns, payload)


async def _todo_ack(websocket: WebSocket, request_id: str | None, action: str,
                    success: bool, entity_id: int | None = None, error: str | None = None):
    """Request-correlated acknowledgement for todo/subtask mutations."""
    if not request_id:
        return
    await _send(websocket, {
        "type": "todo_ack",
        "requestId": request_id,
        "action": action,
        "id": entity_id,
        "success": success,
        "error": error,
    })


async def _handle_todo_action(websocket: WebSocket, data: dict):
    """Dispatch todo/subtask mutations. Always acks; broadcasts only on success."""
    action = data.get("action")
    req = data.get("requestId")
    ok = False
    entity_id: int | None = None
    error: str | None = None

    if action == "todo_add":
        text = (data.get("text") or "").strip()
        if not text:
            error = "empty_text"
        else:
            todo = db.create_todo(text)
            if todo:
                ok, entity_id = True, todo.id
            else:
                error = "create_failed"

    elif action == "todo_toggle":
        todo_id = data.get("id")
        if todo_id is None:
            error = "missing_id"
        else:
            entity_id = todo_id
            todo = db.toggle_todo(todo_id)
            if todo:
                ok = True
            else:
                error = "not_found"

    elif action == "todo_status":
        todo_id = data.get("id")
        status = data.get("status", "")
        if todo_id is None:
            error = "missing_id"
        elif status not in ("inbox", "active", "waiting", "completed", "archived"):
            error = "invalid_status"
        else:
            entity_id = todo_id
            todo = db.update_todo_status(todo_id, status)
            if todo:
                ok = True
            else:
                error = "not_found"

    elif action == "todo_edit":
        todo_id = data.get("id")
        text = (data.get("text") or "").strip()
        if todo_id is None:
            error = "missing_id"
        elif not text:
            error = "empty_text"
        else:
            entity_id = todo_id
            todo = db.update_todo_text(todo_id, text)
            if todo:
                ok = True
            else:
                error = "not_found"

    elif action == "todo_notes":
        todo_id = data.get("id")
        if todo_id is None:
            error = "missing_id"
        else:
            entity_id = todo_id
            todo = db.update_todo_notes(todo_id, data.get("notes") or "")
            if todo:
                ok = True
            else:
                error = "not_found"

    elif action == "todo_project":
        todo_id = data.get("id")
        if todo_id is None:
            error = "missing_id"
        else:
            entity_id = todo_id
            todo = db.update_todo_project(todo_id, data.get("project") or "")
            if todo:
                ok = True
            else:
                error = "not_found"

    elif action == "todo_estimate":
        todo_id = data.get("id")
        if todo_id is None:
            error = "missing_id"
        else:
            entity_id = todo_id
            todo = db.update_todo_estimate(todo_id, data.get("estimate_minutes"))
            if todo:
                ok = True
            else:
                error = "invalid_estimate"

    elif action == "todo_schedule":
        todo_id = data.get("id")
        if todo_id is None:
            error = "missing_id"
        else:
            entity_id = todo_id
            todo = db.update_todo_schedule(
                todo_id,
                data.get("scheduled_date") or None,
                data.get("scheduled_time") or None,
            )
            if todo:
                ok = True
            else:
                error = "invalid_schedule"

    elif action == "todo_reminder":
        todo_id = data.get("id")
        if todo_id is None:
            error = "missing_id"
        else:
            entity_id = todo_id
            todo = db.update_todo_reminder(todo_id, data.get("reminder_at"))
            if todo:
                ok = True
            else:
                error = "invalid_reminder"

    elif action == "todo_repeat":
        todo_id = data.get("id")
        if todo_id is None:
            error = "missing_id"
        else:
            entity_id = todo_id
            todo = db.update_todo_repeat_rule(todo_id, data.get("repeat_rule"))
            if todo:
                ok = True
            else:
                error = "invalid_rule"

    elif action == "todo_attach_context":
        todo_id = data.get("id")
        if todo_id is None:
            error = "missing_id"
        else:
            entity_id = todo_id
            todo = db.attach_todo_context(
                todo_id,
                source_app=data.get("source_app"),
                source_sender=data.get("source_sender"),
                source_url=data.get("source_url"),
                source_notification_id=data.get("source_notification_id"),
            )
            if todo:
                ok = True
            else:
                error = "not_found"

    elif action == "todo_priority":
        todo_id = data.get("id")
        priority = data.get("priority", "")
        if todo_id is None:
            error = "missing_id"
        elif priority not in ("high", "medium", "low"):
            error = "invalid_priority"
        else:
            entity_id = todo_id
            todo = db.update_todo_priority(todo_id, priority)
            if todo:
                ok = True
            else:
                error = "not_found"

    elif action == "todo_date":
        todo_id = data.get("id")
        if todo_id is None:
            error = "missing_id"
        else:
            entity_id = todo_id
            todo = db.update_todo_due_date(todo_id, data.get("due_date") or None)
            if todo:
                ok = True
            else:
                error = "invalid_date"

    elif action == "todo_reorder":
        todo_id = data.get("id")
        order_index = data.get("order_index")
        if todo_id is None or order_index is None:
            error = "missing_fields"
        else:
            entity_id = todo_id
            ok = db.reorder_todo(todo_id, int(order_index))
            if not ok:
                error = "not_found"

    elif action == "todo_delete":
        todo_id = data.get("id")
        if todo_id is None:
            error = "missing_id"
        else:
            entity_id = todo_id
            ok = db.delete_todo(todo_id)  # soft-delete → archive
            if not ok:
                error = "not_found"

    elif action == "subtask_add":
        todo_id = data.get("todo_id")
        text = (data.get("text") or "").strip()
        if todo_id is None:
            error = "missing_id"
        elif not text:
            error = "empty_text"
        else:
            subtask = db.create_subtask(todo_id, text)
            if subtask:
                ok, entity_id = True, subtask.id
            else:
                error = "create_failed"

    elif action == "subtask_toggle":
        subtask_id = data.get("id")
        if subtask_id is None:
            error = "missing_id"
        else:
            entity_id = subtask_id
            subtask = db.toggle_subtask(subtask_id)
            if subtask:
                ok = True
            else:
                error = "not_found"

    elif action == "subtask_edit":
        subtask_id = data.get("id")
        text = (data.get("text") or "").strip()
        if subtask_id is None:
            error = "missing_id"
        elif not text:
            error = "empty_text"
        else:
            entity_id = subtask_id
            subtask = db.update_subtask_text(subtask_id, text)
            if subtask:
                ok = True
            else:
                error = "not_found"

    elif action == "subtask_delete":
        subtask_id = data.get("id")
        if subtask_id is None:
            error = "missing_id"
        else:
            entity_id = subtask_id
            ok = db.delete_subtask(subtask_id)
            if not ok:
                error = "not_found"

    elif action == "subtask_reorder":
        subtask_id = data.get("id")
        order_index = data.get("order_index")
        if subtask_id is None or order_index is None:
            error = "missing_fields"
        else:
            entity_id = subtask_id
            ok = db.reorder_subtask(subtask_id, int(order_index))
            if not ok:
                error = "not_found"

    else:
        error = "unknown_action"

    await _todo_ack(websocket, req, action, ok, entity_id, error)
    if ok:
        await broadcast_todos()

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
                app_id = data.get("appId", "")
                app_name = data.get("appName", "")
                summary = data.get("title", "")
                body = data.get("body", "")
                is_important = classify_importance(app_id, app_name, summary, body)
                db.create_notification(
                    app_id=app_id,
                    app_name=app_name,
                    summary=summary,
                    body=body,
                    is_important=is_important,
                )
                await broadcast_state()
            elif msg_type == "update":
                state.update_tab(data)
                await broadcast_tabs()
            elif msg_type == "remove":
                app_id = data.get("appId", "")
                state.remove_tab(app_id, data.get("tabId", 0))
                if app_id == "spotify-web":
                    spotify_listener.set_unavailable()
                    await broadcast_spotify()
                await broadcast_tabs()

            elif msg_type == "focus_ack":
                # Forward focus ack from extension to all dashboards
                payload = {
                    "type": "focus_ack",
                    "appId": data.get("appId", ""),
                    "success": data.get("success", False),
                }
                await _broadcast(_dashboard_conns, payload)

            elif msg_type == "spotify_state":
                # Spotify web player state from extension content script
                state_data = data.get("state", {})
                spotify_listener.update_state(state_data)
                await broadcast_spotify()

            elif msg_type == "ping":
                # Keepalive — no action needed
                pass

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
                row_id = data.get("id")
                if row_id is not None:
                    # Close GNOME notification before marking read
                    from action_invoker import close_notification_sync
                    notif = db.get_notification(row_id)
                    ok = db.mark_read(row_id)
                    if ok:
                        if notif and notif.notif_id is not None:
                            close_notification_sync(notif.notif_id)
                        await broadcast_notification_read(row_id)

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
                    # Forward to extension for execution in web player
                    await _broadcast(_extension_conns, {
                        "type": "spotify_command",
                        "command": command,
                    })

            elif action.startswith("todo_") or action.startswith("subtask_"):
                await _handle_todo_action(websocket, data)

            elif action == "focus":
                app_id = data.get("appId", "")
                notif_id = data.get("notifId")  # D-Bus notification ID for deep-linking
                logger.info(f"Dashboard → focus: app={app_id} notif_id={notif_id}")
                app_config = config.get(app_id)
                if app_config is None:
                    await _send(websocket, {"type": "focus_ack", "appId": app_id, "success": False})
                    continue

                # Try D-Bus action invocation first (deep-link to specific chat)
                action_invoked = False
                if notif_id is not None:
                    from action_invoker import invoke_action_sync
                    action_invoked = invoke_action_sync(notif_id, "default")
                    if action_invoked:
                        logger.info(f"Deep-linked via ActionInvoked: app={app_id} notif_id={notif_id}")

                if app_config.type == "browser":
                    # Always send extension tab focus — ActionInvoked handles deep-linking
                    # (opening the specific channel), while the extension tab focus handles
                    # switching to the correct tab and window. They complement each other.
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
                        # Extension handles window focus via chrome.windows.update
                        # (xdg-activation on Wayland). No need for a blind fallback
                        # that finds the wrong browser window.

                    await _send(websocket, {
                        "type": "focus_ack",
                        "appId": app_id,
                        "success": True,
                    })
                else:
                    # Native app: try action invocation first, then focus window
                    # and switch to its workspace so the user lands on the right desktop
                    wm_class = app_config.windowClass
                    desktop_id = app_config.desktopId
                    if wm_class:
                        success = wm.focus_window_by_class_and_switch(wm_class, desktop_id)
                    else:
                        success = False
                    await _send(websocket, {"type": "focus_ack", "appId": app_id, "success": success})

                # Close GNOME notification to keep 1:1 sync with Birdeye
                if notif_id is not None:
                    from action_invoker import close_notification_sync
                    close_notification_sync(notif_id)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"Dashboard WS error: {e}")
    finally:
        _dashboard_conns.discard(websocket)

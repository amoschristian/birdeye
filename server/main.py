import asyncio
import logging
import signal
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from config_loader import config
import db
from monitor import system_monitor
import notif_banner
from dbus_listener import DBusListener
from spotify import spotify_listener
from cal_listener import calendar_listener
from notif_importance import classify_importance
import state
from ws import router as ws_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(name)s: %(message)s")
logger = logging.getLogger(__name__)

listener = DBusListener()
_shutting_down = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    global _shutting_down

    # ── Startup ────────────────────────────────────────────────────
    logger.info("Starting Birdeye server...")

    # Load config
    config.load()
    logger.info(f"Loaded {len(config.apps)} app(s)")

    # Suppress native notification banners
    notif_banner.suppress_native_banners()

    # Start D-Bus listener (non-blocking)
    listener.set_loop(asyncio.get_event_loop())
    listener.start()

    # Bridge D-Bus notifications into our event loop
    async def _bridge_dbus():
        async for notif in listener.notifications():
            if _shutting_down:
                break
            # Map D-Bus app_name to our app_id
            app_name = notif.get("app_name", "")
            summary = notif.get("summary", "")
            body = notif.get("body", "")
            app = None
            for a in config.apps.values():
                if a.name.lower() == app_name.lower():
                    app = a
                    break
                if a.windowClass and a.windowClass.lower().replace(" ", "") in app_name.lower().replace(" ", ""):
                    app = a
                    break

            # Fallback: try keyword matching (for browser apps that come through
            # D-Bus with the browser's name instead of the web app's name)
            if app is None:
                # First: check if body starts with an origin domain (Chromium puts
                # the origin as the first line of the body, e.g. "discord.com\n\nmsg")
                origin_line = body.split("\n")[0].strip() if body else ""
                for a in config.apps.values():
                    if a.domain and a.domain in origin_line:
                        app = a
                        logger.info(f"D-Bus browser notif attributed to {a.id} via origin domain")
                        break
                # Second: keyword matching against summary + body
                if app is None:
                    combined = f"{summary} {body}".lower()
                    for a in config.apps.values():
                        for kw in a.matchKeywords:
                            if kw.lower() in combined:
                                app = a
                                break
                        if app:
                            break

            # Fallback 2: if still no match and it's from a browser, check tracked
            # tabs. Chrome delivers web notifications via D-Bus with the browser's
            # name. Try to attribute to the right browser tab.
            from dbus_listener import _is_browser_notification
            desktop_entry = notif.get("desktop_entry", "")
            is_browser = _is_browser_notification(app_name, desktop_entry)
            if app is None and is_browser:
                import state as tab_state
                browser_apps = [a for a in config.apps.values() if a.type == "browser"]
                tracked = tab_state.get_all()
                # First: try to match notification summary against tracked tab titles
                summary_lower = summary.lower()
                for t in tracked:
                    matching = next((a for a in browser_apps if a.id == t.app_id), None)
                    if matching and t.title and summary_lower in t.title.lower():
                        app = matching
                        logger.info(f"D-Bus browser notif attributed to {matching.id} via title match")
                        break
                # Second: prefer tabs with unread > 0 (notification likely came from active conversation)
                if app is None:
                    best_app = None
                    best_time = 0.0
                    best_has_unread = False
                    for t in tracked:
                        matching = next((a for a in browser_apps if a.id == t.app_id), None)
                        if not matching:
                            continue
                        has_unread = t.unread > 0
                        # Prefer unread tabs; tiebreak by recency
                        if has_unread and not best_has_unread:
                            best_app = matching
                            best_time = t.last_time
                            best_has_unread = True
                        elif has_unread == best_has_unread and t.last_time > best_time:
                            best_app = matching
                            best_time = t.last_time
                    if best_app:
                        app = best_app
                        logger.info(f"D-Bus browser notif attributed to {app.id} via tab heuristic (unread={best_has_unread})")

            app_id = app.id if app else app_name.lower().replace(" ", "-")
            app_name_display = app.name if app else app_name

            # Last resort: unmatched browser notification — attribute to the most
            # recently active browser app instead of dropping.
            if app is None and is_browser:
                import state as tab_state
                browser_apps = [a for a in config.apps.values() if a.type == "browser"]
                tracked = tab_state.get_all()
                # Pick most recent tracked browser tab, or first enabled browser app
                best_app = None
                best_time = 0.0
                for t in tracked:
                    matching = next((a for a in browser_apps if a.id == t.app_id), None)
                    if matching and t.last_time > best_time:
                        best_app = matching
                        best_time = t.last_time
                if best_app is None and browser_apps:
                    best_app = browser_apps[0]
                if best_app:
                    app = best_app
                    app_id = app.id
                    app_name_display = app.name
                    logger.info(f"D-Bus browser notif fallback → {app.id}")
                else:
                    continue

            # Persist to SQLite
            summary = notif.get("summary", "")
            body = notif.get("body", "")
            is_important = classify_importance(app_id, app_name_display, summary, body)
            notification = db.db.create_notification(
                app_id=app_id,
                app_name=app_name_display,
                summary=summary,
                body=body,
                notif_id=notif.get("notif_id"),
                x_shell_sender=notif.get("x_shell_sender", ""),
                is_important=is_important,
            )
            logger.info(f"D-Bus → app_id={app_id} app_name={app_name_display} "
                       f"summary=\"{summary[:40]}\" "
                       f"body=\"{body[:40]}\" "
                       f"notif_id={notif.get('notif_id')} "
                       f"important={is_important} "
                       f"saved={'yes' if notification else 'no'}")
            if notification:
                # Broadcast to dashboards
                from ws import broadcast_notification
                await broadcast_notification(notification)

    bridge_task = asyncio.create_task(_bridge_dbus())

    # Start system resource monitor
    await system_monitor.start()

    # Bridge monitor broadcasts to dashboards
    async def _bridge_monitor():
        while not _shutting_down:
            await asyncio.sleep(2)
            from ws import broadcast_monitor
            await broadcast_monitor()

    monitor_bridge_task = asyncio.create_task(_bridge_monitor())

    # Bridge spotify position extrapolation to dashboards (1s interval)
    async def _bridge_spotify():
        while not _shutting_down:
            await asyncio.sleep(1)
            spotify_listener.check_stale(timeout_seconds=10.0)
            if spotify_listener.get_state().get("available"):
                from ws import broadcast_spotify
                await broadcast_spotify()

    spotify_bridge_task = asyncio.create_task(_bridge_spotify())

    # Start calendar listener
    await calendar_listener.start()

    # Bridge calendar broadcasts to dashboards (re-scan + broadcast every 60s)
    async def _bridge_calendar():
        while not _shutting_down:
            await asyncio.sleep(60)
            await calendar_listener._poll()
            from ws import broadcast_calendar
            await broadcast_calendar()

    calendar_bridge_task = asyncio.create_task(_bridge_calendar())

    # Bridge todo reminders to dashboards (30s poll, restart-safe)
    async def _bridge_todo_reminders():
        while not _shutting_down:
            try:
                from ws import broadcast_todo_reminder
                due = db.db.get_due_reminders()
                for t in due:
                    await broadcast_todo_reminder(t)
                    db.db.mark_reminded(t.id)
            except Exception as e:
                logger.warning(f"todo reminder worker error: {e}")
            await asyncio.sleep(30)

    todo_reminder_task = asyncio.create_task(_bridge_todo_reminders())

    # Send initial calendar state to new dashboards
    from ws import broadcast_calendar
    await broadcast_calendar()

    yield  # ── Server running ──

    # ── Shutdown ───────────────────────────────────────────────────
    _shutting_down = True
    logger.info("Shutting down Birdeye server...")

    bridge_task.cancel()
    try:
        await bridge_task
    except asyncio.CancelledError:
        pass

    monitor_bridge_task.cancel()
    try:
        await monitor_bridge_task
    except asyncio.CancelledError:
        pass

    spotify_bridge_task.cancel()
    try:
        await spotify_bridge_task
    except asyncio.CancelledError:
        pass

    calendar_bridge_task.cancel()
    try:
        await calendar_bridge_task
    except asyncio.CancelledError:
        pass

    todo_reminder_task.cancel()
    try:
        await todo_reminder_task
    except asyncio.CancelledError:
        pass

    await system_monitor.stop()
    # spotify_listener no longer uses D-Bus — no stop needed
    await calendar_listener.stop()

    listener.stop()
    notif_banner.restore_native_banners()
    logger.info("Shutdown complete")


app = FastAPI(title="Birdeye", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_router)


@app.get("/api/apps")
async def get_apps():
    """Return enabled app configs (for dashboard to render app buttons)."""
    return config.to_dict()


@app.get("/api/state")
async def get_state():
    """Return current tab state (for backward compat)."""
    return [t.model_dump() for t in state.get_all()]


@app.get("/api/notifications")
async def get_notifications(limit: int = 200):
    """Return recent notifications from SQLite."""
    return [n.__dict__ for n in db.db.get_all(limit=limit)]


@app.post("/api/control")
async def control(request: Request):
    body = await request.json()
    action = body.get("action")

    if action == "focus":
        tab_id = body.get("tabId")
        window_id = body.get("windowId")
        return {"ok": True, "action": "focus", "tabId": tab_id, "windowId": window_id}

    return JSONResponse({"ok": False, "error": "unknown_action"}, status_code=400)


# Serve dashboard static files
STATIC_DIR = Path(__file__).resolve().parent.parent / "dashboard" / "dist"
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
else:
    logger.warning(f"Dashboard dist not found at {STATIC_DIR}")

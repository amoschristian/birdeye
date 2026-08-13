import calendar
import datetime
import json
import logging
import sqlite3
import time
import uuid
from pathlib import Path
from dataclasses import dataclass

from dateparser.search import search_dates

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parent / "birdeye.db"
_RETENTION_SECONDS = 7 * 24 * 60 * 60  # 7 days


@dataclass
class Notification:
    id: int
    app_id: str
    app_name: str
    summary: str
    body: str
    is_read: bool
    created_at: float
    notif_id: int | None = None
    x_shell_sender: str = ""
    is_important: bool = False


@dataclass
class Todo:
    id: int
    text: str
    completed: bool
    order_index: int
    created_at: float
    due_date: str | None
    priority: str
    status: str = "inbox"
    notes: str = ""
    project: str = ""
    estimate_minutes: int | None = None
    scheduled_date: str | None = None
    scheduled_time: str | None = None
    reminder_at: float | None = None
    last_reminded_at: float | None = None
    repeat_rule: str | None = None
    series_id: str | None = None
    occurrence_number: int = 1
    source_app: str | None = None
    source_sender: str | None = None
    source_url: str | None = None
    source_notification_id: int | None = None
    archived_at: float | None = None


@dataclass
class Subtask:
    id: int
    todo_id: int
    text: str
    completed: bool
    order_index: int
    created_at: float


class Database:
    def __init__(self, path: str | Path = DB_PATH):
        self._path = str(path)
        self._conn: sqlite3.Connection | None = None
        self._usable = True

    def _connect(self) -> sqlite3.Connection:
        if self._conn is None:
            try:
                self._conn = sqlite3.connect(self._path)
                self._conn.row_factory = sqlite3.Row
                self._conn.execute("PRAGMA journal_mode=WAL")
                self._conn.execute("PRAGMA foreign_keys=ON")
                self._init_schema()
            except sqlite3.Error as e:
                logger.error(f"SQLite connection failed: {e}")
                self._usable = False
                raise
        return self._conn

    def _init_schema(self):
        assert self._conn is not None
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_id TEXT NOT NULL,
                app_name TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                body TEXT DEFAULT '',
                is_read INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                notif_id INTEGER,
                x_shell_sender TEXT DEFAULT '',
                is_important INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_notifications_app_id
                ON notifications(app_id);
            CREATE INDEX IF NOT EXISTS idx_notifications_created_at
                ON notifications(created_at);

            CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                order_index INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                due_date TEXT,
                priority TEXT NOT NULL DEFAULT 'medium',
                status TEXT NOT NULL DEFAULT 'inbox',
                notes TEXT NOT NULL DEFAULT '',
                project TEXT NOT NULL DEFAULT '',
                estimate_minutes INTEGER,
                scheduled_date TEXT,
                scheduled_time TEXT,
                reminder_at REAL,
                last_reminded_at REAL,
                repeat_rule TEXT,
                series_id TEXT,
                occurrence_number INTEGER NOT NULL DEFAULT 1,
                source_app TEXT,
                source_sender TEXT,
                source_url TEXT,
                source_notification_id INTEGER,
                archived_at REAL
            );

            CREATE TABLE IF NOT EXISTS subtasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                order_index INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id
                ON subtasks(todo_id);
        """)
        self._conn.commit()

    @property
    def usable(self) -> bool:
        return self._usable

    def create_notification(
        self, app_id: str, app_name: str, summary: str = "", body: str = "",
        notif_id: int | None = None, x_shell_sender: str = "",
        is_important: bool = False,
    ) -> Notification | None:
        if not self._usable:
            return None
        try:
            # Migrate: add columns if they don't exist yet
            for col, col_type in [("notif_id", "INTEGER"), ("x_shell_sender", "TEXT DEFAULT ''"), ("is_important", "INTEGER NOT NULL DEFAULT 0")]:
                try:
                    conn = self._connect()
                    conn.execute(f"ALTER TABLE notifications ADD COLUMN {col} {col_type}")
                    conn.commit()
                except sqlite3.OperationalError:
                    pass

            conn = self._connect()
            now = time.time()
            cur = conn.execute(
                "INSERT INTO notifications (app_id, app_name, summary, body, created_at, notif_id, x_shell_sender, is_important) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (app_id, app_name, summary, body, now, notif_id, x_shell_sender, int(is_important)),
            )
            row_id = cur.lastrowid
            self._cleanup_old(conn)
            conn.commit()
            return Notification(
                id=row_id,
                app_id=app_id,
                app_name=app_name,
                summary=summary,
                body=body,
                is_read=False,
                created_at=now,
                notif_id=notif_id,
                x_shell_sender=x_shell_sender,
                is_important=is_important,
            )
        except sqlite3.Error as e:
            logger.error(f"create_notification failed: {e}")
            self._usable = False
            return None

    def get_notification(self, notification_id: int) -> Notification | None:
        """Get a single notification by its SQLite row ID."""
        if not self._usable:
            return None
        try:
            conn = self._connect()
            row = conn.execute(
                "SELECT id, app_id, app_name, summary, body, is_read, created_at, "
                "COALESCE(notif_id, NULL) AS notif_id, "
                "COALESCE(x_shell_sender, '') AS x_shell_sender, "
                "COALESCE(is_important, 0) AS is_important "
                "FROM notifications WHERE id=?",
                (notification_id,),
            ).fetchone()
            if not row:
                return None
            return Notification(
                id=row["id"],
                app_id=row["app_id"],
                app_name=row["app_name"],
                summary=row["summary"],
                body=row["body"],
                is_read=bool(row["is_read"]),
                created_at=row["created_at"],
                notif_id=row["notif_id"],
                x_shell_sender=row["x_shell_sender"] or "",
                is_important=bool(row["is_important"]),
            )
        except sqlite3.Error as e:
            logger.error(f"get_notification({notification_id}) failed: {e}")
            return None

    def mark_read(self, notification_id: int) -> bool:
        if not self._usable:
            return False
        try:
            conn = self._connect()
            cur = conn.execute(
                "UPDATE notifications SET is_read=1 WHERE id=?",
                (notification_id,),
            )
            conn.commit()
            return cur.rowcount > 0
        except sqlite3.Error as e:
            logger.error(f"mark_read failed: {e}")
            return False

    def get_all(self, limit: int = 200) -> list[Notification]:
        if not self._usable:
            return []
        try:
            conn = self._connect()
            rows = conn.execute(
                "SELECT id, app_id, app_name, summary, body, is_read, created_at, "
                "COALESCE(notif_id, NULL) AS notif_id, "
                "COALESCE(x_shell_sender, '') AS x_shell_sender, "
                "COALESCE(is_important, 0) AS is_important "
                "FROM notifications ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [
                Notification(
                    id=r["id"],
                    app_id=r["app_id"],
                    app_name=r["app_name"],
                    summary=r["summary"],
                    body=r["body"],
                    is_read=bool(r["is_read"]),
                    created_at=r["created_at"],
                    notif_id=r["notif_id"],
                    x_shell_sender=r["x_shell_sender"] or "",
                    is_important=bool(r["is_important"]),
                )
                for r in rows
            ]
        except sqlite3.Error as e:
            logger.error(f"get_all failed: {e}")
            return []

    def get_unread_count(self, app_id: str) -> int:
        if not self._usable:
            return 0
        try:
            conn = self._connect()
            row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM notifications "
                "WHERE app_id=? AND is_read=0",
                (app_id,),
            ).fetchone()
            return row["cnt"] if row else 0
        except sqlite3.Error as e:
            logger.error(f"get_unread_count failed: {e}")
            return 0

    def get_unread_counts_per_app(self) -> dict[str, int]:
        """Return {app_id: unread_count} for all apps with unread notifications."""
        if not self._usable:
            return {}
        try:
            conn = self._connect()
            rows = conn.execute(
                "SELECT app_id, COUNT(*) AS cnt FROM notifications "
                "WHERE is_read=0 GROUP BY app_id"
            ).fetchall()
            return {r["app_id"]: r["cnt"] for r in rows}
        except sqlite3.Error as e:
            logger.error(f"get_unread_counts_per_app failed: {e}")
            return {}

    def mark_all_read(self, app_id: str | None = None) -> int:
        """Mark all unread notifications as read. Optionally filter by app_id."""
        if not self._usable:
            return 0
        try:
            conn = self._connect()
            if app_id:
                cur = conn.execute(
                    "UPDATE notifications SET is_read=1 WHERE is_read=0 AND app_id=?",
                    (app_id,),
                )
            else:
                cur = conn.execute(
                    "UPDATE notifications SET is_read=1 WHERE is_read=0"
                )
            conn.commit()
            count = cur.rowcount
            if count > 0:
                logger.info(f"Marked {count} notification(s) as read")
            return count
        except sqlite3.Error as e:
            logger.error(f"mark_all_read failed: {e}")
            return 0

    def clear_read(self) -> int:
        """Delete all read notifications. Returns count of deleted rows."""
        if not self._usable:
            return 0
        try:
            conn = self._connect()
            cur = conn.execute("DELETE FROM notifications WHERE is_read=1")
            conn.commit()
            count = cur.rowcount
            if count > 0:
                logger.info(f"Cleared {count} read notification(s)")
            return count
        except sqlite3.Error as e:
            logger.error(f"clear_read failed: {e}")
            return 0

    def _cleanup_old(self, conn: sqlite3.Connection):
        cutoff = time.time() - _RETENTION_SECONDS
        conn.execute("DELETE FROM notifications WHERE created_at < ?", (cutoff,))

    # ── Todos ─────────────────────────────────────────────────────

    def _ensure_todos_table(self):
        """Ensure the todos table exists and has all required columns."""
        try:
            conn = self._connect()
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS todos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    text TEXT NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 0,
                    order_index INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL,
                    due_date TEXT,
                    priority TEXT NOT NULL DEFAULT 'medium',
                    status TEXT NOT NULL DEFAULT 'inbox',
                    notes TEXT NOT NULL DEFAULT '',
                    project TEXT NOT NULL DEFAULT '',
                    estimate_minutes INTEGER,
                    scheduled_date TEXT,
                    scheduled_time TEXT,
                    reminder_at REAL,
                    last_reminded_at REAL,
                    repeat_rule TEXT,
                    series_id TEXT,
                    occurrence_number INTEGER NOT NULL DEFAULT 1,
                    source_app TEXT,
                    source_sender TEXT,
                    source_url TEXT,
                    source_notification_id INTEGER,
                    archived_at REAL
                );
            """)
            # Migrations: add columns if they don't exist yet
            existing = {r[1] for r in conn.execute("PRAGMA table_info(todos)").fetchall()}
            for col, col_def in [
                ("due_date", "TEXT"),
                ("priority", "TEXT NOT NULL DEFAULT 'medium'"),
                ("status", "TEXT NOT NULL DEFAULT 'inbox'"),
                ("notes", "TEXT NOT NULL DEFAULT ''"),
                ("project", "TEXT NOT NULL DEFAULT ''"),
                ("estimate_minutes", "INTEGER"),
                ("scheduled_date", "TEXT"),
                ("scheduled_time", "TEXT"),
                ("reminder_at", "REAL"),
                ("last_reminded_at", "REAL"),
                ("repeat_rule", "TEXT"),
                ("series_id", "TEXT"),
                ("occurrence_number", "INTEGER NOT NULL DEFAULT 1"),
                ("source_app", "TEXT"),
                ("source_sender", "TEXT"),
                ("source_url", "TEXT"),
                ("source_notification_id", "INTEGER"),
                ("archived_at", "REAL"),
            ]:
                if col not in existing:
                    conn.execute(f"ALTER TABLE todos ADD COLUMN {col} {col_def}")

            # One-time backfill for legacy rows (user_version gate prevents re-runs)
            version = conn.execute("PRAGMA user_version").fetchone()[0]
            if version < 2:
                conn.execute("UPDATE todos SET status='completed' WHERE status='inbox' AND completed=1")
                conn.execute(
                    "UPDATE todos SET status='active' WHERE status='inbox' AND completed=0 "
                    "AND (due_date IS NOT NULL OR priority != 'medium')"
                )
                conn.execute("PRAGMA user_version = 2")
            conn.commit()
        except sqlite3.Error as e:
            logger.error(f"_ensure_todos_table failed: {e}")

    # Words that match typical date indicators — used to filter false positives
    _DATE_WORDS = {
        'today', 'tomorrow', 'yesterday',
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
        'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december',
        'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
        'next', 'last', 'this',
    }

    @staticmethod
    def _parse_todo_meta(text: str) -> tuple[str, str | None, str]:
        """Parse natural language date and !priority tags from todo text.

        Returns (clean_text, due_date, priority).
        Priority tags: !high/!h, !medium/!m, !low/!l (case-insensitive, last win).
        Date: parsed from remaining text via dateparser.search_dates.
        """
        import re

        priority = "medium"

        # Extract priority tags — last one wins
        for match in re.finditer(r'!\s*(high|h|medium|m|low|l)\b', text, re.IGNORECASE):
            tag = match.group(1).lower()
            if tag in ('high', 'h'):
                priority = 'high'
            elif tag in ('medium', 'm'):
                priority = 'medium'
            elif tag in ('low', 'l'):
                priority = 'low'

        # Remove all priority tags from text
        clean = re.sub(r'!\s*(high|h|medium|m|low|l)\b', '', text, flags=re.IGNORECASE).strip()
        # Collapse multiple spaces
        clean = re.sub(r'\s+', ' ', clean).strip()

        # Parse date from clean text using search_dates
        due_date = None
        if clean:
            results = search_dates(clean, settings={'PREFER_DATES_FROM': 'future'})
            if results:
                for substr, dt in results:
                    # Filter false positives: substring must contain a date-indicator word
                    # or contain a digit (handles "in 3 days", "Apr 15", "15/04", etc.)
                    words_set = set(substr.lower().split())
                    has_date_word = bool(words_set & Database._DATE_WORDS)
                    has_digit = bool(re.search(r'\d', substr))
                    if has_date_word or has_digit:
                        due_date = dt.strftime('%Y-%m-%d')
                        # Remove the matched date substring from the text
                        clean = clean.replace(substr, '', 1).strip()
                        clean = re.sub(r'\s+', ' ', clean).strip()
                        break

        return clean, due_date, priority

    def create_todo(self, text: str) -> Todo | None:
        if not self._usable:
            return None
        self._ensure_todos_table()
        try:
            clean_text, due_date, priority = self._parse_todo_meta(text)
            if not clean_text:
                return None
            conn = self._connect()
            return self._insert_todo(
                conn, text=clean_text, due_date=due_date, priority=priority
            )
        except sqlite3.Error as e:
            logger.error(f"create_todo failed: {e}")
            return None

    def _insert_todo(self, conn: sqlite3.Connection, *, text: str, order_index: int | None = None,
                     due_date: str | None = None, priority: str = "medium", status: str = "inbox",
                     notes: str = "", project: str = "", estimate_minutes: int | None = None,
                     scheduled_date: str | None = None, scheduled_time: str | None = None,
                     reminder_at: float | None = None, repeat_rule: str | None = None,
                     series_id: str | None = None, occurrence_number: int = 1,
                     source_app: str | None = None, source_sender: str | None = None,
                     source_url: str | None = None,
                     source_notification_id: int | None = None) -> Todo | None:
        """Insert a todo row and return it. Shared by create_todo and recurrence rolls."""
        if order_index is None:
            row = conn.execute(
                "SELECT COALESCE(MAX(order_index), -1) AS mx FROM todos"
            ).fetchone()
            order_index = (row["mx"] if row else -1) + 1
        now = time.time()
        sid = series_id or uuid.uuid4().hex
        cur = conn.execute(
            "INSERT INTO todos (text, order_index, created_at, due_date, priority, status, "
            "notes, project, estimate_minutes, scheduled_date, scheduled_time, reminder_at, "
            "repeat_rule, series_id, occurrence_number, source_app, source_sender, source_url, "
            "source_notification_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (text, order_index, now, due_date, priority, status, notes, project,
             estimate_minutes, scheduled_date, scheduled_time, reminder_at, repeat_rule,
             sid, occurrence_number, source_app, source_sender, source_url,
             source_notification_id),
        )
        conn.commit()
        return self._fetch_todo(conn, cur.lastrowid)

    def _row_to_todo(self, row: sqlite3.Row) -> Todo:
        status = row["status"] if "status" in row.keys() else (
            "completed" if row["completed"] else "inbox"
        )
        return Todo(
            id=row["id"],
            text=row["text"],
            completed=status == "completed",
            order_index=row["order_index"],
            created_at=row["created_at"],
            due_date=row["due_date"] if row["due_date"] else None,
            priority=row["priority"] if row["priority"] else "medium",
            status=status,
            notes=row["notes"] if "notes" in row.keys() else "",
            project=row["project"] if "project" in row.keys() else "",
            estimate_minutes=row["estimate_minutes"] if "estimate_minutes" in row.keys() else None,
            scheduled_date=row["scheduled_date"] if "scheduled_date" in row.keys() else None,
            scheduled_time=row["scheduled_time"] if "scheduled_time" in row.keys() else None,
            reminder_at=row["reminder_at"] if "reminder_at" in row.keys() else None,
            last_reminded_at=row["last_reminded_at"] if "last_reminded_at" in row.keys() else None,
            repeat_rule=row["repeat_rule"] if "repeat_rule" in row.keys() else None,
            series_id=row["series_id"] if "series_id" in row.keys() else None,
            occurrence_number=row["occurrence_number"] if "occurrence_number" in row.keys() else 1,
            source_app=row["source_app"] if "source_app" in row.keys() else None,
            source_sender=row["source_sender"] if "source_sender" in row.keys() else None,
            source_url=row["source_url"] if "source_url" in row.keys() else None,
            source_notification_id=row["source_notification_id"]
            if "source_notification_id" in row.keys() else None,
            archived_at=row["archived_at"] if "archived_at" in row.keys() else None,
        )

    def _fetch_todo(self, conn: sqlite3.Connection, todo_id: int) -> Todo | None:
        row = conn.execute(
            "SELECT * FROM todos WHERE id = ?",
            (todo_id,),
        ).fetchone()
        return self._row_to_todo(row) if row else None

    def _apply_status(self, conn: sqlite3.Connection, todo_id: int, status: str) -> Todo | None:
        """Set lifecycle status and keep the legacy `completed` column in sync."""
        completed = 1 if status == "completed" else 0
        archived_at = time.time() if status == "archived" else None
        conn.execute(
            "UPDATE todos SET status=?, completed=?, archived_at=? WHERE id=?",
            (status, completed, archived_at, todo_id),
        )
        conn.commit()
        return self._fetch_todo(conn, todo_id)

    def toggle_todo(self, todo_id: int) -> Todo | None:
        """Complete or reopen a todo. Recurring todos roll to their next occurrence."""
        if not self._usable:
            return None
        self._ensure_todos_table()
        try:
            conn = self._connect()
            todo = self._fetch_todo(conn, todo_id)
            if not todo:
                return None
            if todo.status == "completed":
                return self._apply_status(conn, todo_id, "active")
            return self._complete_todo(conn, todo)
        except sqlite3.Error as e:
            logger.error(f"toggle_todo failed: {e}")
            return None

    def _complete_todo(self, conn: sqlite3.Connection, todo: Todo) -> Todo | None:
        """Mark complete; if recurring, archive and create the next occurrence."""
        if todo.repeat_rule:
            rule = self._validate_repeat_rule(todo.repeat_rule)
            if rule:
                base = todo.due_date or datetime.date.today().isoformat()
                next_due = self._next_occurrence(base, rule)
                if next_due:
                    self._apply_status(conn, todo.id, "archived")
                    # Shift absolute reminder to match the shifted due date
                    reminder_at = todo.reminder_at
                    if reminder_at is not None:
                        shift_days = (
                            datetime.date.fromisoformat(next_due)
                            - datetime.date.fromisoformat(base)
                        ).days
                        reminder_at = reminder_at + shift_days * 86400
                    new_todo = self._insert_todo(
                        conn,
                        text=todo.text,
                        due_date=next_due,
                        priority=todo.priority,
                        status="active",
                        notes=todo.notes,
                        project=todo.project,
                        estimate_minutes=todo.estimate_minutes,
                        scheduled_date=todo.scheduled_date,
                        scheduled_time=todo.scheduled_time,
                        reminder_at=reminder_at,
                        repeat_rule=todo.repeat_rule,
                        series_id=todo.series_id,
                        occurrence_number=(todo.occurrence_number or 1) + 1,
                        source_app=todo.source_app,
                        source_sender=todo.source_sender,
                        source_url=todo.source_url,
                        source_notification_id=todo.source_notification_id,
                    )
                    if new_todo:
                        # Copy subtasks (fresh, uncompleted)
                        for s in self.get_subtasks_for_todo(todo.id):
                            self.create_subtask(new_todo.id, s.text)
                        return new_todo
        return self._apply_status(conn, todo.id, "completed")

    def update_todo_text(self, todo_id: int, text: str) -> Todo | None:
        if not self._usable:
            return None
        self._ensure_todos_table()
        try:
            conn = self._connect()
            conn.execute(
                "UPDATE todos SET text = ? WHERE id = ?",
                (text, todo_id),
            )
            conn.commit()
            return self._fetch_todo(conn, todo_id)
        except sqlite3.Error as e:
            logger.error(f"update_todo_text failed: {e}")
            return None

    def update_todo_status(self, todo_id: int, status: str) -> Todo | None:
        if not self._usable:
            return None
        if status not in ("inbox", "active", "waiting", "completed", "archived"):
            return None
        self._ensure_todos_table()
        try:
            conn = self._connect()
            return self._apply_status(conn, todo_id, status)
        except sqlite3.Error as e:
            logger.error(f"update_todo_status failed: {e}")
            return None

    def update_todo_notes(self, todo_id: int, notes: str) -> Todo | None:
        if not self._usable:
            return None
        self._ensure_todos_table()
        try:
            conn = self._connect()
            conn.execute("UPDATE todos SET notes = ? WHERE id = ?", (notes, todo_id))
            conn.commit()
            return self._fetch_todo(conn, todo_id)
        except sqlite3.Error as e:
            logger.error(f"update_todo_notes failed: {e}")
            return None

    def update_todo_project(self, todo_id: int, project: str) -> Todo | None:
        if not self._usable:
            return None
        self._ensure_todos_table()
        try:
            conn = self._connect()
            conn.execute("UPDATE todos SET project = ? WHERE id = ?", (project, todo_id))
            conn.commit()
            return self._fetch_todo(conn, todo_id)
        except sqlite3.Error as e:
            logger.error(f"update_todo_project failed: {e}")
            return None

    def update_todo_estimate(self, todo_id: int, estimate_minutes: int | None) -> Todo | None:
        if not self._usable:
            return None
        if estimate_minutes is not None:
            try:
                estimate_minutes = int(estimate_minutes)
            except (TypeError, ValueError):
                return None
            if estimate_minutes < 0:
                return None
        self._ensure_todos_table()
        try:
            conn = self._connect()
            conn.execute(
                "UPDATE todos SET estimate_minutes = ? WHERE id = ?",
                (estimate_minutes, todo_id),
            )
            conn.commit()
            return self._fetch_todo(conn, todo_id)
        except sqlite3.Error as e:
            logger.error(f"update_todo_estimate failed: {e}")
            return None

    def update_todo_schedule(self, todo_id: int, scheduled_date: str | None,
                             scheduled_time: str | None) -> Todo | None:
        if not self._usable:
            return None
        if scheduled_date is not None:
            try:
                datetime.date.fromisoformat(scheduled_date)
            except ValueError:
                return None
        if scheduled_time is not None:
            if not (len(scheduled_time) == 5 and scheduled_time[2] == ":"
                    and scheduled_time[:2].isdigit() and scheduled_time[3:].isdigit()):
                return None
            hh, mm = int(scheduled_time[:2]), int(scheduled_time[3:])
            if hh > 23 or mm > 59:
                return None
        self._ensure_todos_table()
        try:
            conn = self._connect()
            conn.execute(
                "UPDATE todos SET scheduled_date = ?, scheduled_time = ? WHERE id = ?",
                (scheduled_date, scheduled_time, todo_id),
            )
            conn.commit()
            return self._fetch_todo(conn, todo_id)
        except sqlite3.Error as e:
            logger.error(f"update_todo_schedule failed: {e}")
            return None

    def update_todo_reminder(self, todo_id: int, reminder_at: float | None) -> Todo | None:
        """Set an absolute-epoch reminder. Changing it resets last_reminded_at."""
        if not self._usable:
            return None
        if reminder_at is not None:
            try:
                reminder_at = float(reminder_at)
            except (TypeError, ValueError):
                return None
        self._ensure_todos_table()
        try:
            conn = self._connect()
            conn.execute(
                "UPDATE todos SET reminder_at = ?, last_reminded_at = NULL WHERE id = ?",
                (reminder_at, todo_id),
            )
            conn.commit()
            return self._fetch_todo(conn, todo_id)
        except sqlite3.Error as e:
            logger.error(f"update_todo_reminder failed: {e}")
            return None

    def update_todo_repeat_rule(self, todo_id: int, repeat_rule: str | None) -> Todo | None:
        """Set a validated recurrence rule (JSON) or clear it with None."""
        if not self._usable:
            return None
        if repeat_rule is not None:
            rule = self._validate_repeat_rule(repeat_rule)
            if rule is None:
                return None
            repeat_rule = json.dumps(rule, separators=(",", ":"))
        self._ensure_todos_table()
        try:
            conn = self._connect()
            conn.execute("UPDATE todos SET repeat_rule = ? WHERE id = ?", (repeat_rule, todo_id))
            conn.commit()
            return self._fetch_todo(conn, todo_id)
        except sqlite3.Error as e:
            logger.error(f"update_todo_repeat_rule failed: {e}")
            return None

    def attach_todo_context(self, todo_id: int, source_app: str | None = None,
                            source_sender: str | None = None, source_url: str | None = None,
                            source_notification_id: int | None = None) -> Todo | None:
        """Attach manual source context. Never auto-invoked from notification text."""
        if not self._usable:
            return None
        self._ensure_todos_table()
        try:
            conn = self._connect()
            conn.execute(
                "UPDATE todos SET source_app = ?, source_sender = ?, source_url = ?, "
                "source_notification_id = ? WHERE id = ?",
                (source_app, source_sender, source_url, source_notification_id, todo_id),
            )
            conn.commit()
            return self._fetch_todo(conn, todo_id)
        except sqlite3.Error as e:
            logger.error(f"attach_todo_context failed: {e}")
            return None

    @staticmethod
    def _validate_repeat_rule(rule: str | dict) -> dict | None:
        """Validate a recurrence rule. Returns normalized dict or None if invalid."""
        try:
            data = json.loads(rule) if isinstance(rule, str) else rule
        except (ValueError, TypeError):
            return None
        if not isinstance(data, dict):
            return None
        freq = data.get("freq")
        if freq not in ("daily", "weekly", "monthly"):
            return None
        interval = data.get("interval", 1)
        if not isinstance(interval, int) or interval < 1:
            return None
        weekdays = data.get("weekdays")
        if weekdays is not None:
            if (not isinstance(weekdays, list) or freq != "weekly"
                    or not all(isinstance(w, int) and 0 <= w <= 6 for w in weekdays)
                    or not weekdays):
                return None
            weekdays = sorted(set(weekdays))
        end_date = data.get("end_date")
        if end_date is not None:
            try:
                datetime.date.fromisoformat(end_date)
            except (ValueError, TypeError):
                return None
        return {"freq": freq, "interval": interval, "weekdays": weekdays, "end_date": end_date}

    @staticmethod
    def _next_occurrence(due_date: str, rule: dict) -> str | None:
        """Compute the next due date from a validated rule. None = series ended."""
        try:
            d = datetime.date.fromisoformat(due_date)
        except ValueError:
            return None
        freq = rule.get("freq")
        interval = rule.get("interval", 1) or 1
        weekdays = rule.get("weekdays")
        if freq == "daily":
            nxt = d + datetime.timedelta(days=interval)
        elif freq == "weekly":
            if weekdays:
                nxt = d + datetime.timedelta(days=1)
                limit = interval * 7 + 1
                for _ in range(limit):
                    if nxt.weekday() in weekdays:
                        break
                    nxt += datetime.timedelta(days=1)
            else:
                nxt = d + datetime.timedelta(weeks=interval)
        elif freq == "monthly":
            total = d.year * 12 + (d.month - 1) + interval
            year, month0 = divmod(total, 12)
            month = month0 + 1
            last = calendar.monthrange(year, month)[1]
            nxt = datetime.date(year, month, min(d.day, last))
        else:
            return None
        end_date = rule.get("end_date")
        if end_date:
            try:
                if nxt.isoformat() > end_date:
                    return None
            except TypeError:
                pass
        return nxt.isoformat()

    def get_due_reminders(self, now_ts: float | None = None) -> list[Todo]:
        """Todos whose reminder is due and not yet fired for this reminder time."""
        if not self._usable:
            return []
        now = now_ts if now_ts is not None else time.time()
        self._ensure_todos_table()
        try:
            conn = self._connect()
            rows = conn.execute(
                "SELECT * FROM todos WHERE reminder_at IS NOT NULL AND reminder_at <= ? "
                "AND status NOT IN ('completed','archived') "
                "AND (last_reminded_at IS NULL OR last_reminded_at < reminder_at)",
                (now,),
            ).fetchall()
            return [self._row_to_todo(r) for r in rows]
        except sqlite3.Error as e:
            logger.error(f"get_due_reminders failed: {e}")
            return []

    def mark_reminded(self, todo_id: int, ts: float | None = None) -> bool:
        """Record that a reminder fired so it is not re-emitted."""
        if not self._usable:
            return False
        try:
            conn = self._connect()
            cur = conn.execute(
                "UPDATE todos SET last_reminded_at = ? WHERE id = ?",
                (ts if ts is not None else time.time(), todo_id),
            )
            conn.commit()
            return cur.rowcount > 0
        except sqlite3.Error as e:
            logger.error(f"mark_reminded failed: {e}")
            return False

    def update_todo_priority(self, todo_id: int, priority: str) -> Todo | None:
        if not self._usable:
            return None
        if priority not in ('high', 'medium', 'low'):
            return None
        self._ensure_todos_table()
        try:
            conn = self._connect()
            conn.execute("UPDATE todos SET priority = ? WHERE id = ?", (priority, todo_id))
            conn.commit()
            return self._fetch_todo(conn, todo_id)
        except sqlite3.Error as e:
            logger.error(f"update_todo_priority failed: {e}")
            return None

    def update_todo_due_date(self, todo_id: int, due_date: str | None) -> Todo | None:
        if not self._usable:
            return None
        if due_date is not None:
            try:
                datetime.date.fromisoformat(due_date)
            except ValueError:
                return None
        self._ensure_todos_table()
        try:
            conn = self._connect()
            conn.execute("UPDATE todos SET due_date = ? WHERE id = ?", (due_date, todo_id))
            conn.commit()
            return self._fetch_todo(conn, todo_id)
        except sqlite3.Error as e:
            logger.error(f"update_todo_due_date failed: {e}")
            return None

    def reorder_todo(self, todo_id: int, order_index: int) -> bool:
        if not self._usable:
            return False
        self._ensure_todos_table()
        try:
            conn = self._connect()
            cur = conn.execute(
                "UPDATE todos SET order_index = ? WHERE id = ?",
                (order_index, todo_id),
            )
            conn.commit()
            return cur.rowcount > 0
        except sqlite3.Error as e:
            logger.error(f"reorder_todo failed: {e}")
            return False

    def delete_todo(self, todo_id: int) -> bool:
        """Soft-delete: archive the todo instead of destroying it."""
        if not self._usable:
            return False
        self._ensure_todos_table()
        try:
            conn = self._connect()
            cur = conn.execute(
                "UPDATE todos SET status='archived', completed=0, archived_at=? WHERE id=?",
                (time.time(), todo_id),
            )
            conn.commit()
            return cur.rowcount > 0
        except sqlite3.Error as e:
            logger.error(f"delete_todo failed: {e}")
            return False

    def purge_todo(self, todo_id: int) -> bool:
        """Permanent delete (maintenance only — not exposed to the dashboard)."""
        if not self._usable:
            return False
        self._ensure_todos_table()
        try:
            conn = self._connect()
            conn.execute("DELETE FROM subtasks WHERE todo_id = ?", (todo_id,))
            cur = conn.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
            conn.commit()
            return cur.rowcount > 0
        except sqlite3.Error as e:
            logger.error(f"purge_todo failed: {e}")
            return False

    def get_all_todos(self) -> list[Todo]:
        if not self._usable:
            return []
        self._ensure_todos_table()
        try:
            conn = self._connect()
            rows = conn.execute(
                "SELECT * FROM todos WHERE status != 'archived' ORDER BY order_index ASC"
            ).fetchall()
            return [self._row_to_todo(r) for r in rows]
        except sqlite3.Error as e:
            logger.error(f"get_all_todos failed: {e}")
            return []


    # ── Subtasks ──────────────────────────────────────────────────

    def _ensure_subtasks_table(self):
        """Ensure the subtasks table exists."""
        try:
            conn = self._connect()
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS subtasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
                    text TEXT NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 0,
                    order_index INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id
                    ON subtasks(todo_id);
            """)
            conn.commit()
        except sqlite3.Error as e:
            logger.error(f"_ensure_subtasks_table failed: {e}")

    def _row_to_subtask(self, row: sqlite3.Row) -> Subtask:
        return Subtask(
            id=row["id"],
            todo_id=row["todo_id"],
            text=row["text"],
            completed=bool(row["completed"]),
            order_index=row["order_index"],
            created_at=row["created_at"],
        )

    def get_subtasks_for_todo(self, todo_id: int) -> list[Subtask]:
        """Return all subtasks for a given todo, ordered by order_index."""
        if not self._usable:
            return []
        self._ensure_subtasks_table()
        try:
            conn = self._connect()
            rows = conn.execute(
                "SELECT id, todo_id, text, completed, order_index, created_at "
                "FROM subtasks WHERE todo_id = ? ORDER BY order_index ASC",
                (todo_id,),
            ).fetchall()
            return [self._row_to_subtask(r) for r in rows]
        except sqlite3.Error as e:
            logger.error(f"get_subtasks_for_todo({todo_id}) failed: {e}")
            return []

    def get_all_subtasks(self) -> dict[int, list[Subtask]]:
        """Return all subtasks grouped by todo_id."""
        if not self._usable:
            return {}
        self._ensure_subtasks_table()
        try:
            conn = self._connect()
            rows = conn.execute(
                "SELECT id, todo_id, text, completed, order_index, created_at "
                "FROM subtasks ORDER BY todo_id, order_index ASC"
            ).fetchall()
            result: dict[int, list[Subtask]] = {}
            for r in rows:
                s = self._row_to_subtask(r)
                result.setdefault(s.todo_id, []).append(s)
            return result
        except sqlite3.Error as e:
            logger.error(f"get_all_subtasks failed: {e}")
            return {}

    def create_subtask(self, todo_id: int, text: str) -> Subtask | None:
        """Add a subtask to a todo. Max 20 per todo."""
        if not self._usable:
            return None
        if not text.strip():
            return None
        self._ensure_subtasks_table()
        try:
            conn = self._connect()
            # Check max count
            count_row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM subtasks WHERE todo_id = ?",
                (todo_id,),
            ).fetchone()
            if count_row and count_row["cnt"] >= 20:
                logger.warning(f"Todo {todo_id} already has 20 subtasks, max reached")
                return None
            # Verify the parent todo exists
            parent = conn.execute("SELECT id FROM todos WHERE id = ?", (todo_id,)).fetchone()
            if not parent:
                logger.warning(f"Todo {todo_id} not found, cannot add subtask")
                return None
            now = time.time()
            # Get next order_index
            order_row = conn.execute(
                "SELECT COALESCE(MAX(order_index), -1) AS mx FROM subtasks WHERE todo_id = ?",
                (todo_id,),
            ).fetchone()
            next_order = (order_row["mx"] if order_row else -1) + 1
            cur = conn.execute(
                "INSERT INTO subtasks (todo_id, text, order_index, created_at) "
                "VALUES (?, ?, ?, ?)",
                (todo_id, text.strip(), next_order, now),
            )
            conn.commit()
            return Subtask(
                id=cur.lastrowid,
                todo_id=todo_id,
                text=text.strip(),
                completed=False,
                order_index=next_order,
                created_at=now,
            )
        except sqlite3.Error as e:
            logger.error(f"create_subtask failed: {e}")
            return None

    def toggle_subtask(self, subtask_id: int) -> Subtask | None:
        """Toggle a subtask's completion status."""
        if not self._usable:
            return None
        self._ensure_subtasks_table()
        try:
            conn = self._connect()
            conn.execute(
                "UPDATE subtasks SET completed = 1 - completed WHERE id = ?",
                (subtask_id,),
            )
            conn.commit()
            row = conn.execute(
                "SELECT id, todo_id, text, completed, order_index, created_at "
                "FROM subtasks WHERE id = ?",
                (subtask_id,),
            ).fetchone()
            return self._row_to_subtask(row) if row else None
        except sqlite3.Error as e:
            logger.error(f"toggle_subtask failed: {e}")
            return None

    def update_subtask_text(self, subtask_id: int, text: str) -> Subtask | None:
        """Update a subtask's text."""
        if not self._usable:
            return None
        if not text.strip():
            return None
        self._ensure_subtasks_table()
        try:
            conn = self._connect()
            conn.execute(
                "UPDATE subtasks SET text = ? WHERE id = ?",
                (text.strip(), subtask_id),
            )
            conn.commit()
            row = conn.execute(
                "SELECT id, todo_id, text, completed, order_index, created_at "
                "FROM subtasks WHERE id = ?",
                (subtask_id,),
            ).fetchone()
            return self._row_to_subtask(row) if row else None
        except sqlite3.Error as e:
            logger.error(f"update_subtask_text failed: {e}")
            return None

    def delete_subtask(self, subtask_id: int) -> bool:
        """Delete a subtask."""
        if not self._usable:
            return False
        self._ensure_subtasks_table()
        try:
            conn = self._connect()
            cur = conn.execute("DELETE FROM subtasks WHERE id = ?", (subtask_id,))
            conn.commit()
            return cur.rowcount > 0
        except sqlite3.Error as e:
            logger.error(f"delete_subtask failed: {e}")
            return False

    def reorder_subtask(self, subtask_id: int, order_index: int) -> bool:
        """Update a subtask's order_index."""
        if not self._usable:
            return False
        self._ensure_subtasks_table()
        try:
            conn = self._connect()
            cur = conn.execute(
                "UPDATE subtasks SET order_index = ? WHERE id = ?",
                (order_index, subtask_id),
            )
            conn.commit()
            return cur.rowcount > 0
        except sqlite3.Error as e:
            logger.error(f"reorder_subtask failed: {e}")
            return False


db = Database()

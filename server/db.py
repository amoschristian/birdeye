import sqlite3
import time
import logging
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
                created_at REAL NOT NULL
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
                    created_at REAL NOT NULL
                );
            """)
            # Migrations: add columns if they don't exist yet
            for col, col_def in [
                ("due_date", "TEXT"),
                ("priority", "TEXT NOT NULL DEFAULT 'medium'"),
            ]:
                try:
                    conn.execute(f"ALTER TABLE todos ADD COLUMN {col} {col_def}")
                except sqlite3.OperationalError:
                    # Column already exists (or SQLite < 3.35) — check via pragma
                    existing = [r[1] for r in conn.execute("PRAGMA table_info(todos)").fetchall()]
                    if col not in existing:
                        conn.execute(f"ALTER TABLE todos ADD COLUMN {col} {col_def}")
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
            conn = self._connect()
            now = time.time()
            # Get next order_index
            row = conn.execute("SELECT COALESCE(MAX(order_index), -1) AS mx FROM todos").fetchone()
            next_order = (row["mx"] if row else -1) + 1
            cur = conn.execute(
                "INSERT INTO todos (text, order_index, created_at, due_date, priority) VALUES (?, ?, ?, ?, ?)",
                (clean_text, next_order, now, due_date, priority),
            )
            conn.commit()
            return Todo(
                id=cur.lastrowid,
                text=clean_text,
                completed=False,
                order_index=next_order,
                created_at=now,
                due_date=due_date,
                priority=priority,
            )
        except sqlite3.Error as e:
            logger.error(f"create_todo failed: {e}")
            return None

    def _row_to_todo(self, row: sqlite3.Row) -> Todo:
        return Todo(
            id=row["id"],
            text=row["text"],
            completed=bool(row["completed"]),
            order_index=row["order_index"],
            created_at=row["created_at"],
            due_date=row["due_date"] if row["due_date"] else None,
            priority=row["priority"] if row["priority"] else "medium",
        )

    def _fetch_todo(self, conn: sqlite3.Connection, todo_id: int) -> Todo | None:
        row = conn.execute(
            "SELECT id, text, completed, order_index, created_at, due_date, priority "
            "FROM todos WHERE id = ?",
            (todo_id,),
        ).fetchone()
        return self._row_to_todo(row) if row else None

    def toggle_todo(self, todo_id: int) -> Todo | None:
        if not self._usable:
            return None
        self._ensure_todos_table()
        try:
            conn = self._connect()
            conn.execute(
                "UPDATE todos SET completed = 1 - completed WHERE id = ?",
                (todo_id,),
            )
            conn.commit()
            return self._fetch_todo(conn, todo_id)
        except sqlite3.Error as e:
            logger.error(f"toggle_todo failed: {e}")
            return None

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
        if not self._usable:
            return False
        self._ensure_todos_table()
        try:
            conn = self._connect()
            # Delete subtasks first (ON DELETE CASCADE should handle this
            # but SQLite needs PRAGMA foreign_keys=ON at connect time, which
            # we already set, so cascade should work. Explicit delete anyway
            # for safety.)
            conn.execute("DELETE FROM subtasks WHERE todo_id = ?", (todo_id,))
            cur = conn.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
            conn.commit()
            return cur.rowcount > 0
        except sqlite3.Error as e:
            logger.error(f"delete_todo failed: {e}")
            return False

    def get_all_todos(self) -> list[Todo]:
        if not self._usable:
            return []
        self._ensure_todos_table()
        try:
            conn = self._connect()
            rows = conn.execute(
                "SELECT id, text, completed, order_index, created_at, due_date, priority "
                "FROM todos ORDER BY order_index ASC"
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

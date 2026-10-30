import datetime
import logging
import re
import sqlite3
import time
from pathlib import Path
from dataclasses import dataclass

from dateparser.search import search_dates

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parent / "birdeye.db"
_RETENTION_SECONDS = 7 * 24 * 60 * 60  # 7 days
# Decisions outlive the notifications they describe: they are the labelled
# history the attention thresholds get tuned against.
_DECISION_RETENTION_SECONDS = 90 * 24 * 60 * 60

_TIME_PATTERN = re.compile(
    r'(\d{1,2}:\d{2})'
    r'|\b(\d{1,2})\s*(am|pm)\b'
    r'|\b(noon|midnight)\b',
    re.IGNORECASE,
)


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
    needs_me: float | None = None
    urgency: float | None = None
    jev_model: str | None = None
    decided_at: float | None = None


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
    scheduled_date: str | None = None
    scheduled_time: str | None = None
    reminder_at: float | None = None
    last_reminded_at: float | None = None
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
                is_important INTEGER NOT NULL DEFAULT 0,
                needs_me REAL,
                urgency REAL,
                jev_model TEXT,
                decided_at REAL
            );

            -- Decision facts are kept longer than notifications: thresholds
            -- are tuned against them, and the row is pruned after 7 days.
            -- Never stores message content.
            CREATE TABLE IF NOT EXISTS decisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                notification_id INTEGER NOT NULL,
                app_id TEXT NOT NULL,
                needs_me REAL,
                urgency REAL,
                model TEXT,
                band TEXT NOT NULL,
                pin_needs_me REAL,
                pin_urgency REAL,
                scored_at REAL NOT NULL,
                action TEXT,
                action_at REAL
            );
            CREATE INDEX IF NOT EXISTS idx_decisions_scored_at
                ON decisions(scored_at);
            CREATE INDEX IF NOT EXISTS idx_decisions_notification_id
                ON decisions(notification_id);
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
                scheduled_date TEXT,
                scheduled_time TEXT,
                reminder_at REAL,
                last_reminded_at REAL,
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

        # Migration: decision facts on pre-existing notification rows.
        existing = {row[1] for row in self._conn.execute("PRAGMA table_info(notifications)")}
        for column, column_type in [
            ("needs_me", "REAL"),
            ("urgency", "REAL"),
            ("jev_model", "TEXT"),
            ("decided_at", "REAL"),
        ]:
            if column not in existing:
                self._conn.execute(f"ALTER TABLE notifications ADD COLUMN {column} {column_type}")

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
                "COALESCE(is_important, 0) AS is_important, "
                "needs_me, urgency, jev_model, decided_at "
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
                needs_me=row["needs_me"],
                urgency=row["urgency"],
                jev_model=row["jev_model"],
                decided_at=row["decided_at"],
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

    def set_notification_decision(self, notification_id: int, needs_me: float,
                                  urgency: float, model: str | None) -> Notification | None:
        """Store the raw decision facts. The first answer for a row wins."""
        if not self._usable:
            return None
        try:
            conn = self._connect()
            cursor = conn.execute(
                "UPDATE notifications SET needs_me=?, urgency=?, jev_model=?, decided_at=? "
                "WHERE id=? AND needs_me IS NULL",
                (needs_me, urgency, model, time.time(), notification_id),
            )
            conn.commit()
            if cursor.rowcount == 0:
                return None
            return self.get_notification(notification_id)
        except sqlite3.Error as e:
            logger.error(f"set_notification_decision({notification_id}) failed: {e}")
            return None

    def log_decision(self, *, notification_id: int, app_id: str, needs_me: float,
                     urgency: float, model: str | None, band: str,
                     pin_needs_me: float, pin_urgency: float) -> None:
        """Append the decision to the tuning log. Never stores message content."""
        if not self._usable:
            return
        try:
            conn = self._connect()
            now = time.time()
            conn.execute(
                "INSERT INTO decisions (notification_id, app_id, needs_me, urgency, "
                "model, band, pin_needs_me, pin_urgency, scored_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (notification_id, app_id, needs_me, urgency, model, band,
                 pin_needs_me, pin_urgency, now),
            )
            conn.execute("DELETE FROM decisions WHERE scored_at < ?",
                         (now - _DECISION_RETENTION_SECONDS,))
            conn.commit()
        except sqlite3.Error as e:
            logger.error(f"log_decision({notification_id}) failed: {e}")

    def record_decision_action(self, notification_id: int, action: str) -> None:
        """Record what the user did with the row — the label to tune against."""
        if not self._usable:
            return
        try:
            conn = self._connect()
            conn.execute(
                "UPDATE decisions SET action=?, action_at=? "
                "WHERE notification_id=? AND action IS NULL",
                (action, time.time(), notification_id),
            )
            conn.commit()
        except sqlite3.Error as e:
            logger.error(f"record_decision_action({notification_id}) failed: {e}")

    def delete_notification(self, notification_id: int) -> bool:
        """Remove a single notification permanently."""
        if not self._usable:
            return False
        try:
            conn = self._connect()
            cur = conn.execute("DELETE FROM notifications WHERE id=?", (notification_id,))
            conn.commit()
            return cur.rowcount > 0
        except sqlite3.Error as e:
            logger.error(f"delete_notification failed: {e}")
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
                "COALESCE(is_important, 0) AS is_important, "
                "needs_me, urgency, jev_model, decided_at "
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
                    needs_me=r["needs_me"],
                    urgency=r["urgency"],
                    jev_model=r["jev_model"],
                    decided_at=r["decided_at"],
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
                    scheduled_date TEXT,
                    scheduled_time TEXT,
                    reminder_at REAL,
                    last_reminded_at REAL,
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
                ("scheduled_date", "TEXT"),
                ("scheduled_time", "TEXT"),
                ("reminder_at", "REAL"),
                ("last_reminded_at", "REAL"),
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
        'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years',
    }

    @staticmethod
    def _parse_explicit_time(text: str) -> str | None:
        """Extract a wall-clock time from text as 'HH:MM'.

        Handles '10am', '10 pm', '2:30pm', '14:00', 'noon', 'midnight'.
        Done with our own regex because dateparser.search_dates v1.4.1
        mangles am/pm without a colon ('tomorrow 10am' → current wall-clock).
        """
        m = _TIME_PATTERN.search(text)
        if not m:
            return None
        if m.group(1):
            hh, mm = m.group(1).split(':')
            return f'{int(hh):02d}:{mm}'
        if m.group(4):
            return '12:00' if m.group(4).lower() == 'noon' else '00:00'
        h = int(m.group(2)) % 12
        if m.group(3).lower() == 'pm':
            h += 12
        return f'{h:02d}:00'

    _DATE_SHAPE = re.compile(r'\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}')

    @staticmethod
    def _is_date_candidate(substr: str) -> bool:
        """True when a search_dates hit is a genuine date expression.

        A hit must carry a date word (today/tomorrow/weekday/month/next…)
        or a date-shaped number ("2026-10-31", "31/10"). A bare month and a
        time-only hit ("oct", "2pm") are rejected: dateparser returns both
        when task text confuses its tokenizer.
        """
        stripped = substr.strip().lower().rstrip('.')
        if len(stripped) < 3:
            return False
        if stripped in Database._MONTHS:
            return False
        if _TIME_PATTERN.fullmatch(stripped):
            return False

        words = set(re.findall(r'[a-z]+', stripped))
        return bool(words & Database._DATE_WORDS) or bool(Database._DATE_SHAPE.search(stripped))

    _WEEKDAYS = {
        'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
        'friday': 4, 'saturday': 5, 'sunday': 6,
    }

    _MONTHS = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
        'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11,
        'december': 12, 'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    }

    @staticmethod
    def _month_day(month: int, day: int, matched: str, today: datetime.date):
        try:
            date = datetime.date(today.year, month, day)
        except ValueError:
            return None
        if date < today:
            try:
                date = datetime.date(today.year + 1, month, day)
            except ValueError:
                return None
        return date, matched

    @staticmethod
    def _find_relative_date(text: str, explicit_time: str | None):
        """Fallback for dateparser: it returns None when the text holds tokens
        like "test2", so common relative phrases are parsed here instead."""
        lower = text.lower()
        today = datetime.date.today()

        if 'day after tomorrow' in lower:
            return today + datetime.timedelta(days=2), 'day after tomorrow'

        for word in ('tomorrow', 'tmrw', 'tmr', 'tomorow'):
            if re.search(r'\b' + word + r'\b', lower):
                return today + datetime.timedelta(days=1), word

        for word in ('today', 'tonight'):
            if re.search(r'\b' + word + r'\b', lower):
                return today, word

        if re.search(r'\bnext week\b', lower):
            return today + datetime.timedelta(days=7), 'next week'

        match = re.search(r'\bin\s+(\d+)\s+(days?|weeks?)\b', lower)
        if match:
            days = int(match.group(1)) * (7 if match.group(2).startswith('week') else 1)
            return today + datetime.timedelta(days=days), match.group(0)

        weekdays = '|'.join(Database._WEEKDAYS)
        match = re.search(r'\b(?:next\s+)?(' + weekdays + r')\b', lower)
        if match:
            ahead = (Database._WEEKDAYS[match.group(1)] - today.weekday()) % 7
            if ahead == 0:
                if explicit_time is None:
                    ahead = 7
                else:
                    hour, minute = map(int, explicit_time.split(':'))
                    if datetime.time(hour, minute) <= datetime.datetime.now().time():
                        ahead = 7
            return today + datetime.timedelta(days=ahead), match.group(0)

        match = re.search(r'\b(\d{4})-(\d{2})-(\d{2})\b', text)
        if match:
            try:
                return datetime.date.fromisoformat(match.group(0)), match.group(0)
            except ValueError:
                pass

        months = '|'.join(Database._MONTHS)
        match = re.search(r'\b(' + months + r')\.?\s+(\d{1,2})\b', lower)
        if match:
            return Database._month_day(
                Database._MONTHS[match.group(1)], int(match.group(2)), match.group(0), today
            )

        match = re.search(r'\b(\d{1,2})\s+(' + months + r')\b', lower)
        if match:
            return Database._month_day(
                Database._MONTHS[match.group(2)], int(match.group(1)), match.group(0), today
            )

        return None

    @staticmethod
    def _parse_todo_meta(text: str) -> tuple[str, str | None, str, str | None, str | None, float | None]:
        """Parse natural language date/time and !priority tags from todo text.

        Returns (clean_text, due_date, priority, scheduled_date, scheduled_time, reminder_at).
        Priority tags: !high/!h, !medium/!m, !low/!l (case-insensitive, last win).
        Date: dateparser.search_dates first, then a relative-day fallback because
        it returns nothing for text containing tokens like "test2". Time is
        extracted by our own regex (search_dates drops am/pm without a colon,
        see _parse_explicit_time).
        An explicit time schedules the task at that datetime but does NOT
        auto-set a reminder — schedule and reminder are deliberately
        independent controls (set the reminder separately, e.g. 10 min before).
        """

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

        time_match = _TIME_PATTERN.search(clean)
        explicit_time = Database._parse_explicit_time(clean) if clean else None

        due_date = None
        scheduled_date = scheduled_time = None
        reminder_at = None
        matched_date = None

        if clean:
            results = search_dates(clean, settings={'PREFER_DATES_FROM': 'future'})
            if results:
                for substr, dt in results:
                    if Database._is_date_candidate(substr):
                        due_date = dt.strftime('%Y-%m-%d')
                        matched_date = substr
                        break

            if due_date is None:
                relative = Database._find_relative_date(clean, explicit_time)
                if relative:
                    due_date, matched_date = relative[0].strftime('%Y-%m-%d'), relative[1]

        if matched_date:
            clean = re.sub(
                re.escape(matched_date), '', clean, count=1, flags=re.IGNORECASE
            ).strip()
            if explicit_time:
                scheduled_date = due_date
                scheduled_time = explicit_time
                if time_match:
                    clean = re.sub(
                        re.escape(time_match.group(0)), '', clean, count=1, flags=re.IGNORECASE
                    ).strip()
            clean = re.sub(r'\s+', ' ', clean).strip()

        return clean, due_date, priority, scheduled_date, scheduled_time, reminder_at

    def create_todo(self, text: str) -> Todo | None:
        if not self._usable:
            return None
        self._ensure_todos_table()
        try:
            (clean_text, due_date, priority,
             scheduled_date, scheduled_time, reminder_at) = self._parse_todo_meta(text)
            if not clean_text:
                return None
            conn = self._connect()
            return self._insert_todo(
                conn, text=clean_text, due_date=due_date, priority=priority,
                scheduled_date=scheduled_date, scheduled_time=scheduled_time,
                reminder_at=reminder_at,
            )
        except sqlite3.Error as e:
            logger.error(f"create_todo failed: {e}")
            return None

    @staticmethod
    def _reminder_for(date: str | None, time: str | None) -> float | None:
        """The reminder is always five minutes before the due datetime."""
        if not date or not time:
            return None
        try:
            due = datetime.datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M")
        except ValueError:
            return None
        return (due - datetime.timedelta(minutes=5)).timestamp()

    def _sync_reminder(self, conn: sqlite3.Connection, todo_id: int) -> None:
        todo = self._fetch_todo(conn, todo_id)
        if not todo:
            return
        reminder = self._reminder_for(todo.scheduled_date or todo.due_date, todo.scheduled_time)
        conn.execute(
            "UPDATE todos SET reminder_at = ?, last_reminded_at = NULL WHERE id = ?",
            (reminder, todo_id),
        )
        conn.commit()

    def _insert_todo(self, conn: sqlite3.Connection, *, text: str, order_index: int | None = None,
                     due_date: str | None = None, priority: str = "medium", status: str = "inbox",
                     notes: str = "",
                     scheduled_date: str | None = None, scheduled_time: str | None = None,
                     reminder_at: float | None = None,
                     source_app: str | None = None, source_sender: str | None = None,
                     source_url: str | None = None,
                     source_notification_id: int | None = None) -> Todo | None:
        """Insert a todo row and return it."""
        if order_index is None:
            row = conn.execute(
                "SELECT COALESCE(MAX(order_index), -1) AS mx FROM todos"
            ).fetchone()
            order_index = (row["mx"] if row else -1) + 1
        now = time.time()
        if reminder_at is None:
            reminder_at = self._reminder_for(scheduled_date or due_date, scheduled_time)
        cur = conn.execute(
            "INSERT INTO todos (text, order_index, created_at, due_date, priority, status, "
            "notes, scheduled_date, scheduled_time, reminder_at, "
            "source_app, source_sender, source_url, "
            "source_notification_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (text, order_index, now, due_date, priority, status, notes,
             scheduled_date, scheduled_time, reminder_at,
             source_app, source_sender, source_url,
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
            scheduled_date=row["scheduled_date"] if "scheduled_date" in row.keys() else None,
            scheduled_time=row["scheduled_time"] if "scheduled_time" in row.keys() else None,
            reminder_at=row["reminder_at"] if "reminder_at" in row.keys() else None,
            last_reminded_at=row["last_reminded_at"] if "last_reminded_at" in row.keys() else None,
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
        """Complete or reopen a todo."""
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
        """Mark a todo complete."""
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
            self._sync_reminder(conn, todo_id)
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
            self._sync_reminder(conn, todo_id)
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

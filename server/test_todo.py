"""Todo 2.0 logic tests — run with: server/.venv/bin/python3 -m unittest test_todo -v

Covers: legacy migration mapping, lifecycle transitions, invalid updates,
soft-delete, and reminders (due + no-duplicate + re-arm).
"""
import os
import sqlite3
import tempfile
import unittest

from db import Database


class TodoDatabaseTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mktemp(suffix=".db")
        self.db = Database(self.tmp)

    def tearDown(self):
        if os.path.exists(self.tmp):
            os.remove(self.tmp)

    def _make_legacy_db(self):
        """Create a pre-Todo-2.0 schema (due_date/priority exist, status does not)."""
        conn = sqlite3.connect(self.tmp)
        conn.executescript("""
            CREATE TABLE todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                order_index INTEGER NOT NULL DEFAULT 0,
                created_at REAL NOT NULL,
                due_date TEXT,
                priority TEXT NOT NULL DEFAULT 'medium'
            );
            INSERT INTO todos (text, completed, order_index, created_at, due_date, priority)
            VALUES ('legacy done', 1, 0, 1, '2026-08-10', 'high');
            INSERT INTO todos (text, completed, order_index, created_at, due_date, priority)
            VALUES ('legacy planned', 0, 1, 1, NULL, 'high');
            INSERT INTO todos (text, completed, order_index, created_at, due_date, priority)
            VALUES ('legacy dated', 0, 2, 1, '2026-08-15', 'medium');
            INSERT INTO todos (text, completed, order_index, created_at, due_date, priority)
            VALUES ('legacy raw', 0, 3, 1, NULL, 'medium');
        """)
        conn.commit()
        conn.close()

    # ── Migration ──────────────────────────────────────────────

    def test_legacy_migration_mapping(self):
        self._make_legacy_db()
        # Fresh instance triggers ensure/migration on first query
        db = Database(self.tmp)
        todos = db.get_all_todos()
        self.assertEqual({t.text: t.status for t in todos}, {
            "legacy done": "completed",
            "legacy planned": "active",
            "legacy dated": "active",
            "legacy raw": "inbox",
        })
        # Gate so backfill never re-runs against new todos
        v = sqlite3.connect(self.tmp).execute("PRAGMA user_version").fetchone()[0]
        self.assertEqual(v, 2)
        t_new = db.create_todo("plain capture")
        self.assertEqual(t_new.status, "inbox")
        t_high = db.create_todo("Fix login !high tomorrow")
        self.assertEqual(t_high.status, "inbox")  # stays inbox until planned

    # ── Natural-language schedule parsing ────────────────────────

    def test_parse_todo_meta_explicit_time(self):
        """'Fix login tomorrow 10am' must schedule tomorrow at 10:00, not current wall-clock.

        dateparser.search_dates v1.4.1 drops am/pm without a colon
        ('tomorrow 10am' → today's now), so the time comes from our own
        regex combined with the date from search_dates.
        """
        t = self.db.create_todo("Fix login tomorrow 10am")
        self.assertIsNotNone(t)
        import datetime
        expected = (datetime.date.today() + datetime.timedelta(days=1)).strftime('%Y-%m-%d')
        self.assertEqual(t.due_date, expected)
        self.assertEqual(t.scheduled_date, expected)
        self.assertEqual(t.scheduled_time, "10:00")
        self.assertEqual(t.text, "Fix login")

    def test_bare_date_without_task_rejected(self):
        """A date-only capture ('tomorrow 10am') with no task name creates nothing."""
        self.assertIsNone(self.db.create_todo("tomorrow 10am"))

    def test_parse_todo_meta_no_auto_reminder(self):
        """Schedule and reminder are independent — a time schedules but does not remind."""
        t = self.db.create_todo("Fix login !high tomorrow 2pm")
        self.assertIsNotNone(t)
        self.assertEqual(t.scheduled_time, "14:00")
        self.assertIsNone(t.reminder_at)

    def test_parse_todo_meta_24h_time(self):
        t = self.db.create_todo("tanya yoel besok 10:00")
        self.assertIsNotNone(t)
        import datetime
        expected = (datetime.date.today() + datetime.timedelta(days=1)).strftime('%Y-%m-%d')
        self.assertEqual(t.scheduled_date, expected)
        self.assertEqual(t.scheduled_time, "10:00")

    def test_parse_todo_meta_no_false_positive(self):
        """Indonesian filler words ('di', 'nya') must not be treated as dates."""
        t = self.db.create_todo("kasih tau team hasil discuss di hiding-leads")
        self.assertIsNotNone(t)
        self.assertIsNone(t.due_date)
        self.assertIsNone(t.scheduled_date)

    def test_parse_todo_meta_relative_days(self):
        t = self.db.create_todo("buy milk in 3 days")
        self.assertIsNotNone(t)
        import datetime
        expected = (datetime.date.today() + datetime.timedelta(days=3)).strftime('%Y-%m-%d')
        self.assertEqual(t.due_date, expected)
        self.assertIsNone(t.scheduled_date)

    # ── Lifecycle ──────────────────────────────────────────────

    def test_status_transitions_and_invalid(self):
        t = self.db.create_todo("task")
        self.assertEqual(t.status, "inbox")
        self.assertFalse(t.completed)
        self.db.update_todo_status(t.id, "active")
        self.db.update_todo_status(t.id, "waiting")
        self.db.update_todo_status(t.id, "completed")
        done = [x for x in self.db.get_all_todos() if x.id == t.id][0]
        self.assertTrue(done.completed)
        # toggle reopens completed → active
        reopened = self.db.toggle_todo(t.id)
        self.assertEqual(reopened.status, "active")
        # invalid status rejected
        self.assertIsNone(self.db.update_todo_status(t.id, "bogus"))

    def test_meta_field_validation(self):
        t = self.db.create_todo("meta")
        self.db.update_todo_notes(t.id, "note")
        self.db.update_todo_schedule(t.id, "2026-08-12", "09:30")
        got = [x for x in self.db.get_all_todos() if x.id == t.id][0]
        self.assertEqual(got.notes, "note")
        self.assertEqual(got.scheduled_date, "2026-08-12")
        self.assertEqual(got.scheduled_time, "09:30")
        self.assertIsNone(self.db.update_todo_schedule(t.id, "not-a-date", None))
        self.assertIsNone(self.db.update_todo_schedule(t.id, "2026-08-12", "99:99"))

    # ── Soft delete ────────────────────────────────────────────

    def test_soft_delete_archives(self):
        t = self.db.create_todo("doomed")
        self.assertTrue(self.db.delete_todo(t.id))
        self.assertNotIn(t.id, [x.id for x in self.db.get_all_todos()])
        conn = sqlite3.connect(self.tmp)
        row = conn.execute("SELECT status, archived_at FROM todos WHERE id=?", (t.id,)).fetchone()
        conn.close()
        self.assertEqual(row[0], "archived")
        self.assertIsNotNone(row[1])

    # ── Reminders ──────────────────────────────────────────────

    def test_reminder_due_no_duplicate_and_rearm(self):
        t = self.db.create_todo("remind")
        self.db.update_todo_reminder(t.id, 100.0)
        self.assertEqual([x.id for x in self.db.get_due_reminders(now_ts=200.0)], [t.id])
        self.db.mark_reminded(t.id, 200.0)
        self.assertEqual(self.db.get_due_reminders(now_ts=200.0), [])
        # same reminder time never re-fires
        self.assertEqual(self.db.get_due_reminders(now_ts=999.0), [])
        # changing the reminder re-arms it
        self.db.update_todo_reminder(t.id, 100.0)
        self.assertEqual([x.id for x in self.db.get_due_reminders(now_ts=200.0)], [t.id])

    def test_completed_todos_not_reminded(self):
        t = self.db.create_todo("done task")
        self.db.update_todo_reminder(t.id, 100.0)
        self.db.update_todo_status(t.id, "completed")
        self.assertEqual(self.db.get_due_reminders(now_ts=200.0), [])

    def test_plain_complete_and_meta_copy(self):
        t = self.db.create_todo("plain")
        self.db.update_todo_notes(t.id, "n")
        done = self.db.toggle_todo(t.id)
        self.assertEqual(done.status, "completed")
        self.assertTrue(done.completed)


if __name__ == "__main__":
    unittest.main()

import os
import shutil
import sqlite3
import logging
from datetime import datetime

from flask import g

from config import DB_PATH

logger = logging.getLogger(__name__)

BACKUP_DIR = os.path.join(os.path.dirname(DB_PATH), "backups")
MAX_BACKUPS = 7


def _configure_conn(conn):
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA cache_size=-8000")
    conn.execute("PRAGMA synchronous=NORMAL")


def get_db():
    """Get a database connection for the current request, reusing if available."""
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        _configure_conn(conn)
        g.db = conn
    return g.db


def get_db_direct():
    """Get a standalone DB connection (for use outside request context)."""
    conn = sqlite3.connect(DB_PATH)
    _configure_conn(conn)
    return conn


def backup_db():
    """Create a timestamped backup of the database, keeping the last MAX_BACKUPS."""
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(BACKUP_DIR, f"planner_{ts}.db")
        conn = sqlite3.connect(DB_PATH)
        backup_conn = sqlite3.connect(backup_path)
        conn.backup(backup_conn)
        backup_conn.close()
        conn.close()

        backups = sorted(
            [f for f in os.listdir(BACKUP_DIR) if f.endswith(".db")],
        )
        while len(backups) > MAX_BACKUPS:
            old = backups.pop(0)
            os.remove(os.path.join(BACKUP_DIR, old))

        logger.info("数据库备份完成: %s", backup_path)
        return backup_path
    except Exception as e:
        logger.error("数据库备份失败: %s", e)
        return None


def init_db():
    conn = get_db_direct()

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            avatar TEXT DEFAULT '',
            bio TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            last_login TEXT
        )
    """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS verification_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL COLLATE NOCASE,
            code TEXT NOT NULL,
            type TEXT DEFAULT 'reset_password',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0
        )
    """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            color TEXT NOT NULL,
            category TEXT DEFAULT '其他',
            priority INTEGER DEFAULT 2,
            completed INTEGER DEFAULT 0,
            col_type TEXT DEFAULT 'plan',
            link_id INTEGER,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS timer_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            task_name TEXT NOT NULL,
            planned_minutes INTEGER NOT NULL,
            actual_seconds INTEGER NOT NULL,
            date TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS event_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            duration_minutes INTEGER DEFAULT 60,
            color TEXT NOT NULL,
            category TEXT DEFAULT '其他',
            priority INTEGER DEFAULT 2,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            date TEXT NOT NULL,
            content TEXT DEFAULT '',
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            daily_goal_hours REAL DEFAULT 8.0,
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS deleted_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            original_id INTEGER,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            color TEXT NOT NULL,
            category TEXT DEFAULT '其他',
            priority INTEGER DEFAULT 2,
            completed INTEGER DEFAULT 0,
            col_type TEXT DEFAULT 'plan',
            deleted_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """
    )

    _migrate(conn)
    conn.commit()
    conn.close()


def _migrate(conn):
    _migrate_events(conn)
    _migrate_timer_records(conn)
    _migrate_notes(conn)
    _create_indexes(conn)


def _get_columns(conn, table):
    return [row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]


def _migrate_events(conn):
    cols = _get_columns(conn, "events")
    migrations = [
        ("col_type", "TEXT", "'plan'"),
        ("link_id", "INTEGER", "NULL"),
        ("user_id", "INTEGER", "NULL"),
        ("recur_rule", "TEXT", "NULL"),
        ("recur_parent_id", "INTEGER", "NULL"),
    ]
    for col_name, col_type, default in migrations:
        if col_name not in cols:
            try:
                conn.execute(
                    f"ALTER TABLE events ADD COLUMN {col_name} {col_type} DEFAULT {default}"
                )
            except Exception:
                pass


def _migrate_timer_records(conn):
    cols = _get_columns(conn, "timer_records")
    if "user_id" not in cols:
        try:
            conn.execute(
                "ALTER TABLE timer_records ADD COLUMN user_id INTEGER DEFAULT NULL"
            )
        except Exception:
            pass


def _migrate_notes(conn):
    cols = _get_columns(conn, "notes")
    if "user_id" not in cols:
        schema = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='notes'"
        ).fetchone()
        needs_recreate = schema and "UNIQUE" in (schema[0] or "")

        if needs_recreate:
            conn.execute(
                """
                CREATE TABLE notes_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    date TEXT NOT NULL,
                    content TEXT DEFAULT '',
                    updated_at TEXT DEFAULT (datetime('now','localtime'))
                )
            """
            )
            conn.execute(
                """
                INSERT INTO notes_new (id, date, content, updated_at)
                SELECT id, date, content, updated_at FROM notes
            """
            )
            conn.execute("DROP TABLE notes")
            conn.execute("ALTER TABLE notes_new RENAME TO notes")
        else:
            try:
                conn.execute(
                    "ALTER TABLE notes ADD COLUMN user_id INTEGER DEFAULT NULL"
                )
            except Exception:
                pass


def _create_indexes(conn):
    indexes = [
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_user_date ON notes(user_id, date)",
        "CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, date)",
        "CREATE INDEX IF NOT EXISTS idx_timer_user_date ON timer_records(user_id, date)",
        "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
        "CREATE INDEX IF NOT EXISTS idx_vcode_email ON verification_codes(email, used)",
        "CREATE INDEX IF NOT EXISTS idx_events_title ON events(user_id, title)",
        "CREATE INDEX IF NOT EXISTS idx_events_link ON events(link_id)",
        "CREATE INDEX IF NOT EXISTS idx_events_recur ON events(recur_parent_id)",
        "CREATE INDEX IF NOT EXISTS idx_templates_user ON event_templates(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_events_col_type ON events(user_id, col_type, date)",
        "CREATE INDEX IF NOT EXISTS idx_deleted_events_user ON deleted_events(user_id, deleted_at)",
    ]
    for sql in indexes:
        try:
            conn.execute(sql)
        except Exception:
            pass


def optimize_db():
    """Run periodic maintenance: clean up stale data and optimize."""
    conn = get_db_direct()
    try:
        from datetime import datetime, timedelta
        cutoff = (datetime.now() - timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            "DELETE FROM verification_codes WHERE expires_at < ? OR used = 1",
            (cutoff,),
        )
        trash_cutoff = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            "DELETE FROM deleted_events WHERE deleted_at < ?",
            (trash_cutoff,),
        )
        conn.execute("PRAGMA optimize")
        conn.commit()
    except Exception:
        pass
    finally:
        conn.close()

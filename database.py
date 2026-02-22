import sqlite3
from config import DB_PATH


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            content TEXT DEFAULT '',
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """
    )
    migrations = [
        ("col_type", "TEXT", "'plan'"),
        ("link_id", "INTEGER", "NULL"),
    ]
    for col_name, col_type, default in migrations:
        try:
            conn.execute(
                f"ALTER TABLE events ADD COLUMN {col_name} {col_type} DEFAULT {default}"
            )
        except Exception:
            pass
    conn.commit()
    conn.close()

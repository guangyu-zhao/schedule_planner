import logging
from datetime import datetime, timedelta

import psycopg2
from psycopg2 import pool, extras
from flask import g

from config import DATABASE_URL

logger = logging.getLogger(__name__)

_pool: pool.ThreadedConnectionPool | None = None


def _get_pool() -> pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        _pool = pool.ThreadedConnectionPool(
            minconn=2,
            maxconn=20,
            dsn=DATABASE_URL,
            cursor_factory=extras.RealDictCursor,
        )
    return _pool


class _ConnWrapper:
    """Wraps a psycopg2 connection to provide a SQLite-like conn.execute() interface."""

    def __init__(self, raw_conn):
        self._conn = raw_conn

    def execute(self, sql, params=None):
        cur = self._conn.cursor(cursor_factory=extras.RealDictCursor)
        cur.execute(sql, params)
        return cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def cursor(self, **kwargs):
        return self._conn.cursor(**kwargs)

    # Allow direct access to underlying connection attributes (e.g., for pool.putconn)
    def __getattr__(self, name):
        return getattr(self._conn, name)


def get_db() -> _ConnWrapper:
    """Get a pooled connection for the current request, reusing if available."""
    if "db" not in g:
        g.db = _ConnWrapper(_get_pool().getconn())
    return g.db


def get_db_direct() -> _ConnWrapper:
    """Get a pooled connection outside request context; caller must call release_db()."""
    return _ConnWrapper(_get_pool().getconn())


def release_db(conn):
    """Return a connection obtained via get_db_direct() back to the pool."""
    raw = conn._conn if isinstance(conn, _ConnWrapper) else conn
    _get_pool().putconn(raw)


def backup_db():
    """No-op for PostgreSQL — backups are handled externally via pg_dump."""
    logger.info("PostgreSQL 备份请使用 pg_dump，跳过内置备份")
    return None


def init_db():
    conn = get_db_direct()
    try:
        cur = conn.cursor()

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                username TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                avatar TEXT DEFAULT '',
                bio TEXT DEFAULT '',
                language TEXT DEFAULT '',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                last_login TIMESTAMPTZ
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS verification_codes (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                code TEXT NOT NULL,
                type TEXT DEFAULT 'reset_password',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                expires_at TIMESTAMPTZ NOT NULL,
                used SMALLINT DEFAULT 0
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                color TEXT NOT NULL,
                category TEXT DEFAULT '其他',
                priority INTEGER DEFAULT 2,
                completed SMALLINT DEFAULT 0,
                col_type TEXT DEFAULT 'plan',
                recur_rule TEXT,
                recur_parent_id INTEGER,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS timer_records (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                task_name TEXT NOT NULL,
                planned_minutes INTEGER NOT NULL,
                actual_seconds INTEGER NOT NULL,
                date TEXT NOT NULL,
                completed SMALLINT DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS event_templates (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                duration_minutes INTEGER DEFAULT 60,
                color TEXT NOT NULL,
                category TEXT DEFAULT '其他',
                priority INTEGER DEFAULT 2,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS notes (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                date TEXT NOT NULL,
                content TEXT DEFAULT '',
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS user_settings (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL UNIQUE,
                daily_goal_hours REAL DEFAULT 8.0,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS note_images (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                token TEXT NOT NULL UNIQUE,
                storage_path TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS deleted_events (
                id SERIAL PRIMARY KEY,
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
                completed SMALLINT DEFAULT 0,
                col_type TEXT DEFAULT 'plan',
                deleted_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS user_sessions (
                id SERIAL PRIMARY KEY,
                session_id TEXT NOT NULL UNIQUE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                ip_address TEXT,
                user_agent TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                last_active TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )

        _create_indexes(cur)
        conn.commit()
        logger.info("PostgreSQL schema 初始化完成")
    except Exception as e:
        conn.rollback()
        logger.error("init_db 失败: %s", e)
        raise
    finally:
        release_db(conn)


def _create_indexes(cur):
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_notes_user_date ON notes(user_id, date)",
        "CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, date)",
        "CREATE INDEX IF NOT EXISTS idx_timer_user_date ON timer_records(user_id, date)",
        "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
        "CREATE INDEX IF NOT EXISTS idx_vcode_email ON verification_codes(email, used)",
        "CREATE INDEX IF NOT EXISTS idx_events_title ON events(user_id, title)",
        "CREATE INDEX IF NOT EXISTS idx_events_recur ON events(recur_parent_id)",
        "CREATE INDEX IF NOT EXISTS idx_templates_user ON event_templates(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_events_col_type ON events(user_id, col_type, date)",
        "CREATE INDEX IF NOT EXISTS idx_deleted_events_user ON deleted_events(user_id, deleted_at)",
        "CREATE INDEX IF NOT EXISTS idx_note_images_token ON note_images(token)",
        "CREATE INDEX IF NOT EXISTS idx_note_images_user ON note_images(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_sessions_sid ON user_sessions(session_id)",
    ]
    for sql in indexes:
        cur.execute(sql)


def optimize_db():
    """Periodic maintenance: clean up stale data."""
    conn = get_db_direct()
    try:
        cur = conn.cursor()
        cutoff = datetime.now() - timedelta(hours=24)
        cur.execute(
            "DELETE FROM verification_codes WHERE expires_at < %s OR used = 1",
            (cutoff,),
        )
        trash_cutoff = datetime.now() - timedelta(days=30)
        cur.execute(
            "DELETE FROM deleted_events WHERE deleted_at < %s",
            (trash_cutoff,),
        )
        cur.execute("ANALYZE")
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error("optimize_db 失败: %s", e)
    finally:
        release_db(conn)

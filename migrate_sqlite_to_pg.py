#!/usr/bin/env python3
"""One-time migration script: SQLite → PostgreSQL.

Usage:
    python migrate_sqlite_to_pg.py --sqlite-path planner.db --pg-url postgresql://...
"""
import argparse
import sqlite3
import sys
import logging

import psycopg2
import psycopg2.extras

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

TABLES = [
    "users",
    "verification_codes",
    "events",
    "timer_records",
    "event_templates",
    "notes",
    "user_settings",
    "note_images",
    "deleted_events",
]

# Columns to cast integer 0/1 → smallint (no-op in Python, just for clarity)
# No conversion needed: psycopg2 accepts Python int for SMALLINT columns.


def migrate(sqlite_path: str, pg_url: str) -> None:
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row

    pg_conn = psycopg2.connect(pg_url, cursor_factory=psycopg2.extras.RealDictCursor)
    pg_cur = pg_conn.cursor()

    # Ensure schema exists (set DATABASE_URL so database.py picks up the right URL)
    import os as _os
    _os.environ["DATABASE_URL"] = pg_url
    logger.info("初始化 PostgreSQL schema …")
    from database import init_db
    init_db()

    errors = 0
    for table in TABLES:
        try:
            rows = sqlite_conn.execute(f"SELECT * FROM {table}").fetchall()
        except Exception as e:
            logger.warning("SQLite 表 %s 不存在或读取失败: %s", table, e)
            continue

        if not rows:
            logger.info("表 %s: 空表，跳过", table)
            continue

        cols = rows[0].keys()
        placeholders = ", ".join(["%s"] * len(cols))
        col_names = ", ".join(cols)
        sql = (
            f"INSERT INTO {table} ({col_names}) VALUES ({placeholders}) "
            f"ON CONFLICT (id) DO NOTHING"
        )

        data = [tuple(row) for row in rows]
        try:
            psycopg2.extras.execute_batch(pg_cur, sql, data, page_size=500)
            pg_conn.commit()
            logger.info("表 %s: 迁移 %d 行", table, len(data))
        except Exception as e:
            pg_conn.rollback()
            logger.error("表 %s 迁移失败: %s", table, e)
            errors += 1
            continue

        # Reset SERIAL sequence
        try:
            pg_cur.execute(
                f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                f"COALESCE(MAX(id), 0) + 1, false) FROM {table}"
            )
            pg_conn.commit()
        except Exception as e:
            pg_conn.rollback()
            logger.warning("表 %s 序列重置失败: %s", table, e)

    # Row count verification
    logger.info("\n── 行数对比 ──")
    all_ok = True
    for table in TABLES:
        try:
            sqlite_count = sqlite_conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        except Exception:
            sqlite_count = "N/A"

        try:
            pg_cur.execute(f"SELECT COUNT(*) as c FROM {table}")
            pg_count = pg_cur.fetchone()["c"]
        except Exception:
            pg_count = "N/A"

        match = "✓" if sqlite_count == pg_count else "✗"
        logger.info("  %s %s: SQLite=%s  PG=%s", match, table, sqlite_count, pg_count)
        if sqlite_count != pg_count:
            all_ok = False

    sqlite_conn.close()
    pg_conn.close()

    if errors or not all_ok:
        logger.error("迁移完成，但存在错误或行数不一致，请检查日志")
        sys.exit(1)
    else:
        logger.info("\nMigration complete ✓")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate SQLite DB to PostgreSQL")
    parser.add_argument("--sqlite-path", required=True, help="Path to planner.db")
    parser.add_argument("--pg-url", required=True, help="PostgreSQL connection URL")
    args = parser.parse_args()
    migrate(args.sqlite_path, args.pg_url)

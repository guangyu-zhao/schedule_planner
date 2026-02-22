import os
import sqlite3
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "planner.db")


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
    # Migrate existing tables that lack new columns
    migrations = [
        ("col_type", "TEXT", "'plan'"),
        ("link_id", "INTEGER", "NULL"),
    ]
    for col_name, col_type, default in migrations:
        try:
            conn.execute(f"ALTER TABLE events ADD COLUMN {col_name} {col_type} DEFAULT {default}")
        except Exception:
            pass
    conn.commit()
    conn.close()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/events", methods=["GET"])
def get_events():
    start = request.args.get("start")
    end = request.args.get("end")
    conn = get_db()
    events = conn.execute(
        "SELECT * FROM events WHERE date >= ? AND date <= ? ORDER BY date, start_time",
        (start, end),
    ).fetchall()
    conn.close()
    return jsonify([dict(e) for e in events])


@app.route("/api/events", methods=["POST"])
def create_event():
    data = request.json
    col_type = data.get("col_type", "plan")
    conn = get_db()

    cursor = conn.execute(
        """INSERT INTO events (title, description, date, start_time, end_time,
           color, category, priority, col_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            data["title"],
            data.get("description", ""),
            data["date"],
            data["start_time"],
            data["end_time"],
            data["color"],
            data.get("category", "工作"),
            data.get("priority", 1),
            col_type,
        ),
    )
    conn.commit()
    plan_id = cursor.lastrowid

    actual_event = None
    if col_type == "plan":
        cursor2 = conn.execute(
            """INSERT INTO events (title, description, date, start_time, end_time,
               color, category, priority, col_type, link_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'actual', ?)""",
            (
                data["title"],
                data.get("description", ""),
                data["date"],
                data["start_time"],
                data["end_time"],
                data["color"],
                data.get("category", "工作"),
                data.get("priority", 1),
                plan_id,
            ),
        )
        actual_id = cursor2.lastrowid
        conn.execute("UPDATE events SET link_id=? WHERE id=?", (actual_id, plan_id))
        conn.commit()
        actual_event = dict(
            conn.execute("SELECT * FROM events WHERE id=?", (actual_id,)).fetchone()
        )

    plan_event = dict(
        conn.execute("SELECT * FROM events WHERE id=?", (plan_id,)).fetchone()
    )
    conn.close()

    if actual_event:
        return jsonify({"plan": plan_event, "actual": actual_event}), 201
    return jsonify({"plan": plan_event}), 201


@app.route("/api/events/<int:event_id>", methods=["PUT"])
def update_event(event_id):
    data = request.json
    conn = get_db()
    conn.execute(
        """UPDATE events SET title=?, description=?, date=?, start_time=?, end_time=?,
           color=?, category=?, priority=?, completed=?, updated_at=datetime('now','localtime')
           WHERE id=?""",
        (
            data["title"],
            data.get("description", ""),
            data["date"],
            data["start_time"],
            data["end_time"],
            data["color"],
            data.get("category", "工作"),
            data.get("priority", 1),
            data.get("completed", 0),
            event_id,
        ),
    )
    conn.commit()
    event = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    conn.close()
    return jsonify(dict(event))


@app.route("/api/events/batch", methods=["PUT"])
def batch_update_events():
    items = request.json
    conn = get_db()
    results = []
    for item in items:
        conn.execute(
            "UPDATE events SET start_time=?, end_time=?, updated_at=datetime('now','localtime') WHERE id=?",
            (item["start_time"], item["end_time"], item["id"]),
        )
    conn.commit()
    for item in items:
        row = conn.execute(
            "SELECT * FROM events WHERE id=?", (item["id"],)
        ).fetchone()
        if row:
            results.append(dict(row))
    conn.close()
    return jsonify(results)


@app.route("/api/events/<int:event_id>", methods=["DELETE"])
def delete_event(event_id):
    conn = get_db()
    event = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    event_data = dict(event) if event else None
    conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
    if event and event["link_id"]:
        conn.execute("DELETE FROM events WHERE id = ?", (event["link_id"],))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "event": event_data})


@app.route("/api/stats", methods=["GET"])
def get_stats():
    date = request.args.get("date")
    conn = get_db()
    total = conn.execute(
        "SELECT COUNT(*) as count FROM events WHERE date = ? AND col_type='plan'",
        (date,),
    ).fetchone()["count"]
    completed = conn.execute(
        "SELECT COUNT(*) as count FROM events WHERE date = ? AND col_type='plan' AND completed = 1",
        (date,),
    ).fetchone()["count"]
    events = conn.execute(
        "SELECT start_time, end_time FROM events WHERE date = ? AND col_type='plan'",
        (date,),
    ).fetchall()
    total_minutes = 0
    for e in events:
        sh, sm = map(int, e["start_time"].split(":"))
        eh, em = map(int, e["end_time"].split(":"))
        total_minutes += (eh * 60 + em) - (sh * 60 + sm)
    conn.close()
    return jsonify(
        {
            "total": total,
            "completed": completed,
            "total_hours": round(total_minutes / 60, 1),
            "completion_rate": round(completed / total * 100) if total > 0 else 0,
        }
    )


@app.route("/api/timer/records", methods=["GET"])
def get_timer_records():
    date = request.args.get("date")
    conn = get_db()
    records = conn.execute(
        "SELECT * FROM timer_records WHERE date = ? ORDER BY created_at DESC", (date,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in records])


@app.route("/api/timer/records", methods=["POST"])
def create_timer_record():
    data = request.json
    conn = get_db()
    cursor = conn.execute(
        """INSERT INTO timer_records (task_name, planned_minutes, actual_seconds, date, completed)
           VALUES (?, ?, ?, ?, ?)""",
        (
            data["task_name"],
            data["planned_minutes"],
            data["actual_seconds"],
            data["date"],
            data.get("completed", 0),
        ),
    )
    conn.commit()
    record = conn.execute(
        "SELECT * FROM timer_records WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    conn.close()
    return jsonify(dict(record)), 201


@app.route("/api/timer/records/<int:record_id>", methods=["DELETE"])
def delete_timer_record(record_id):
    conn = get_db()
    conn.execute("DELETE FROM timer_records WHERE id = ?", (record_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.route("/api/timer/stats", methods=["GET"])
def get_timer_stats():
    date = request.args.get("date")
    conn = get_db()
    total = conn.execute(
        "SELECT COUNT(*) as c FROM timer_records WHERE date = ?", (date,)
    ).fetchone()["c"]
    completed = conn.execute(
        "SELECT COUNT(*) as c FROM timer_records WHERE date = ? AND completed = 1",
        (date,),
    ).fetchone()["c"]
    row = conn.execute(
        "SELECT COALESCE(SUM(actual_seconds), 0) as s FROM timer_records WHERE date = ?",
        (date,),
    ).fetchone()
    conn.close()
    return jsonify(
        {"total": total, "completed": completed, "total_seconds": row["s"]}
    )


@app.route("/api/analytics", methods=["GET"])
def get_analytics():
    start = request.args.get("start")
    end = request.args.get("end")
    conn = get_db()
    events = conn.execute(
        "SELECT * FROM events WHERE date >= ? AND date <= ? ORDER BY date",
        (start, end),
    ).fetchall()
    timer_records = conn.execute(
        "SELECT * FROM timer_records WHERE date >= ? AND date <= ? ORDER BY date",
        (start, end),
    ).fetchall()
    conn.close()
    return jsonify(
        {
            "events": [dict(e) for e in events],
            "timer_records": [dict(r) for r in timer_records],
        }
    )


@app.route("/api/notes", methods=["GET"])
def get_note():
    date = request.args.get("date")
    conn = get_db()
    row = conn.execute("SELECT * FROM notes WHERE date = ?", (date,)).fetchone()
    conn.close()
    if row:
        return jsonify(dict(row))
    return jsonify({"date": date, "content": ""})


@app.route("/api/notes", methods=["PUT"])
def save_note():
    data = request.json
    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM notes WHERE date = ?", (data["date"],)
    ).fetchone()
    if existing:
        conn.execute(
            "UPDATE notes SET content=?, updated_at=datetime('now','localtime') WHERE date=?",
            (data["content"], data["date"]),
        )
    else:
        conn.execute(
            "INSERT INTO notes (date, content) VALUES (?, ?)",
            (data["date"], data["content"]),
        )
    conn.commit()
    conn.close()
    return jsonify({"success": True})


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)

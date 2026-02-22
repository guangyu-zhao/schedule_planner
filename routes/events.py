from flask import Blueprint, request, jsonify
from database import get_db

events_bp = Blueprint("events", __name__)


@events_bp.route("/api/events", methods=["GET"])
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


@events_bp.route("/api/events", methods=["POST"])
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


@events_bp.route("/api/events/<int:event_id>", methods=["PUT"])
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


@events_bp.route("/api/events/batch", methods=["PUT"])
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


@events_bp.route("/api/events/<int:event_id>", methods=["DELETE"])
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

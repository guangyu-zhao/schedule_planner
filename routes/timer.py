from flask import Blueprint, request, jsonify
from database import get_db

timer_bp = Blueprint("timer", __name__)


@timer_bp.route("/api/timer/records", methods=["GET"])
def get_timer_records():
    date = request.args.get("date")
    conn = get_db()
    records = conn.execute(
        "SELECT * FROM timer_records WHERE date = ? ORDER BY created_at DESC", (date,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in records])


@timer_bp.route("/api/timer/records", methods=["POST"])
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


@timer_bp.route("/api/timer/records/<int:record_id>", methods=["DELETE"])
def delete_timer_record(record_id):
    conn = get_db()
    conn.execute("DELETE FROM timer_records WHERE id = ?", (record_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@timer_bp.route("/api/timer/stats", methods=["GET"])
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

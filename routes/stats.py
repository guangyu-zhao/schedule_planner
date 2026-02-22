from flask import Blueprint, request, jsonify
from database import get_db

stats_bp = Blueprint("stats", __name__)


@stats_bp.route("/api/stats", methods=["GET"])
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


@stats_bp.route("/api/analytics", methods=["GET"])
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

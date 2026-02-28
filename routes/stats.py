import re
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g
from database import get_db
from auth_utils import login_required

stats_bp = Blueprint("stats", __name__)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@stats_bp.route("/api/stats", methods=["GET"])
@login_required
def get_stats():
    date = request.args.get("date", "")
    if not DATE_RE.match(date):
        return jsonify({"error": "日期格式不正确"}), 400
    conn = get_db()
    total = conn.execute(
        "SELECT COUNT(*) as count FROM events WHERE user_id=%s AND date = %s AND col_type='actual'",
        (g.user_id, date),
    ).fetchone()["count"]
    completed = conn.execute(
        "SELECT COUNT(*) as count FROM events WHERE user_id=%s AND date = %s AND col_type='actual' AND completed = 1",
        (g.user_id, date),
    ).fetchone()["count"]
    events = conn.execute(
        "SELECT start_time, end_time FROM events WHERE user_id=%s AND date = %s AND col_type='actual'",
        (g.user_id, date),
    ).fetchall()
    total_minutes = 0
    for e in events:
        try:
            sh, sm = map(int, e["start_time"].split(":"))
            eh, em = map(int, e["end_time"].split(":"))
            total_minutes += (eh * 60 + em) - (sh * 60 + sm)
        except (ValueError, AttributeError):
            continue
    return jsonify(
        {
            "total": total,
            "completed": completed,
            "total_hours": round(total_minutes / 60, 1),
            "completion_rate": round(completed / total * 100) if total > 0 else 0,
        }
    )


@stats_bp.route("/api/analytics", methods=["GET"])
@login_required
def get_analytics():
    start = request.args.get("start", "")
    end = request.args.get("end", "")
    if not DATE_RE.match(start) or not DATE_RE.match(end):
        return jsonify({"error": "日期参数格式不正确"}), 400

    start_dt = datetime.strptime(start, "%Y-%m-%d")
    end_dt = datetime.strptime(end, "%Y-%m-%d")
    if (end_dt - start_dt).days > 366:
        end = (start_dt + timedelta(days=366)).strftime("%Y-%m-%d")

    conn = get_db()
    events = conn.execute(
        "SELECT * FROM events WHERE user_id=%s AND date >= %s AND date <= %s ORDER BY date",
        (g.user_id, start, end),
    ).fetchall()
    timer_records = conn.execute(
        "SELECT * FROM timer_records WHERE user_id=%s AND date >= %s AND date <= %s ORDER BY date",
        (g.user_id, start, end),
    ).fetchall()
    return jsonify(
        {
            "events": [dict(e) for e in events],
            "timer_records": [dict(r) for r in timer_records],
        }
    )


@stats_bp.route("/api/stats/heatmap", methods=["GET"])
@login_required
def get_heatmap():
    """Return daily activity counts for the past year (for heatmap rendering)."""
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
    conn = get_db()
    events = conn.execute(
        """SELECT date, COUNT(*) as count FROM events
           WHERE user_id=%s AND col_type='actual' AND date >= %s AND date <= %s
           GROUP BY date""",
        (g.user_id, start_date, end_date),
    ).fetchall()
    timer = conn.execute(
        """SELECT date, COUNT(*) as count, COALESCE(SUM(actual_seconds), 0) as seconds
           FROM timer_records
           WHERE user_id=%s AND date >= %s AND date <= %s
           GROUP BY date""",
        (g.user_id, start_date, end_date),
    ).fetchall()

    activity = {}
    for row in events:
        d = row["date"]
        if d not in activity:
            activity[d] = {"events": 0, "timer_count": 0, "focus_minutes": 0}
        activity[d]["events"] = row["count"]
    for row in timer:
        d = row["date"]
        if d not in activity:
            activity[d] = {"events": 0, "timer_count": 0, "focus_minutes": 0}
        activity[d]["timer_count"] = row["count"]
        activity[d]["focus_minutes"] = round(row["seconds"] / 60)

    result = []
    for date_str, data in sorted(activity.items()):
        level = 0
        total = data["events"] + data["timer_count"]
        if total >= 8:
            level = 4
        elif total >= 5:
            level = 3
        elif total >= 3:
            level = 2
        elif total >= 1:
            level = 1
        result.append({"date": date_str, "level": level, **data})

    return jsonify({"start": start_date, "end": end_date, "data": result})


@stats_bp.route("/api/stats/streak", methods=["GET"])
@login_required
def get_streak():
    """Calculate the current streak (consecutive days with activity)."""
    conn = get_db()
    cutoff = (datetime.now() - timedelta(days=730)).strftime("%Y-%m-%d")
    rows = conn.execute(
        """SELECT DISTINCT date FROM (
            SELECT date FROM events WHERE user_id=%s AND col_type='actual' AND date >= %s
            UNION
            SELECT date FROM timer_records WHERE user_id=%s AND date >= %s
        ) AS combined ORDER BY date DESC""",
        (g.user_id, cutoff, g.user_id, cutoff),
    ).fetchall()

    if not rows:
        return jsonify({"current_streak": 0, "longest_streak": 0, "total_active_days": 0})

    dates = sorted(set(r["date"] for r in rows), reverse=True)
    client_today = request.args.get("today", "")
    if DATE_RE.match(client_today):
        today = client_today
        yesterday = (datetime.strptime(client_today, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    else:
        today = datetime.now().strftime("%Y-%m-%d")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    current_streak = 0
    if dates[0] == today or dates[0] == yesterday:
        check_date = datetime.strptime(dates[0], "%Y-%m-%d")
        date_set = set(dates)
        while check_date.strftime("%Y-%m-%d") in date_set:
            current_streak += 1
            check_date -= timedelta(days=1)

    longest_streak = 0
    streak = 1
    for i in range(1, len(dates)):
        d1 = datetime.strptime(dates[i - 1], "%Y-%m-%d")
        d2 = datetime.strptime(dates[i], "%Y-%m-%d")
        if (d1 - d2).days == 1:
            streak += 1
        else:
            longest_streak = max(longest_streak, streak)
            streak = 1
    longest_streak = max(longest_streak, streak)

    total_events = conn.execute(
        "SELECT COUNT(*) as c FROM events WHERE user_id=%s AND col_type='actual'",
        (g.user_id,),
    ).fetchone()["c"]
    total_focus_seconds = conn.execute(
        "SELECT COALESCE(SUM(actual_seconds), 0) as s FROM timer_records WHERE user_id=%s",
        (g.user_id,),
    ).fetchone()["s"]

    return jsonify({
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "total_active_days": len(dates),
        "total_events": total_events,
        "total_focus_hours": round(total_focus_seconds / 3600, 1),
    })

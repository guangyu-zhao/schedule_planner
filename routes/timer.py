import re
from flask import Blueprint, request, jsonify, g
from database import get_db
from auth_utils import login_required, validate_date

timer_bp = Blueprint("timer", __name__)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@timer_bp.route("/api/timer/records", methods=["GET"])
@login_required
def get_timer_records():
    date = request.args.get("date", "")
    if not validate_date(date):
        return jsonify({"error": "日期格式不正确"}), 400
    conn = get_db()
    records = conn.execute(
        "SELECT * FROM timer_records WHERE user_id=%s AND date = %s ORDER BY created_at DESC",
        (g.user_id, date),
    ).fetchall()
    return jsonify([dict(r) for r in records])


@timer_bp.route("/api/timer/records", methods=["POST"])
@login_required
def create_timer_record():
    data = request.json
    if not data:
        return jsonify({"error": "请求数据不能为空"}), 400

    task_name = (data.get("task_name") or "").strip()
    if not task_name:
        return jsonify({"error": "任务名称不能为空"}), 400
    if len(task_name) > 200:
        return jsonify({"error": "任务名称不能超过 200 个字符"}), 400

    date = data.get("date", "")
    if not validate_date(date):
        return jsonify({"error": "日期格式不正确"}), 400

    try:
        planned_minutes = int(data.get("planned_minutes", 0))
        actual_seconds = int(data.get("actual_seconds", 0))
    except (ValueError, TypeError):
        return jsonify({"error": "时间参数必须为整数"}), 400

    if planned_minutes < 0 or actual_seconds < 0:
        return jsonify({"error": "时间参数不能为负数"}), 400
    if planned_minutes > 1440:
        return jsonify({"error": "计划时长不能超过 1440 分钟（24 小时）"}), 400
    if actual_seconds > 86400:
        return jsonify({"error": "实际时长不能超过 86400 秒（24 小时）"}), 400

    conn = get_db()
    cursor = conn.execute(
        """INSERT INTO timer_records (user_id, task_name, planned_minutes, actual_seconds, date, completed)
           VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
        (
            g.user_id,
            task_name,
            planned_minutes,
            actual_seconds,
            date,
            int(data.get("completed", 0)),
        ),
    )
    conn.commit()
    new_id = cursor.fetchone()["id"]
    record = conn.execute(
        "SELECT * FROM timer_records WHERE id = %s", (new_id,)
    ).fetchone()
    return jsonify(dict(record)), 201


@timer_bp.route("/api/timer/records/<int:record_id>", methods=["DELETE"])
@login_required
def delete_timer_record(record_id):
    conn = get_db()
    conn.execute("DELETE FROM timer_records WHERE id=%s AND user_id=%s", (record_id, g.user_id))
    conn.commit()
    return jsonify({"success": True})


@timer_bp.route("/api/timer/stats", methods=["GET"])
@login_required
def get_timer_stats():
    date = request.args.get("date", "")
    if not validate_date(date):
        return jsonify({"error": "日期格式不正确"}), 400
    conn = get_db()
    total = conn.execute(
        "SELECT COUNT(*) as c FROM timer_records WHERE user_id=%s AND date = %s",
        (g.user_id, date),
    ).fetchone()["c"]
    completed = conn.execute(
        "SELECT COUNT(*) as c FROM timer_records WHERE user_id=%s AND date = %s AND completed = 1",
        (g.user_id, date),
    ).fetchone()["c"]
    row = conn.execute(
        "SELECT COALESCE(SUM(actual_seconds), 0) as s FROM timer_records WHERE user_id=%s AND date = %s",
        (g.user_id, date),
    ).fetchone()
    return jsonify(
        {"total": total, "completed": completed, "total_seconds": row["s"]}
    )

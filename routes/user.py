import csv
import io
import os
import re
import uuid
from datetime import datetime

from flask import Blueprint, request, jsonify, g, session, send_from_directory, Response
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

from config import AVATAR_FOLDER, ALLOWED_AVATAR_EXTENSIONS, AVATAR_MAX_SIZE
from database import get_db
from auth_utils import login_required

user_bp = Blueprint("user", __name__)

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^\d{2}:\d{2}$")


def _allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_AVATAR_EXTENSIONS


def _validate_password(password):
    if not password or len(password) < 8:
        return False, "密码长度至少为 8 位"
    if len(password) > 128:
        return False, "密码长度不能超过 128 位"
    if not re.search(r"[a-zA-Z]", password):
        return False, "密码必须包含字母"
    if not re.search(r"\d", password):
        return False, "密码必须包含数字"
    return True, ""


@user_bp.route("/api/user/profile", methods=["GET"])
@login_required
def get_profile():
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id=?", (g.user_id,)).fetchone()
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    u = dict(user)
    u.pop("password_hash", None)
    return jsonify({"user": u})


@user_bp.route("/api/user/profile", methods=["PUT"])
@login_required
def update_profile():
    data = request.json or {}
    username = (data.get("username") or "").strip()
    bio = (data.get("bio") or "").strip()

    if not username or len(username) < 2 or len(username) > 30:
        return jsonify({"error": "用户名长度需在 2-30 个字符之间"}), 400
    if len(bio) > 200:
        return jsonify({"error": "个人简介不能超过 200 个字符"}), 400

    language = data.get("language")
    if language and language not in ("en", "zh-CN", "zh-TW", "fr", "de", "ja", "ar", "he"):
        language = None

    conn = get_db()
    if language:
        conn.execute(
            "UPDATE users SET username=?, bio=?, language=?, updated_at=datetime('now','localtime') WHERE id=?",
            (username, bio, language, g.user_id),
        )
    else:
        conn.execute(
            "UPDATE users SET username=?, bio=?, updated_at=datetime('now','localtime') WHERE id=?",
            (username, bio, g.user_id),
        )
    conn.commit()
    user = conn.execute("SELECT * FROM users WHERE id=?", (g.user_id,)).fetchone()
    u = dict(user)
    u.pop("password_hash", None)
    return jsonify({"user": u})


@user_bp.route("/api/user/avatar", methods=["POST"])
@login_required
def upload_avatar():
    if "avatar" not in request.files:
        return jsonify({"error": "请选择头像文件"}), 400

    file = request.files["avatar"]
    if not file.filename or not _allowed_file(file.filename):
        return jsonify({"error": "不支持的文件格式，请上传 PNG/JPG/GIF/WebP"}), 400

    os.makedirs(AVATAR_FOLDER, exist_ok=True)

    ext = file.filename.rsplit(".", 1)[1].lower()
    filename = f"{g.user_id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = os.path.join(AVATAR_FOLDER, filename)

    try:
        from PIL import Image

        img = Image.open(file.stream)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
            ext = "jpg"
            filename = f"{g.user_id}_{uuid.uuid4().hex[:8]}.{ext}"
            filepath = os.path.join(AVATAR_FOLDER, filename)

        width, height = img.size
        side = min(width, height)
        left = (width - side) // 2
        top = (height - side) // 2
        img = img.crop((left, top, left + side, top + side))
        img = img.resize(AVATAR_MAX_SIZE, Image.LANCZOS)
        img.save(filepath, quality=90)
    except Exception:
        file.stream.seek(0)
        file.save(filepath)

    conn = get_db()
    old = conn.execute(
        "SELECT avatar FROM users WHERE id=?", (g.user_id,)
    ).fetchone()
    if old and old["avatar"]:
        old_path = os.path.join(AVATAR_FOLDER, old["avatar"])
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass

    conn.execute(
        "UPDATE users SET avatar=?, updated_at=datetime('now','localtime') WHERE id=?",
        (filename, g.user_id),
    )
    conn.commit()

    return jsonify({"avatar": filename, "url": f"/uploads/avatars/{filename}"})


@user_bp.route("/uploads/avatars/<filename>")
def serve_avatar(filename):
    filename = secure_filename(filename)
    return send_from_directory(AVATAR_FOLDER, filename)


@user_bp.route("/api/user/settings", methods=["GET"])
@login_required
def get_settings():
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM user_settings WHERE user_id=?", (g.user_id,)
    ).fetchone()
    if row:
        return jsonify(dict(row))
    return jsonify({"user_id": g.user_id, "daily_goal_hours": 8.0})


@user_bp.route("/api/user/settings", methods=["PUT"])
@login_required
def update_settings():
    data = request.json or {}
    daily_goal = data.get("daily_goal_hours")
    if daily_goal is not None:
        try:
            daily_goal = float(daily_goal)
            if daily_goal < 0.5 or daily_goal > 24:
                return jsonify({"error": "目标时长需在 0.5-24 小时之间"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "无效的目标时长"}), 400

    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM user_settings WHERE user_id=?", (g.user_id,)
    ).fetchone()
    if existing:
        conn.execute(
            "UPDATE user_settings SET daily_goal_hours=?, updated_at=datetime('now','localtime') WHERE user_id=?",
            (daily_goal, g.user_id),
        )
    else:
        conn.execute(
            "INSERT INTO user_settings (user_id, daily_goal_hours) VALUES (?, ?)",
            (g.user_id, daily_goal),
        )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM user_settings WHERE user_id=?", (g.user_id,)
    ).fetchone()
    return jsonify(dict(row))


@user_bp.route("/api/user/change-password", methods=["POST"])
@login_required
def change_password():
    data = request.json or {}
    old_password = data.get("old_password") or ""
    new_password = data.get("new_password") or ""
    confirm_password = data.get("confirm_password") or ""

    if not old_password:
        return jsonify({"error": "请输入原密码"}), 400
    if new_password != confirm_password:
        return jsonify({"error": "两次输入的新密码不一致"}), 400

    valid, msg = _validate_password(new_password)
    if not valid:
        return jsonify({"error": msg}), 400

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id=?", (g.user_id,)).fetchone()
    if not user or not check_password_hash(user["password_hash"], old_password):
        return jsonify({"error": "原密码错误"}), 400

    password_hash = generate_password_hash(new_password)
    conn.execute(
        "UPDATE users SET password_hash=?, updated_at=datetime('now','localtime') WHERE id=?",
        (password_hash, g.user_id),
    )
    conn.commit()

    return jsonify({"success": True, "message": "密码修改成功"})


@user_bp.route("/api/user/export", methods=["GET"])
@login_required
def export_data():
    conn = get_db()
    events = conn.execute(
        "SELECT * FROM events WHERE user_id=? ORDER BY date, start_time",
        (g.user_id,),
    ).fetchall()
    timer_records = conn.execute(
        "SELECT * FROM timer_records WHERE user_id=? ORDER BY date, created_at",
        (g.user_id,),
    ).fetchall()
    notes = conn.execute(
        "SELECT * FROM notes WHERE user_id=? ORDER BY date", (g.user_id,)
    ).fetchall()
    user = conn.execute("SELECT * FROM users WHERE id=?", (g.user_id,)).fetchone()
    if not user:
        return jsonify({"error": "用户不存在"}), 404

    export = {
        "exported_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "user": {
            "username": user["username"],
            "email": user["email"],
            "created_at": user["created_at"],
        },
        "events": [dict(e) for e in events],
        "timer_records": [dict(r) for r in timer_records],
        "notes": [dict(n) for n in notes],
    }

    return jsonify(export), 200, {
        "Content-Disposition": f'attachment; filename="schedule_planner_export_{datetime.now().strftime("%Y%m%d")}.json"'
    }


@user_bp.route("/api/user/export-csv", methods=["GET"])
@login_required
def export_csv():
    conn = get_db()
    events = conn.execute(
        "SELECT * FROM events WHERE user_id=? ORDER BY date, start_time",
        (g.user_id,),
    ).fetchall()
    timer_records = conn.execute(
        "SELECT * FROM timer_records WHERE user_id=? ORDER BY date, created_at",
        (g.user_id,),
    ).fetchall()

    output = io.StringIO()
    output.write('\ufeff')

    output.write("=== 日程安排 ===\n")
    writer = csv.writer(output)
    writer.writerow(["日期", "标题", "开始时间", "结束时间", "分类", "优先级", "类型", "已完成", "备注"])
    priority_map = {1: "高", 2: "中", 3: "低"}
    for e in events:
        writer.writerow([
            e["date"], e["title"], e["start_time"], e["end_time"],
            e["category"], priority_map.get(e["priority"], "中"),
            "计划" if e["col_type"] == "plan" else "实际",
            "是" if e["completed"] else "否",
            (e["description"] or "").replace("\n", " "),
        ])

    output.write("\n=== 计时记录 ===\n")
    writer.writerow(["日期", "任务名称", "计划时间(分钟)", "实际时间(分钟)", "是否完成"])
    for r in timer_records:
        writer.writerow([
            r["date"], r["task_name"], r["planned_minutes"],
            round(r["actual_seconds"] / 60, 1),
            "是" if r["completed"] else "否",
        ])

    csv_content = output.getvalue()
    output.close()

    return Response(
        csv_content,
        mimetype="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="schedule_planner_{datetime.now().strftime("%Y%m%d")}.csv"',
            "Content-Type": "text/csv; charset=utf-8-sig",
        },
    )


@user_bp.route("/api/user/export-ical", methods=["GET"])
@login_required
def export_ical():
    conn = get_db()
    events = conn.execute(
        "SELECT * FROM events WHERE user_id=? AND col_type='actual' ORDER BY date, start_time",
        (g.user_id,),
    ).fetchall()

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//SchedulePlanner//CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:日程规划器",
    ]
    for e in events:
        date_clean = e["date"].replace("-", "")
        start_clean = e["start_time"].replace(":", "") + "00"
        end_clean = e["end_time"].replace(":", "") + "00"
        uid = f"event-{e['id']}@schedule-planner"
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTART:{date_clean}T{start_clean}",
            f"DTEND:{date_clean}T{end_clean}",
            f"SUMMARY:{_ical_escape(e['title'])}",
        ])
        if e["description"]:
            lines.append(f"DESCRIPTION:{_ical_escape(e['description'])}")
        lines.append(f"CATEGORIES:{_ical_escape(e['category'])}")
        if e["completed"]:
            lines.append("STATUS:COMPLETED")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")

    content = "\r\n".join(lines)
    return Response(
        content,
        mimetype="text/calendar",
        headers={
            "Content-Disposition": f'attachment; filename="schedule_{datetime.now().strftime("%Y%m%d")}.ics"',
        },
    )


def _ical_escape(text):
    if not text:
        return ""
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


@user_bp.route("/api/user/import", methods=["POST"])
@login_required
def import_data():
    data = request.json
    if not data:
        return jsonify({"error": "请求数据不能为空"}), 400

    imported_events = data.get("events", [])
    imported_timer = data.get("timer_records", [])
    imported_notes = data.get("notes", [])

    conn = get_db()
    event_count = 0
    old_to_new_id = {}
    for e in imported_events:
        if not e.get("title") or not e.get("date") or not e.get("start_time") or not e.get("end_time"):
            continue
        if not _DATE_RE.match(str(e["date"])):
            continue
        if not _TIME_RE.match(str(e["start_time"])) or not _TIME_RE.match(str(e["end_time"])):
            continue
        col_type = e.get("col_type", "plan")
        if col_type not in ("plan", "actual"):
            col_type = "plan"
        priority = e.get("priority", 2)
        try:
            priority = int(priority)
            if priority not in (1, 2, 3):
                priority = 2
        except (ValueError, TypeError):
            priority = 2
        cursor = conn.execute(
            """INSERT INTO events (user_id, title, description, date, start_time, end_time,
               color, category, priority, completed, col_type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (g.user_id, e["title"], e.get("description", ""), e["date"],
             e["start_time"], e["end_time"], e.get("color", "#6c5ce7"),
             e.get("category", "其他"), priority,
             1 if e.get("completed") else 0, col_type),
        )
        if e.get("id"):
            old_to_new_id[e["id"]] = cursor.lastrowid
        event_count += 1

    for e in imported_events:
        old_id = e.get("id")
        old_link = e.get("link_id")
        if old_id and old_link and old_id in old_to_new_id and old_link in old_to_new_id:
            conn.execute(
                "UPDATE events SET link_id=? WHERE id=?",
                (old_to_new_id[old_link], old_to_new_id[old_id]),
            )

    timer_count = 0
    for r in imported_timer:
        if not r.get("task_name") or not r.get("date"):
            continue
        if not _DATE_RE.match(str(r["date"])):
            continue
        try:
            planned = max(0, int(r.get("planned_minutes", 0)))
            actual = max(0, int(r.get("actual_seconds", 0)))
        except (ValueError, TypeError):
            continue
        conn.execute(
            """INSERT INTO timer_records (user_id, task_name, planned_minutes, actual_seconds, date, completed)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (g.user_id, r["task_name"], planned, actual,
             r["date"], 1 if r.get("completed") else 0),
        )
        timer_count += 1

    note_count = 0
    for n in imported_notes:
        if not n.get("date"):
            continue
        if not _DATE_RE.match(str(n["date"])):
            continue
        existing = conn.execute(
            "SELECT id FROM notes WHERE user_id=? AND date=?", (g.user_id, n["date"])
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE notes SET content=?, updated_at=datetime('now','localtime') WHERE id=?",
                (n.get("content", ""), existing["id"]),
            )
        else:
            conn.execute(
                "INSERT INTO notes (user_id, date, content) VALUES (?, ?, ?)",
                (g.user_id, n["date"], n.get("content", "")),
            )
        note_count += 1

    conn.commit()

    return jsonify({
        "success": True,
        "message": f"导入完成：{event_count} 个日程、{timer_count} 条计时记录、{note_count} 条笔记",
        "counts": {"events": event_count, "timer_records": timer_count, "notes": note_count},
    })


@user_bp.route("/api/user/delete-account", methods=["DELETE"])
@login_required
def delete_account():
    data = request.json or {}
    password = data.get("password") or ""

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id=?", (g.user_id,)).fetchone()
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "密码错误"}), 400

    conn.execute("DELETE FROM events WHERE user_id=?", (g.user_id,))
    conn.execute("DELETE FROM timer_records WHERE user_id=?", (g.user_id,))
    conn.execute("DELETE FROM notes WHERE user_id=?", (g.user_id,))
    conn.execute("DELETE FROM event_templates WHERE user_id=?", (g.user_id,))
    conn.execute("DELETE FROM user_settings WHERE user_id=?", (g.user_id,))
    conn.execute("DELETE FROM deleted_events WHERE user_id=?", (g.user_id,))
    conn.execute("DELETE FROM verification_codes WHERE email=(SELECT email FROM users WHERE id=?)", (g.user_id,))
    conn.execute("DELETE FROM users WHERE id=?", (g.user_id,))
    conn.commit()

    if user["avatar"]:
        avatar_path = os.path.join(AVATAR_FOLDER, user["avatar"])
        if os.path.exists(avatar_path):
            try:
                os.remove(avatar_path)
            except OSError:
                pass

    session.clear()
    return jsonify({"success": True, "message": "账户已删除"})

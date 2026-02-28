import csv
import io
import logging
import re
import uuid
from datetime import datetime

from flask import Blueprint, request, jsonify, g, session, Response
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

from config import ALLOWED_AVATAR_EXTENSIONS, AVATAR_MAX_SIZE, SESSION_KEY_PREFIX
from database import get_db
from auth_utils import login_required, validate_password, validate_date
from storage import get_storage
from redis_client import get_redis

logger = logging.getLogger(__name__)

user_bp = Blueprint("user", __name__)

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^\d{2}:\d{2}$")


def _allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_AVATAR_EXTENSIONS



@user_bp.route("/api/user/profile", methods=["GET"])
@login_required
def get_profile():
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id=%s", (g.user_id,)).fetchone()
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

    language_provided = "language" in (data or {})
    language = data.get("language")
    if language and language not in ("en", "zh-CN", "zh-TW", "fr", "de", "ja", "ar", "he"):
        language = None

    conn = get_db()
    if language_provided:
        conn.execute(
            "UPDATE users SET username=%s, bio=%s, language=%s, updated_at=NOW() WHERE id=%s",
            (username, bio, language or None, g.user_id),
        )
    else:
        conn.execute(
            "UPDATE users SET username=%s, bio=%s, updated_at=NOW() WHERE id=%s",
            (username, bio, g.user_id),
        )
    conn.commit()
    user = conn.execute("SELECT * FROM users WHERE id=%s", (g.user_id,)).fetchone()
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

    storage = get_storage()

    ext = file.filename.rsplit(".", 1)[1].lower()
    filename = f"{g.user_id}_{uuid.uuid4().hex[:8]}.{ext}"
    relative_path = f"avatars/{filename}"

    try:
        from PIL import Image

        img = Image.open(file.stream)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
            ext = "jpg"
            filename = f"{g.user_id}_{uuid.uuid4().hex[:8]}.{ext}"
            relative_path = f"avatars/{filename}"

        width, height = img.size
        side = min(width, height)
        left = (width - side) // 2
        top = (height - side) // 2
        img = img.crop((left, top, left + side, top + side))
        img = img.resize(AVATAR_MAX_SIZE, Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format="JPEG" if ext == "jpg" else ext.upper(), quality=90)
        storage.save(buf.getvalue(), relative_path)
    except ImportError:
        # Pillow 未安装，直接存储原始文件
        file.stream.seek(0)
        storage.save(file.stream, relative_path)
    except Exception as e:
        logger.warning("头像图片处理失败: %s", e)
        return jsonify({"error": "图片处理失败，请上传有效的图片文件"}), 400

    conn = get_db()
    old = conn.execute(
        "SELECT avatar FROM users WHERE id=%s", (g.user_id,)
    ).fetchone()

    try:
        conn.execute(
            "UPDATE users SET avatar=%s, updated_at=NOW() WHERE id=%s",
            (filename, g.user_id),
        )
        conn.commit()
    except Exception:
        storage.delete(relative_path)
        logger.error("保存头像记录失败，已清理存储文件: %s", relative_path)
        return jsonify({"error": "头像保存失败，请重试"}), 500

    if old and old["avatar"]:
        storage.delete(f"avatars/{old['avatar']}")

    return jsonify({"avatar": filename, "url": storage.url(relative_path)})


@user_bp.route("/uploads/avatars/<filename>")
@login_required
def serve_avatar(filename):
    filename = secure_filename(filename)
    storage = get_storage()
    return storage.serve(f"avatars/{filename}")


@user_bp.route("/api/user/settings", methods=["GET"])
@login_required
def get_settings():
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM user_settings WHERE user_id=%s", (g.user_id,)
    ).fetchone()
    if row:
        return jsonify(dict(row))
    return jsonify({"user_id": g.user_id, "daily_goal_hours": 8.0})


@user_bp.route("/api/user/settings", methods=["PUT"])
@login_required
def update_settings():
    data = request.json or {}
    daily_goal = data.get("daily_goal_hours")
    if daily_goal is None:
        return jsonify({"error": "daily_goal_hours 不能为空"}), 400
    try:
        daily_goal = float(daily_goal)
        if daily_goal < 0.5 or daily_goal > 24:
            return jsonify({"error": "目标时长需在 0.5-24 小时之间"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "无效的目标时长"}), 400

    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM user_settings WHERE user_id=%s", (g.user_id,)
    ).fetchone()
    if existing:
        conn.execute(
            "UPDATE user_settings SET daily_goal_hours=%s, updated_at=NOW() WHERE user_id=%s",
            (daily_goal, g.user_id),
        )
    else:
        conn.execute(
            "INSERT INTO user_settings (user_id, daily_goal_hours) VALUES (%s, %s)",
            (g.user_id, daily_goal),
        )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM user_settings WHERE user_id=%s", (g.user_id,)
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

    valid, msg = validate_password(new_password)
    if not valid:
        return jsonify({"error": msg}), 400

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id=%s", (g.user_id,)).fetchone()
    if not user or not check_password_hash(user["password_hash"], old_password):
        return jsonify({"error": "原密码错误"}), 400

    password_hash = generate_password_hash(new_password)
    conn.execute(
        "UPDATE users SET password_hash=%s, updated_at=NOW() WHERE id=%s",
        (password_hash, g.user_id),
    )
    conn.commit()

    return jsonify({"success": True, "message": "密码修改成功"})


@user_bp.route("/api/user/export", methods=["GET"])
@login_required
def export_data():
    conn = get_db()
    events = conn.execute(
        "SELECT * FROM events WHERE user_id=%s ORDER BY date, start_time",
        (g.user_id,),
    ).fetchall()
    timer_records = conn.execute(
        "SELECT * FROM timer_records WHERE user_id=%s ORDER BY date, created_at",
        (g.user_id,),
    ).fetchall()
    notes = conn.execute(
        "SELECT * FROM notes WHERE user_id=%s ORDER BY date", (g.user_id,)
    ).fetchall()
    user = conn.execute("SELECT * FROM users WHERE id=%s", (g.user_id,)).fetchone()
    if not user:
        return jsonify({"error": "用户不存在"}), 404

    STRIP_FIELDS = {"id", "user_id"}

    exported_events = [
        {k: v for k, v in dict(e).items() if k not in STRIP_FIELDS}
        for e in events
    ]

    exported_timer = [
        {k: v for k, v in dict(r).items() if k not in STRIP_FIELDS}
        for r in timer_records
    ]

    exported_notes = [
        {k: v for k, v in dict(n).items() if k not in STRIP_FIELDS}
        for n in notes
        if (n["content"] or "").strip()
    ]

    export = {
        "exported_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "user": {
            "username": user["username"],
            "email": user["email"],
            "created_at": user["created_at"],
        },
        "events": exported_events,
        "timer_records": exported_timer,
        "notes": exported_notes,
    }

    return jsonify(export), 200, {
        "Content-Disposition": f'attachment; filename="schedule_planner_export_{datetime.now().strftime("%Y%m%d")}.json"'
    }


@user_bp.route("/api/user/export-csv", methods=["GET"])
@login_required
def export_csv():
    conn = get_db()
    events = conn.execute(
        "SELECT * FROM events WHERE user_id=%s ORDER BY date, start_time",
        (g.user_id,),
    ).fetchall()
    timer_records = conn.execute(
        "SELECT * FROM timer_records WHERE user_id=%s ORDER BY date, created_at",
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
        "SELECT * FROM events WHERE user_id=%s AND col_type='actual' ORDER BY date, start_time",
        (g.user_id,),
    ).fetchall()

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//SchedulePlanner//CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:日程规划器",
        "X-WR-TIMEZONE:UTC",
    ]
    for e in events:
        date_clean = e["date"].replace("-", "")
        start_clean = e["start_time"].replace(":", "") + "00"
        end_clean = e["end_time"].replace(":", "") + "00"
        uid = f"event-{e['id']}@schedule-planner"
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTART:{date_clean}T{start_clean}Z",
            f"DTEND:{date_clean}T{end_clean}Z",
            f"SUMMARY:{_ical_escape(e['title'])}",
        ])
        if e["description"]:
            lines.append(f"DESCRIPTION:{_ical_escape(e['description'])}")
        lines.append(f"CATEGORIES:{_ical_escape(e['category'])}")
        if e["completed"]:
            lines.append("STATUS:COMPLETED")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")

    content = "\r\n".join(_ical_fold_line(l) for l in lines) + "\r\n"
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


def _ical_fold_line(line):
    """Fold an iCal content line per RFC 5545 (max 75 octets per line, excluding CRLF)."""
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return line
    segments = []
    remaining = encoded
    limit = 75
    while remaining:
        chunk = remaining[:limit]
        # Back up to avoid splitting a multi-byte UTF-8 sequence
        while len(chunk) > 1 and (chunk[-1] & 0xC0) == 0x80:
            chunk = chunk[:-1]
        segments.append(chunk.decode("utf-8"))
        remaining = remaining[len(chunk):]
        limit = 74  # continuation lines: 74 bytes content + 1 byte leading space = 75
    return "\r\n ".join(segments)


@user_bp.route("/api/user/import", methods=["POST"])
@login_required
def import_data():
    data = request.json
    if not data:
        return jsonify({"error": "请求数据不能为空"}), 400

    imported_events = data.get("events", [])
    imported_timer = data.get("timer_records", [])
    imported_notes = data.get("notes", [])

    _COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
    _DEFAULT_COLOR = "#6c5ce7"
    _MAX_NOTE_LEN = 100_000

    conn = get_db()
    event_count = 0
    for e in imported_events:
        title = (e.get("title") or "").strip()
        if not title or not e.get("date") or not e.get("start_time") or not e.get("end_time"):
            continue
        if not validate_date(str(e["date"])):
            continue
        if not _TIME_RE.match(str(e["start_time"])) or not _TIME_RE.match(str(e["end_time"])):
            continue
        title = title[:200]
        description = (e.get("description") or "")[:5000]
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
        raw_color = e.get("color") or ""
        color = raw_color if _COLOR_RE.match(raw_color) else _DEFAULT_COLOR
        conn.execute(
            """INSERT INTO events (user_id, title, description, date, start_time, end_time,
               color, category, priority, completed, col_type)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (g.user_id, title, description, e["date"],
             e["start_time"], e["end_time"], color,
             e.get("category", "其他"), priority,
             1 if e.get("completed") else 0, col_type),
        )
        event_count += 1

    timer_count = 0
    for r in imported_timer:
        task_name = (r.get("task_name") or "").strip()
        if not task_name or not r.get("date"):
            continue
        if not validate_date(str(r["date"])):
            continue
        task_name = task_name[:200]
        try:
            planned = max(0, min(int(r.get("planned_minutes", 0)), 1440))
            actual = max(0, min(int(r.get("actual_seconds", 0)), 86400))
        except (ValueError, TypeError):
            continue
        conn.execute(
            """INSERT INTO timer_records (user_id, task_name, planned_minutes, actual_seconds, date, completed)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (g.user_id, task_name, planned, actual,
             r["date"], 1 if r.get("completed") else 0),
        )
        timer_count += 1

    note_count = 0
    for n in imported_notes:
        if not n.get("date"):
            continue
        if not validate_date(str(n["date"])):
            continue
        content = n.get("content", "")
        if not content.strip():
            continue
        content = content[:_MAX_NOTE_LEN]
        conn.execute(
            "INSERT INTO notes (user_id, date, content) VALUES (%s, %s, %s)",
            (g.user_id, n["date"], content),
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
    user = conn.execute("SELECT * FROM users WHERE id=%s", (g.user_id,)).fetchone()
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "密码错误"}), 400

    note_images = conn.execute(
        "SELECT storage_path FROM note_images WHERE user_id=%s", (g.user_id,)
    ).fetchall()

    # Clear all Redis sessions for this user before deleting the account
    session_rows = conn.execute(
        "SELECT session_id FROM user_sessions WHERE user_id=%s", (g.user_id,)
    ).fetchall()
    r = get_redis()
    for sr in session_rows:
        r.delete(SESSION_KEY_PREFIX + sr["session_id"])

    conn.execute("DELETE FROM events WHERE user_id=%s", (g.user_id,))
    conn.execute("DELETE FROM timer_records WHERE user_id=%s", (g.user_id,))
    conn.execute("DELETE FROM notes WHERE user_id=%s", (g.user_id,))
    conn.execute("DELETE FROM note_images WHERE user_id=%s", (g.user_id,))
    conn.execute("DELETE FROM event_templates WHERE user_id=%s", (g.user_id,))
    conn.execute("DELETE FROM user_settings WHERE user_id=%s", (g.user_id,))
    conn.execute("DELETE FROM deleted_events WHERE user_id=%s", (g.user_id,))
    conn.execute("DELETE FROM verification_codes WHERE email=(SELECT email FROM users WHERE id=%s)", (g.user_id,))
    conn.execute("DELETE FROM users WHERE id=%s", (g.user_id,))
    conn.commit()

    storage = get_storage()
    if user["avatar"]:
        storage.delete(f"avatars/{user['avatar']}")
    for row in note_images:
        storage.delete(row["storage_path"])

    session.clear()
    return jsonify({"success": True, "message": "账户已删除"})

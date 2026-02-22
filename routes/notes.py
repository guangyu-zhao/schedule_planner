import re
from flask import Blueprint, request, jsonify, g
from database import get_db
from auth_utils import login_required

notes_bp = Blueprint("notes", __name__)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_NOTE_LENGTH = 100_000


@notes_bp.route("/api/notes/search", methods=["GET"])
@login_required
def search_notes():
    """Search notes by keyword in content."""
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify([])
    try:
        limit = min(int(request.args.get("limit", 50)), 200)
    except (ValueError, TypeError):
        limit = 50
    conn = get_db()
    keyword = f"%{q.replace('%', '').replace('_', '')}%"
    notes = conn.execute(
        """SELECT * FROM notes WHERE user_id=? AND content LIKE ?
           ORDER BY date DESC LIMIT ?""",
        (g.user_id, keyword, limit),
    ).fetchall()
    return jsonify([dict(n) for n in notes])


@notes_bp.route("/api/notes", methods=["GET"])
@login_required
def get_note():
    date = request.args.get("date", "")
    if not DATE_RE.match(date):
        return jsonify({"error": "日期格式不正确"}), 400
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM notes WHERE user_id=? AND date = ?", (g.user_id, date)
    ).fetchone()
    if row:
        return jsonify(dict(row))
    return jsonify({"date": date, "content": ""})


@notes_bp.route("/api/notes", methods=["PUT"])
@login_required
def save_note():
    data = request.json
    if not data:
        return jsonify({"error": "请求数据不能为空"}), 400
    date = data.get("date", "")
    content = data.get("content", "")
    if not DATE_RE.match(date):
        return jsonify({"error": "日期格式不正确"}), 400
    if len(content) > MAX_NOTE_LENGTH:
        return jsonify({"error": f"笔记内容不能超过 {MAX_NOTE_LENGTH} 个字符"}), 400

    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM notes WHERE user_id=? AND date = ?", (g.user_id, date)
    ).fetchone()
    if existing:
        conn.execute(
            "UPDATE notes SET content=?, updated_at=datetime('now','localtime') WHERE user_id=? AND date=?",
            (content, g.user_id, date),
        )
    else:
        conn.execute(
            "INSERT INTO notes (user_id, date, content) VALUES (?, ?, ?)",
            (g.user_id, date, content),
        )
    conn.commit()
    return jsonify({"success": True})

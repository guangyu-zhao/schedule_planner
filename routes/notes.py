import re
from flask import Blueprint, request, jsonify, g
from database import get_db
from auth_utils import login_required

notes_bp = Blueprint("notes", __name__)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_NOTE_LENGTH = 100_000


@notes_bp.route("/api/notes/dates", methods=["GET"])
@login_required
def notes_dates():
    """Return dates that have non-empty notes, within a date range."""
    start = request.args.get("start", "")
    end   = request.args.get("end",   "")
    if not DATE_RE.match(start) or not DATE_RE.match(end):
        return jsonify([])
    conn = get_db()
    rows = conn.execute(
        """SELECT date FROM notes WHERE user_id=? AND date BETWEEN ? AND ?
           AND content IS NOT NULL AND content != '' ORDER BY date""",
        (g.user_id, start, end),
    ).fetchall()
    return jsonify([r["date"] for r in rows])


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
    case_sensitive = request.args.get("case_sensitive") == "1"
    whole_word     = request.args.get("whole_word")     == "1"
    use_regex      = request.args.get("regex")          == "1"
    conn = get_db()

    if use_regex:
        try:
            flags = 0 if case_sensitive else re.IGNORECASE
            pattern = re.compile(q, flags)
        except re.error as exc:
            return jsonify({"error": str(exc)}), 400
        rows = conn.execute(
            "SELECT * FROM notes WHERE user_id=? ORDER BY date DESC",
            (g.user_id,),
        ).fetchall()
        return jsonify([dict(r) for r in rows if pattern.search(r["content"] or "")][:limit])

    # Non-regex: LIKE broad filter then Python-refine
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    keyword = f"%{escaped}%"
    fetch_limit = limit * 5 if (case_sensitive or whole_word) else limit
    rows = conn.execute(
        """SELECT * FROM notes WHERE user_id=? AND content LIKE ? ESCAPE '\\'
           ORDER BY date DESC LIMIT ?""",
        (g.user_id, keyword, fetch_limit),
    ).fetchall()

    if whole_word:
        flags = 0 if case_sensitive else re.IGNORECASE
        pattern = re.compile(r"\b" + re.escape(q) + r"\b", flags)
        notes = [dict(r) for r in rows if pattern.search(r["content"] or "")]
    elif case_sensitive:
        notes = [dict(r) for r in rows if q in (r["content"] or "")]
    else:
        notes = [dict(r) for r in rows]

    return jsonify(notes[:limit])


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

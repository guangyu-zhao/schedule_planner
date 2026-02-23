import io
import logging
import re
import uuid

from flask import Blueprint, request, jsonify, g
from werkzeug.utils import secure_filename

from config import ALLOWED_NOTE_IMAGE_EXTENSIONS, NOTE_IMAGE_MAX_SIZE
from database import get_db
from auth_utils import login_required
from storage import get_storage

logger = logging.getLogger(__name__)

notes_bp = Blueprint("notes", __name__)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_NOTE_LENGTH = 100_000


def _allowed_image(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_NOTE_IMAGE_EXTENSIONS


@notes_bp.route("/api/notes/images", methods=["POST"])
@login_required
def upload_note_image():
    if "image" not in request.files:
        return jsonify({"error": "请选择图片文件"}), 400

    file = request.files["image"]
    if not file.filename or not _allowed_image(file.filename):
        return jsonify({"error": "不支持的文件格式，请上传 PNG/JPG/GIF/WebP"}), 400

    storage = get_storage()
    ext = file.filename.rsplit(".", 1)[1].lower()
    token = uuid.uuid4().hex
    storage_path = f"note_images/{g.user_id}/{token}.{ext}"

    try:
        from PIL import Image

        img = Image.open(file.stream)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGBA" if ext == "png" else "RGB")
            if ext not in ("png", "gif"):
                ext = "jpg"
                storage_path = f"note_images/{g.user_id}/{token}.{ext}"

        width, height = img.size
        max_w, max_h = NOTE_IMAGE_MAX_SIZE
        if width > max_w or height > max_h:
            img.thumbnail(NOTE_IMAGE_MAX_SIZE, Image.LANCZOS)

        buf = io.BytesIO()
        fmt = "JPEG" if ext in ("jpg", "jpeg") else ext.upper()
        save_kwargs = {"quality": 88} if fmt == "JPEG" else {}
        img.save(buf, format=fmt, **save_kwargs)
        storage.save(buf.getvalue(), storage_path)
    except ImportError:
        file.stream.seek(0)
        storage.save(file.stream, storage_path)
    except Exception as e:
        logger.warning("笔记图片处理失败: %s", e)
        return jsonify({"error": "图片处理失败，请上传有效的图片文件"}), 400

    conn = get_db()
    conn.execute(
        "INSERT INTO note_images (user_id, token, storage_path) VALUES (?, ?, ?)",
        (g.user_id, token, storage_path),
    )
    conn.commit()

    return jsonify({"token": token})


@notes_bp.route("/api/notes/images/<token>")
@login_required
def serve_note_image(token):
    if not re.match(r"^[0-9a-f]{32}$", token):
        return jsonify({"error": "无效的图片令牌"}), 404

    conn = get_db()
    row = conn.execute(
        "SELECT storage_path FROM note_images WHERE token=? AND user_id=?",
        (token, g.user_id),
    ).fetchone()
    if not row:
        return jsonify({"error": "图片不存在或无权访问"}), 404

    storage = get_storage()
    return storage.serve(row["storage_path"])


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
        """SELECT DISTINCT date FROM notes WHERE user_id=? AND date BETWEEN ? AND ?
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
def list_notes():
    """Return all notes for a given date, ordered by creation time."""
    date = request.args.get("date", "")
    if not DATE_RE.match(date):
        return jsonify({"error": "日期格式不正确"}), 400
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM notes WHERE user_id=? AND date=? ORDER BY id",
        (g.user_id, date),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@notes_bp.route("/api/notes", methods=["POST"])
@login_required
def create_note():
    """Create a new note for a date. Only saves if content is non-empty."""
    data = request.json
    if not data:
        return jsonify({"error": "请求数据不能为空"}), 400
    date = data.get("date", "")
    content = data.get("content", "")
    if not DATE_RE.match(date):
        return jsonify({"error": "日期格式不正确"}), 400
    if not content.strip():
        return jsonify({"error": "笔记内容不能为空"}), 400
    if len(content) > MAX_NOTE_LENGTH:
        return jsonify({"error": f"笔记内容不能超过 {MAX_NOTE_LENGTH} 个字符"}), 400

    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO notes (user_id, date, content) VALUES (?, ?, ?)",
        (g.user_id, date, content),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM notes WHERE id=?", (cursor.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@notes_bp.route("/api/notes/<int:note_id>", methods=["PUT"])
@login_required
def update_note(note_id):
    """Update the content of an existing note."""
    data = request.json
    if not data:
        return jsonify({"error": "请求数据不能为空"}), 400
    content = data.get("content", "")
    if len(content) > MAX_NOTE_LENGTH:
        return jsonify({"error": f"笔记内容不能超过 {MAX_NOTE_LENGTH} 个字符"}), 400

    conn = get_db()
    row = conn.execute(
        "SELECT id FROM notes WHERE id=? AND user_id=?", (note_id, g.user_id)
    ).fetchone()
    if not row:
        return jsonify({"error": "笔记不存在"}), 404

    conn.execute(
        "UPDATE notes SET content=?, updated_at=datetime('now','localtime') WHERE id=?",
        (content, note_id),
    )
    conn.commit()
    return jsonify({"success": True})


@notes_bp.route("/api/notes/<int:note_id>", methods=["DELETE"])
@login_required
def delete_note(note_id):
    """Delete a note by ID."""
    conn = get_db()
    row = conn.execute(
        "SELECT id FROM notes WHERE id=? AND user_id=?", (note_id, g.user_id)
    ).fetchone()
    if not row:
        return jsonify({"error": "笔记不存在"}), 404

    conn.execute("DELETE FROM notes WHERE id=?", (note_id,))
    conn.commit()
    return jsonify({"success": True})

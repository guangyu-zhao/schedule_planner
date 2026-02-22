from flask import Blueprint, request, jsonify
from database import get_db

notes_bp = Blueprint("notes", __name__)


@notes_bp.route("/api/notes", methods=["GET"])
def get_note():
    date = request.args.get("date")
    conn = get_db()
    row = conn.execute("SELECT * FROM notes WHERE date = ?", (date,)).fetchone()
    conn.close()
    if row:
        return jsonify(dict(row))
    return jsonify({"date": date, "content": ""})


@notes_bp.route("/api/notes", methods=["PUT"])
def save_note():
    data = request.json
    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM notes WHERE date = ?", (data["date"],)
    ).fetchone()
    if existing:
        conn.execute(
            "UPDATE notes SET content=?, updated_at=datetime('now','localtime') WHERE date=?",
            (data["content"], data["date"]),
        )
    else:
        conn.execute(
            "INSERT INTO notes (date, content) VALUES (?, ?)",
            (data["date"], data["content"]),
        )
    conn.commit()
    conn.close()
    return jsonify({"success": True})

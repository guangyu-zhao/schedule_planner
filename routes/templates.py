from flask import Blueprint, request, jsonify, g
from database import get_db
from auth_utils import login_required

templates_bp = Blueprint("templates", __name__)

MAX_TEMPLATES = 50


@templates_bp.route("/api/templates", methods=["GET"])
@login_required
def get_templates():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM event_templates WHERE user_id=? ORDER BY created_at DESC",
        (g.user_id,),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@templates_bp.route("/api/templates", methods=["POST"])
@login_required
def create_template():
    data = request.json or {}
    name = (data.get("name") or "").strip()
    title = (data.get("title") or "").strip()
    if not name or not title:
        return jsonify({"error": "模板名称和任务标题不能为空"}), 400
    if len(name) > 50 or len(title) > 100:
        return jsonify({"error": "名称或标题过长"}), 400

    conn = get_db()
    count = conn.execute(
        "SELECT COUNT(*) as c FROM event_templates WHERE user_id=?", (g.user_id,)
    ).fetchone()["c"]
    if count >= MAX_TEMPLATES:
        return jsonify({"error": f"模板数量已达上限 ({MAX_TEMPLATES})"}), 400

    try:
        duration = min(max(int(data.get("duration_minutes", 60)), 5), 480)
    except (ValueError, TypeError):
        duration = 60
    cursor = conn.execute(
        """INSERT INTO event_templates (user_id, name, title, description, duration_minutes, color, category, priority)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            g.user_id,
            name,
            title,
            data.get("description", ""),
            duration,
            data.get("color", "#6c5ce7"),
            data.get("category", "其他"),
            min(max(int(data.get("priority", 2)), 1), 3),
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM event_templates WHERE id=?", (cursor.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@templates_bp.route("/api/templates/<int:template_id>", methods=["DELETE"])
@login_required
def delete_template(template_id):
    conn = get_db()
    conn.execute(
        "DELETE FROM event_templates WHERE id=? AND user_id=?", (template_id, g.user_id)
    )
    conn.commit()
    return jsonify({"success": True})

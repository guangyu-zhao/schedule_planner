from flask import Blueprint, request, jsonify, g

from database import get_db
from auth_utils import login_required

todos_bp = Blueprint("todos", __name__)

MAX_TODO_TEXT = 500
MAX_TODOS = 200


@todos_bp.route("/api/todos", methods=["GET"])
@login_required
def list_todos():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM todos WHERE user_id=? ORDER BY sort_order ASC, id ASC",
        (g.user_id,),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@todos_bp.route("/api/todos", methods=["POST"])
@login_required
def create_todo():
    data = request.json
    if not data:
        return jsonify({"error": "请求数据不能为空"}), 400
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "待办内容不能为空"}), 400
    if len(text) > MAX_TODO_TEXT:
        return jsonify({"error": f"待办内容不能超过 {MAX_TODO_TEXT} 个字符"}), 400

    conn = get_db()
    count = conn.execute(
        "SELECT COUNT(*) FROM todos WHERE user_id=?", (g.user_id,)
    ).fetchone()[0]
    if count >= MAX_TODOS:
        return jsonify({"error": f"待办数量不能超过 {MAX_TODOS} 条"}), 400

    # Insert at the top: sort_order = min existing - 1 (or 0 if empty)
    min_order = conn.execute(
        "SELECT MIN(sort_order) FROM todos WHERE user_id=?", (g.user_id,)
    ).fetchone()[0]
    sort_order = (min_order - 1) if min_order is not None else 0

    cursor = conn.execute(
        "INSERT INTO todos (user_id, text, done, sort_order) VALUES (?, ?, 0, ?)",
        (g.user_id, text, sort_order),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM todos WHERE id=?", (cursor.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@todos_bp.route("/api/todos/<int:todo_id>", methods=["PUT"])
@login_required
def update_todo(todo_id):
    data = request.json
    if not data:
        return jsonify({"error": "请求数据不能为空"}), 400

    conn = get_db()
    row = conn.execute(
        "SELECT id FROM todos WHERE id=? AND user_id=?", (todo_id, g.user_id)
    ).fetchone()
    if not row:
        return jsonify({"error": "待办不存在"}), 404

    fields = []
    params = []
    if "done" in data:
        fields.append("done=?")
        params.append(1 if data["done"] else 0)
    if "text" in data:
        text = (data["text"] or "").strip()
        if not text:
            return jsonify({"error": "待办内容不能为空"}), 400
        if len(text) > MAX_TODO_TEXT:
            return jsonify({"error": f"待办内容不能超过 {MAX_TODO_TEXT} 个字符"}), 400
        fields.append("text=?")
        params.append(text)
    if "sort_order" in data:
        fields.append("sort_order=?")
        params.append(int(data["sort_order"]))

    if not fields:
        return jsonify({"error": "没有可更新的字段"}), 400

    params.extend([todo_id, g.user_id])
    conn.execute(
        f"UPDATE todos SET {', '.join(fields)} WHERE id=? AND user_id=?",
        params,
    )
    conn.commit()
    return jsonify({"success": True})


@todos_bp.route("/api/todos/<int:todo_id>", methods=["DELETE"])
@login_required
def delete_todo(todo_id):
    conn = get_db()
    row = conn.execute(
        "SELECT id FROM todos WHERE id=? AND user_id=?", (todo_id, g.user_id)
    ).fetchone()
    if not row:
        return jsonify({"error": "待办不存在"}), 404

    conn.execute("DELETE FROM todos WHERE id=? AND user_id=?", (todo_id, g.user_id))
    conn.commit()
    return jsonify({"success": True})

import calendar
import re
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g
from database import get_db
from auth_utils import login_required, validate_date, run_regex_with_timeout

events_bp = Blueprint("events", __name__)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_DEFAULT_COLOR = "#6c5ce7"


def _normalize_color(color):
    """Return color if it's a valid #rrggbb hex, else the default."""
    return color if (color and COLOR_RE.match(color)) else _DEFAULT_COLOR


def _validate_event_data(data, require_all=True):
    if not data:
        return "请求数据不能为空"
    title = (data.get("title") or "").strip()
    if require_all and not title:
        return "标题不能为空"
    if title and len(title) > 200:
        return "标题不能超过 200 个字符"
    desc = data.get("description", "")
    if desc and len(desc) > 5000:
        return "备注不能超过 5000 个字符"
    date = data.get("date", "")
    if require_all and not validate_date(date):
        return "日期格式不正确"
    start_time = data.get("start_time", "")
    end_time = data.get("end_time", "")
    if require_all and (not TIME_RE.match(start_time) or not TIME_RE.match(end_time)):
        return "时间格式不正确"
    if require_all and start_time >= end_time:
        return "结束时间必须晚于开始时间"
    return None


@events_bp.route("/api/events", methods=["GET"])
@login_required
def get_events():
    start = request.args.get("start", "")
    end = request.args.get("end", "")
    if not validate_date(start) or not validate_date(end):
        return jsonify({"error": "日期参数格式不正确"}), 400
    conn = get_db()
    events = conn.execute(
        "SELECT * FROM events WHERE user_id=? AND date >= ? AND date <= ? ORDER BY date, start_time",
        (g.user_id, start, end),
    ).fetchall()
    return jsonify([dict(e) for e in events])


@events_bp.route("/api/events", methods=["POST"])
@login_required
def create_event():
    data = request.json
    if not data:
        return jsonify({"error": "请求数据不能为空"}), 400
    err = _validate_event_data(data)
    if err:
        return jsonify({"error": err}), 400

    col_type = data.get("col_type", "plan")
    if col_type not in ("plan", "actual"):
        return jsonify({"error": "无效的列类型"}), 400

    recur_rule = data.get("recur_rule") or None
    if recur_rule and recur_rule not in ("daily", "weekdays", "weekly", "monthly"):
        recur_rule = None

    conn = get_db()
    cursor = conn.execute(
        """INSERT INTO events (user_id, title, description, date, start_time, end_time,
           color, category, priority, col_type, recur_rule)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            g.user_id,
            data["title"].strip(),
            data.get("description", ""),
            data["date"],
            data["start_time"],
            data["end_time"],
            _normalize_color(data.get("color")),
            data.get("category", "工作"),
            int(data.get("priority", 1)),
            col_type,
            recur_rule,
        ),
    )
    conn.commit()
    new_id = cursor.lastrowid

    new_event = dict(
        conn.execute("SELECT * FROM events WHERE id=?", (new_id,)).fetchone()
    )
    return jsonify({"event": new_event}), 201


@events_bp.route("/api/events/<int:event_id>", methods=["PUT"])
@login_required
def update_event(event_id):
    data = request.json
    if not data:
        return jsonify({"error": "请求数据不能为空"}), 400
    err = _validate_event_data(data)
    if err:
        return jsonify({"error": err}), 400

    conn = get_db()
    existing = conn.execute(
        "SELECT id, col_type FROM events WHERE id=? AND user_id=?", (event_id, g.user_id)
    ).fetchone()
    if not existing:
        return jsonify({"error": "事件不存在"}), 404

    recur_rule = data.get("recur_rule") or None
    if recur_rule and recur_rule not in ("daily", "weekdays", "weekly", "monthly"):
        recur_rule = None

    col_type = data.get("col_type")
    if col_type not in ("plan", "actual"):
        col_type = existing["col_type"]

    conn.execute(
        """UPDATE events SET title=?, description=?, date=?, start_time=?, end_time=?,
           color=?, category=?, priority=?, completed=?, recur_rule=?, col_type=?,
           updated_at=datetime('now','localtime')
           WHERE id=? AND user_id=?""",
        (
            data["title"].strip(),
            data.get("description", ""),
            data["date"],
            data["start_time"],
            data["end_time"],
            _normalize_color(data.get("color")),
            data.get("category", "工作"),
            int(data.get("priority", 1)),
            int(data.get("completed", 0)),
            recur_rule,
            col_type,
            event_id,
            g.user_id,
        ),
    )
    conn.commit()
    event = conn.execute("SELECT * FROM events WHERE id=? AND user_id=?", (event_id, g.user_id)).fetchone()
    return jsonify(dict(event))


@events_bp.route("/api/events/batch", methods=["PUT"])
@login_required
def batch_update_events():
    items = request.json
    if not items or not isinstance(items, list):
        return jsonify({"error": "请求数据格式不正确"}), 400
    conn = get_db()
    results = []
    valid_ids = set()
    for item in items:
        if not isinstance(item, dict) or "id" not in item:
            continue
        try:
            item["id"] = int(item["id"])
        except (ValueError, TypeError):
            continue
        start_time = item.get("start_time", "")
        end_time = item.get("end_time", "")
        if not TIME_RE.match(start_time) or not TIME_RE.match(end_time):
            continue
        if start_time >= end_time:
            continue
        conn.execute(
            "UPDATE events SET start_time=?, end_time=?, updated_at=datetime('now','localtime') WHERE id=? AND user_id=?",
            (start_time, end_time, item["id"], g.user_id),
        )
        valid_ids.add(item["id"])
    conn.commit()
    for item in items:
        if not isinstance(item, dict):
            continue
        item_id = item.get("id")
        if item_id not in valid_ids:
            continue
        row = conn.execute(
            "SELECT * FROM events WHERE id=? AND user_id=?", (item_id, g.user_id)
        ).fetchone()
        if row:
            results.append(dict(row))
    return jsonify(results)


@events_bp.route("/api/events/<int:event_id>", methods=["DELETE"])
@login_required
def delete_event(event_id):
    conn = get_db()
    event = conn.execute("SELECT * FROM events WHERE id=? AND user_id=?", (event_id, g.user_id)).fetchone()
    if not event:
        return jsonify({"error": "事件不存在"}), 404
    event_data = dict(event)

    conn.execute(
        """INSERT INTO deleted_events (user_id, original_id, title, description, date,
           start_time, end_time, color, category, priority, completed, col_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (g.user_id, event["id"], event["title"], event["description"], event["date"],
         event["start_time"], event["end_time"], event["color"],
         event["category"], event["priority"], event["completed"], event["col_type"]),
    )
    conn.execute("DELETE FROM events WHERE id=? AND user_id=?", (event_id, g.user_id))
    conn.commit()
    return jsonify({"success": True, "event": event_data})



@events_bp.route("/api/events/<int:event_id>/duplicate", methods=["POST"])
@login_required
def duplicate_event(event_id):
    """Copy a single event to a target date."""
    data = request.json or {}
    target_date = data.get("target_date", "")
    if not DATE_RE.match(target_date):
        return jsonify({"error": "目标日期格式不正确"}), 400

    conn = get_db()
    event = conn.execute(
        "SELECT * FROM events WHERE id=? AND user_id=?", (event_id, g.user_id)
    ).fetchone()
    if not event:
        return jsonify({"error": "事件不存在"}), 404

    src = dict(event)
    cursor = conn.execute(
        """INSERT INTO events (user_id, title, description, date, start_time, end_time,
           color, category, priority, col_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (g.user_id, src["title"], src.get("description", ""), target_date,
         src["start_time"], src["end_time"], src["color"],
         src.get("category", "其他"), src.get("priority", 2), src.get("col_type", "plan")),
    )
    conn.commit()

    new_event = dict(conn.execute("SELECT * FROM events WHERE id=?", (cursor.lastrowid,)).fetchone())
    return jsonify({"event": new_event}), 201


@events_bp.route("/api/events/generate-recurring", methods=["POST"])
@login_required
def generate_recurring():
    """Generate instances for recurring events within a date range."""
    data = request.json or {}
    start = data.get("start", "")
    end = data.get("end", "")
    if not validate_date(start) or not validate_date(end):
        return jsonify({"error": "日期参数格式不正确"}), 400

    conn = get_db()
    recurring = conn.execute(
        "SELECT * FROM events WHERE user_id=? AND recur_rule IS NOT NULL AND col_type='plan'",
        (g.user_id,),
    ).fetchall()

    created = 0
    start_dt = datetime.strptime(start, "%Y-%m-%d")
    end_dt = datetime.strptime(end, "%Y-%m-%d")

    for evt in recurring:
        rule = evt["recur_rule"]
        base_date = datetime.strptime(evt["date"], "%Y-%m-%d")
        dates = _expand_recur(rule, base_date, start_dt, end_dt)

        for d in dates:
            ds = d.strftime("%Y-%m-%d")
            existing = conn.execute(
                "SELECT id FROM events WHERE user_id=? AND date=? AND recur_parent_id=? AND col_type='plan'",
                (g.user_id, ds, evt["id"]),
            ).fetchone()
            if existing:
                continue

            conn.execute(
                """INSERT INTO events (user_id, title, description, date, start_time, end_time,
                   color, category, priority, col_type, recur_parent_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'plan', ?)""",
                (g.user_id, evt["title"], evt["description"], ds,
                 evt["start_time"], evt["end_time"], evt["color"],
                 evt["category"], evt["priority"], evt["id"]),
            )
            created += 1

    if created > 0:
        conn.commit()
    return jsonify({"created": created})


def _expand_recur(rule, base_date, start_dt, end_dt):
    """Return list of dates that match a recurrence rule within a range."""
    dates = []
    limit = 366

    if rule == "monthly":
        d = base_date
        for _ in range(limit):
            if d.month == 12:
                next_year, next_mon = d.year + 1, 1
            else:
                next_year, next_mon = d.year, d.month + 1
            max_day = calendar.monthrange(next_year, next_mon)[1]
            d = d.replace(year=next_year, month=next_mon,
                          day=min(base_date.day, max_day))
            if d > end_dt:
                break
            if d >= start_dt:
                dates.append(d)
        return dates

    d = base_date + timedelta(days=1)
    count = 0
    while d <= end_dt and count < limit:
        if d >= start_dt:
            if rule == "daily":
                dates.append(d)
            elif rule == "weekdays":
                if d.weekday() < 5:
                    dates.append(d)
            elif rule == "weekly":
                if d.weekday() == base_date.weekday():
                    dates.append(d)
        d += timedelta(days=1)
        count += 1

    return dates


@events_bp.route("/api/events/trash", methods=["GET"])
@login_required
def get_trash():
    conn = get_db()
    rows = conn.execute(
        """SELECT * FROM deleted_events WHERE user_id=?
           ORDER BY deleted_at DESC LIMIT 200""",
        (g.user_id,),
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@events_bp.route("/api/events/trash/<int:item_id>/restore", methods=["POST"])
@login_required
def restore_from_trash(item_id):
    conn = get_db()
    item = conn.execute(
        "SELECT * FROM deleted_events WHERE id=? AND user_id=?", (item_id, g.user_id)
    ).fetchone()
    if not item:
        return jsonify({"error": "回收站中不存在此事件"}), 404

    cursor = conn.execute(
        """INSERT INTO events (user_id, title, description, date, start_time, end_time,
           color, category, priority, completed, col_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (g.user_id, item["title"], item["description"], item["date"],
         item["start_time"], item["end_time"], item["color"],
         item["category"], item["priority"], item["completed"], item["col_type"]),
    )
    conn.execute("DELETE FROM deleted_events WHERE id=?", (item_id,))
    conn.commit()

    new_event = conn.execute("SELECT * FROM events WHERE id=?", (cursor.lastrowid,)).fetchone()
    return jsonify({"success": True, "event": dict(new_event)})


@events_bp.route("/api/events/trash", methods=["DELETE"])
@login_required
def empty_trash():
    conn = get_db()
    conn.execute("DELETE FROM deleted_events WHERE user_id=?", (g.user_id,))
    conn.commit()
    return jsonify({"success": True})


@events_bp.route("/api/events/dates", methods=["GET"])
@login_required
def events_dates():
    """Return distinct dates that have at least one event, within a date range."""
    start = request.args.get("start", "")
    end   = request.args.get("end",   "")
    if not validate_date(start) or not validate_date(end):
        return jsonify([])
    conn = get_db()
    rows = conn.execute(
        "SELECT DISTINCT date FROM events WHERE user_id=? AND date BETWEEN ? AND ? ORDER BY date",
        (g.user_id, start, end),
    ).fetchall()
    return jsonify([r["date"] for r in rows])


@events_bp.route("/api/events/search", methods=["GET"])
@login_required
def search_events():
    """Search events by keyword in title/description."""
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
            "SELECT * FROM events WHERE user_id=? ORDER BY date DESC, start_time LIMIT ?",
            (g.user_id, limit * 20),
        ).fetchall()
        matched, err = run_regex_with_timeout(
            pattern, rows,
            [lambda r: r["title"] or "", lambda r: r["description"] or ""],
        )
        if err:
            return jsonify({"error": err}), 400
        return jsonify([dict(r) for r in matched[:limit]])

    # Non-regex: use LIKE for initial broad filter, then Python-refine
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    keyword = f"%{escaped}%"
    fetch_limit = limit * 5 if (case_sensitive or whole_word) else limit
    rows = conn.execute(
        """SELECT * FROM events WHERE user_id=?
           AND (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')
           ORDER BY date DESC, start_time LIMIT ?""",
        (g.user_id, keyword, keyword, fetch_limit),
    ).fetchall()

    if whole_word:
        flags = 0 if case_sensitive else re.IGNORECASE
        pattern = re.compile(r"\b" + re.escape(q) + r"\b", flags)
        events = [dict(r) for r in rows
                  if pattern.search(r["title"] or "") or pattern.search(r["description"] or "")]
    elif case_sensitive:
        events = [dict(r) for r in rows
                  if q in (r["title"] or "") or q in (r["description"] or "")]
    else:
        events = [dict(r) for r in rows]

    return jsonify(events[:limit])

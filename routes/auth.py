import re
import logging
from datetime import datetime

from flask import Blueprint, request, jsonify, session, g
from werkzeug.security import generate_password_hash, check_password_hash

from config import MAX_LOGIN_ATTEMPTS, LOGIN_LOCKOUT_SECONDS, SESSION_KEY_PREFIX
from database import get_db
from redis_client import get_redis
from auth_utils import (
    login_required,
    get_current_user,
    generate_verification_code,
    send_verification_email,
    store_verification_code,
    verify_code,
    check_reset_session_valid,
    validate_password,
)

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__)

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


def _validate_email(email):
    return bool(EMAIL_RE.match(email or ""))


# ──────────────────────── Redis-based login rate limiting ──────────────────────

def _is_login_locked(email: str) -> tuple[bool, int]:
    """Return (locked, remaining_seconds)."""
    r = get_redis()
    key = f"login_fail:{email}"
    count = r.get(key)
    if count and int(count) >= MAX_LOGIN_ATTEMPTS:
        ttl = r.ttl(key)
        return True, max(ttl, 0)
    return False, 0


def _record_login_failure(email: str) -> None:
    r = get_redis()
    key = f"login_fail:{email}"
    pipe = r.pipeline()
    pipe.incr(key)
    pipe.ttl(key)
    count, ttl = pipe.execute()
    if ttl < 0:
        r.expire(key, LOGIN_LOCKOUT_SECONDS)


def _clear_login_failures(email: str) -> None:
    get_redis().delete(f"login_fail:{email}")


# ──────────────────────── Auth endpoints ──────────────────────────────────────

@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not _validate_email(email):
        return jsonify({"error": "邮箱格式不正确"}), 400
    if not username or len(username) < 2 or len(username) > 30:
        return jsonify({"error": "用户名长度需在 2-30 个字符之间"}), 400
    valid, msg = validate_password(password)
    if not valid:
        return jsonify({"error": msg}), 400

    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM users WHERE email=%s", (email,)
    ).fetchone()
    if existing:
        return jsonify({"error": "该邮箱已被注册"}), 409

    password_hash = generate_password_hash(password)
    language = (data.get("language") or "").strip() or ""
    cursor = conn.execute(
        """INSERT INTO users (email, username, password_hash, last_login, language)
           VALUES (%s, %s, %s, NOW(), %s) RETURNING id""",
        (email, username, password_hash, language),
    )
    conn.commit()
    user_id = cursor.fetchone()["id"]

    session.permanent = True
    session["user_id"] = user_id
    g._new_session_user_id = user_id

    user = conn.execute("SELECT * FROM users WHERE id=%s", (user_id,)).fetchone()
    u = dict(user)
    u.pop("password_hash", None)
    return jsonify({"user": u}), 201


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    remember = data.get("remember", False)

    if not email or not password:
        return jsonify({"error": "请输入邮箱和密码"}), 400

    locked, remaining = _is_login_locked(email)
    if locked:
        logger.warning("登录锁定: %s, 剩余 %ds", email, remaining)
        return jsonify({"error": "登录尝试过多，请稍后重试"}), 429

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email=%s", (email,)).fetchone()
    if not user or not check_password_hash(user["password_hash"], password):
        _record_login_failure(email)
        return jsonify({"error": "邮箱或密码错误"}), 401

    _clear_login_failures(email)

    conn.execute("UPDATE users SET last_login=NOW() WHERE id=%s", (user["id"],))
    conn.commit()

    session.permanent = bool(remember)
    session["user_id"] = user["id"]
    g._new_session_user_id = user["id"]

    u = dict(user)
    u.pop("password_hash", None)

    language = data.get("language")
    if language and not u.get("language"):
        conn.execute("UPDATE users SET language=%s WHERE id=%s", (language, user["id"]))
        conn.commit()
        u["language"] = language

    return jsonify({"user": u})


@auth_bp.route("/api/auth/logout", methods=["POST"])
def logout():
    if hasattr(session, "sid"):
        try:
            conn = get_db()
            conn.execute(
                "DELETE FROM user_sessions WHERE session_id=%s", (session.sid,)
            )
            conn.commit()
            get_redis().delete(SESSION_KEY_PREFIX + session.sid)
        except Exception:
            pass
    session.clear()
    return jsonify({"success": True})


@auth_bp.route("/api/auth/me", methods=["GET"])
def me():
    user = get_current_user()
    if not user:
        return jsonify({"error": "未登录"}), 401
    return jsonify({"user": user})


@auth_bp.route("/api/auth/forgot-password", methods=["POST"])
def forgot_password():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()

    if not _validate_email(email):
        return jsonify({"error": "邮箱格式不正确"}), 400

    conn = get_db()
    user = conn.execute("SELECT id FROM users WHERE email=%s", (email,)).fetchone()

    if not user:
        return jsonify({"success": True, "message": "如果该邮箱已注册，验证码已发送"})

    code = generate_verification_code()
    try:
        store_verification_code(email, code, "reset_password")
    except Exception:
        logger.error("存储验证码失败，邮箱: %s", email)
        return jsonify({"error": "服务器错误，请稍后重试"}), 500
    sent = send_verification_email(email, code)
    if not sent:
        logger.error("向 %s 发送验证码失败", email)

    return jsonify({"success": True, "message": "如果该邮箱已注册，验证码已发送"})


@auth_bp.route("/api/auth/verify-code", methods=["POST"])
def verify_reset_code():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    code = (data.get("code") or "").strip()

    if not email or not code:
        return jsonify({"error": "请输入邮箱和验证码"}), 400

    if verify_code(email, code, "reset_password"):
        session["reset_email"] = email
        session["reset_verified"] = True
        session["reset_verified_at"] = datetime.now().isoformat()
        return jsonify({"success": True})
    return jsonify({"error": "验证码无效或已过期"}), 400


@auth_bp.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    data = request.json or {}

    if not check_reset_session_valid():
        return jsonify({"error": "验证已过期，请重新获取验证码"}), 400

    email = session.get("reset_email")

    password = data.get("password") or ""
    valid, msg = validate_password(password)
    if not valid:
        return jsonify({"error": msg}), 400

    conn = get_db()
    password_hash = generate_password_hash(password)
    conn.execute(
        "UPDATE users SET password_hash=%s, updated_at=NOW() WHERE email=%s",
        (password_hash, email),
    )
    conn.commit()

    session.pop("reset_email", None)
    session.pop("reset_verified", None)
    session.pop("reset_verified_at", None)

    return jsonify({"success": True, "message": "密码已重置，请重新登录"})


# ──────────────────────── Session (device) management ─────────────────────────

@auth_bp.route("/api/auth/sessions", methods=["GET"])
@login_required
def list_sessions():
    """List all active devices for the current user."""
    conn = get_db()
    rows = conn.execute(
        """SELECT id, ip_address, user_agent, created_at, last_active
           FROM user_sessions WHERE user_id=%s ORDER BY last_active DESC""",
        (g.user_id,),
    ).fetchall()

    current_sid = session.sid if hasattr(session, "sid") else None
    sessions = []
    for r in rows:
        d = dict(r)
        # Don't expose raw session_id; just mark which is current
        d["is_current"] = (
            current_sid is not None and
            conn.execute(
                "SELECT 1 FROM user_sessions WHERE id=%s AND session_id=%s",
                (r["id"], current_sid),
            ).fetchone() is not None
        )
        sessions.append(d)

    return jsonify({"sessions": sessions})


@auth_bp.route("/api/auth/sessions/<int:db_id>", methods=["DELETE"])
@login_required
def revoke_session(db_id):
    """Revoke a specific device session."""
    conn = get_db()
    row = conn.execute(
        "SELECT session_id FROM user_sessions WHERE id=%s AND user_id=%s",
        (db_id, g.user_id),
    ).fetchone()
    if not row:
        return jsonify({"error": "会话不存在"}), 404

    sid = row["session_id"]
    get_redis().delete(SESSION_KEY_PREFIX + sid)
    conn.execute("DELETE FROM user_sessions WHERE id=%s", (db_id,))
    conn.commit()
    return jsonify({"success": True})


@auth_bp.route("/api/auth/sessions/all-others", methods=["DELETE"])
@login_required
def revoke_all_other_sessions():
    """Revoke all sessions except the current one."""
    conn = get_db()
    current_sid = session.sid if hasattr(session, "sid") else None

    if current_sid:
        rows = conn.execute(
            "SELECT session_id FROM user_sessions WHERE user_id=%s AND session_id!=%s",
            (g.user_id, current_sid),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT session_id FROM user_sessions WHERE user_id=%s",
            (g.user_id,),
        ).fetchall()

    r = get_redis()
    for row in rows:
        r.delete(SESSION_KEY_PREFIX + row["session_id"])

    if current_sid:
        conn.execute(
            "DELETE FROM user_sessions WHERE user_id=%s AND session_id!=%s",
            (g.user_id, current_sid),
        )
    else:
        conn.execute(
            "DELETE FROM user_sessions WHERE user_id=%s", (g.user_id,)
        )
    conn.commit()
    return jsonify({"success": True})

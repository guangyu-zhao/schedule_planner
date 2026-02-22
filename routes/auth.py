import re
import time
import logging
from collections import defaultdict
from datetime import datetime

from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash

from database import get_db
from auth_utils import (
    login_required,
    get_current_user,
    generate_verification_code,
    send_verification_email,
    store_verification_code,
    verify_code,
    check_reset_session_valid,
)

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__)

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")

MAX_LOGIN_ATTEMPTS = 10
LOGIN_LOCKOUT_SECONDS = 900
_login_attempts = defaultdict(list)
_ATTEMPTS_CLEANUP_INTERVAL = 300
_last_attempts_cleanup = 0


def _validate_email(email):
    return bool(EMAIL_RE.match(email or ""))


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


def _cleanup_login_attempts():
    global _last_attempts_cleanup
    now = time.monotonic()
    if now - _last_attempts_cleanup < _ATTEMPTS_CLEANUP_INTERVAL:
        return
    _last_attempts_cleanup = now
    stale_keys = []
    for key, attempts in _login_attempts.items():
        fresh = [t for t in attempts if now - t < LOGIN_LOCKOUT_SECONDS]
        if not fresh:
            stale_keys.append(key)
        else:
            _login_attempts[key] = fresh
    for key in stale_keys:
        del _login_attempts[key]


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
    valid, msg = _validate_password(password)
    if not valid:
        return jsonify({"error": msg}), 400

    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM users WHERE email=?", (email,)
    ).fetchone()
    if existing:
        return jsonify({"error": "该邮箱已被注册"}), 409

    password_hash = generate_password_hash(password)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    language = (data.get("language") or "").strip() or ""
    cursor = conn.execute(
        """INSERT INTO users (email, username, password_hash, last_login, language)
           VALUES (?, ?, ?, ?, ?)""",
        (email, username, password_hash, now, language),
    )
    conn.commit()
    user_id = cursor.lastrowid

    session.permanent = True
    session["user_id"] = user_id

    user = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    u = dict(user)
    u.pop("password_hash", None)
    return jsonify({"user": u}), 201


def _check_login_lockout(key):
    now = time.monotonic()
    _login_attempts[key] = [t for t in _login_attempts[key] if now - t < LOGIN_LOCKOUT_SECONDS]
    if len(_login_attempts[key]) >= MAX_LOGIN_ATTEMPTS:
        remaining = int(LOGIN_LOCKOUT_SECONDS - (now - _login_attempts[key][0]))
        return True, remaining
    return False, 0


def _record_login_failure(key):
    _login_attempts[key].append(time.monotonic())


def _clear_login_failures(key):
    _login_attempts.pop(key, None)


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    remember = data.get("remember", False)

    if not email or not password:
        return jsonify({"error": "请输入邮箱和密码"}), 400

    _cleanup_login_attempts()
    lockout_key = email
    locked, remaining = _check_login_lockout(lockout_key)
    if locked:
        logger.warning("登录锁定: %s, 剩余 %ds", email, remaining)
        return jsonify({"error": "登录尝试过多，请稍后重试"}), 429

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not user or not check_password_hash(user["password_hash"], password):
        _record_login_failure(lockout_key)
        return jsonify({"error": "邮箱或密码错误"}), 401

    _clear_login_failures(lockout_key)

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn.execute("UPDATE users SET last_login=? WHERE id=?", (now, user["id"]))
    conn.commit()

    session.permanent = bool(remember)
    session["user_id"] = user["id"]

    u = dict(user)
    u.pop("password_hash", None)
    u["last_login"] = now

    language = data.get("language")
    if language and not u.get("language"):
        conn.execute("UPDATE users SET language=? WHERE id=?", (language, user["id"]))
        conn.commit()
        u["language"] = language

    return jsonify({"user": u})


@auth_bp.route("/api/auth/logout", methods=["POST"])
def logout():
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
    user = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()

    if not user:
        return jsonify({"success": True, "message": "如果该邮箱已注册，验证码已发送"})

    code = generate_verification_code()
    store_verification_code(email, code, "reset_password")
    sent = send_verification_email(email, code)
    if not sent:
        return jsonify({"error": "验证码发送失败，请稍后重试"}), 500

    return jsonify({"success": True, "message": "验证码已发送到您的邮箱"})


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
    valid, msg = _validate_password(password)
    if not valid:
        return jsonify({"error": msg}), 400

    conn = get_db()
    password_hash = generate_password_hash(password)
    conn.execute(
        "UPDATE users SET password_hash=?, updated_at=datetime('now','localtime') WHERE email=?",
        (password_hash, email),
    )
    conn.commit()

    session.pop("reset_email", None)
    session.pop("reset_verified", None)
    session.pop("reset_verified_at", None)

    return jsonify({"success": True, "message": "密码已重置，请重新登录"})

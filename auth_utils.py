import secrets
import smtplib
import string
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import wraps
from datetime import datetime, timedelta

from flask import session, jsonify, g

from config import (
    MAIL_SERVER,
    MAIL_PORT,
    MAIL_USERNAME,
    MAIL_PASSWORD,
    MAIL_DEFAULT_SENDER,
    MAIL_USE_TLS,
    VERIFICATION_CODE_EXPIRY,
    RESET_SESSION_EXPIRY,
)
from database import get_db

logger = logging.getLogger(__name__)


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user_id = session.get("user_id")
        if not user_id:
            return jsonify({"error": "未登录"}), 401
        g.user_id = user_id
        return f(*args, **kwargs)

    return decorated


def get_current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if user:
        u = dict(user)
        u.pop("password_hash", None)
        return u
    return None


def generate_verification_code():
    return "".join(secrets.choice(string.digits) for _ in range(6))


def send_verification_email(email, code):
    if not MAIL_USERNAME or not MAIL_PASSWORD:
        logger.info("验证码（开发模式）: %s  邮箱: %s", code, email)
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "日程规划器 - 验证码"
        msg["From"] = MAIL_DEFAULT_SENDER
        msg["To"] = email

        html = f"""
        <div style="max-width:480px;margin:0 auto;font-family:system-ui,sans-serif;padding:32px;">
            <h2 style="color:#6c5ce7;margin-bottom:8px;">日程规划器</h2>
            <p style="color:#636e72;">您正在重置密码，请使用以下验证码：</p>
            <div style="background:#f3f0ff;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
                <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#6c5ce7;">{code}</span>
            </div>
            <p style="color:#b2bec3;font-size:13px;">
                验证码有效期为 {VERIFICATION_CODE_EXPIRY // 60} 分钟。如非本人操作，请忽略此邮件。
            </p>
        </div>
        """
        msg.attach(MIMEText(html, "html", "utf-8"))

        with smtplib.SMTP(MAIL_SERVER, MAIL_PORT, timeout=10) as server:
            if MAIL_USE_TLS:
                server.starttls()
            server.login(MAIL_USERNAME, MAIL_PASSWORD)
            server.sendmail(MAIL_DEFAULT_SENDER, email, msg.as_string())
        return True
    except Exception as e:
        logger.error("发送邮件失败: %s", e)
        return False


def store_verification_code(email, code, code_type="reset_password"):
    conn = get_db()
    expires_at = (
        datetime.now() + timedelta(seconds=VERIFICATION_CODE_EXPIRY)
    ).strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        "UPDATE verification_codes SET used=1 WHERE email=? AND type=? AND used=0",
        (email, code_type),
    )
    conn.execute(
        "INSERT INTO verification_codes (email, code, type, expires_at) VALUES (?, ?, ?, ?)",
        (email, code, code_type, expires_at),
    )
    _cleanup_expired_codes(conn)
    conn.commit()


def verify_code(email, code, code_type="reset_password"):
    conn = get_db()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        """UPDATE verification_codes SET used=1
           WHERE id = (
               SELECT id FROM verification_codes
               WHERE email=? AND code=? AND type=? AND used=0 AND expires_at>?
               ORDER BY created_at DESC LIMIT 1
           )""",
        (email, code, code_type, now),
    )
    affected = conn.execute("SELECT changes()").fetchone()[0]
    conn.commit()
    return affected > 0


def check_reset_session_valid():
    """Check that password reset session hasn't expired."""
    email = session.get("reset_email")
    verified = session.get("reset_verified")
    verified_at = session.get("reset_verified_at")
    if not email or not verified or not verified_at:
        return False
    try:
        ts = datetime.fromisoformat(verified_at)
        if (datetime.now() - ts).total_seconds() > RESET_SESSION_EXPIRY:
            session.pop("reset_email", None)
            session.pop("reset_verified", None)
            session.pop("reset_verified_at", None)
            return False
    except (ValueError, TypeError):
        return False
    return True


def _cleanup_expired_codes(conn):
    """Remove verification codes that expired more than 24 hours ago."""
    cutoff = (datetime.now() - timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        "DELETE FROM verification_codes WHERE expires_at < ? OR used = 1",
        (cutoff,),
    )

import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from celery_app import celery
from config import (
    MAIL_SERVER,
    MAIL_PORT,
    MAIL_USERNAME,
    MAIL_PASSWORD,
    MAIL_DEFAULT_SENDER,
    MAIL_USE_TLS,
    VERIFICATION_CODE_EXPIRY,
)

logger = logging.getLogger(__name__)


@celery.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    name="tasks.email_tasks.send_verification_email",
)
def send_verification_email_task(self, email: str, code: str) -> bool:
    """Send a verification email asynchronously with automatic retry."""
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
    except Exception as exc:
        logger.error("发送邮件失败 (将重试): %s", exc)
        raise self.retry(exc=exc)

import os
import secrets
import logging

from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))
DB_PATH = os.path.join(BASE_DIR, "planner.db")

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()


def _load_secret_key():
    env_key = os.environ.get("SECRET_KEY")
    if env_key:
        return env_key
    key_file = os.path.join(BASE_DIR, ".secret_key")
    if os.path.exists(key_file):
        with open(key_file, "r") as f:
            return f.read().strip()
    key = secrets.token_hex(32)
    try:
        with open(key_file, "w") as f:
            f.write(key)
        logging.getLogger(__name__).info(
            "已自动生成 SECRET_KEY 并保存到 .secret_key，生产环境请通过环境变量设置"
        )
    except OSError:
        logging.getLogger(__name__).warning(
            "无法写入 .secret_key，SECRET_KEY 将在重启后变更，所有会话将失效"
        )
    return key


SECRET_KEY = _load_secret_key()
PERMANENT_SESSION_LIFETIME = 30 * 24 * 3600

MAX_CONTENT_LENGTH = 5 * 1024 * 1024

MAIL_SERVER = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
MAIL_PORT = int(os.environ.get("MAIL_PORT", "587"))
MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "")
MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")
MAIL_DEFAULT_SENDER = os.environ.get(
    "MAIL_DEFAULT_SENDER", "noreply@schedule-planner.com"
)
MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "true").lower() == "true"

VERIFICATION_CODE_EXPIRY = 600
RESET_SESSION_EXPIRY = 600

ALLOWED_AVATAR_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
AVATAR_MAX_SIZE = (256, 256)

import os
import secrets
import logging

from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://planner:plannerpass@localhost:5432/planner_db",
)
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.environ.get(
    "CELERY_RESULT_BACKEND", "redis://localhost:6379/1"
)
SESSION_KEY_PREFIX = os.environ.get("SESSION_KEY_PREFIX", "sp_sess:")
RATELIMIT_STORAGE_URI = os.environ.get(
    "RATELIMIT_STORAGE_URI", REDIS_URL.replace("/0", "/2")
)
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
SENTRY_TRACES_SAMPLE_RATE = float(
    os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")
)
SENTRY_ENVIRONMENT = os.environ.get("SENTRY_ENVIRONMENT", "development")
MAX_LOGIN_ATTEMPTS = int(os.environ.get("MAX_LOGIN_ATTEMPTS", "10"))
LOGIN_LOCKOUT_SECONDS = int(os.environ.get("LOGIN_LOCKOUT_SECONDS", "900"))

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

ALLOWED_NOTE_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
NOTE_IMAGE_MAX_SIZE = (2048, 2048)

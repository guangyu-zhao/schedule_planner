import os
import time
import uuid
import atexit
import signal
import logging
import threading
from datetime import timedelta

from flask import Flask, jsonify, request, g

from config import (
    SECRET_KEY, PERMANENT_SESSION_LIFETIME, MAX_CONTENT_LENGTH,
    LOG_LEVEL,
)
from database import init_db, get_db, get_db_direct, optimize_db, backup_db
from routes import register_blueprints
from storage import get_storage

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

app.secret_key = SECRET_KEY
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(seconds=PERMANENT_SESSION_LIFETIME)
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
if os.environ.get("FLASK_ENV") == "production" or os.environ.get("HTTPS") == "1":
    app.config["SESSION_COOKIE_SECURE"] = True

get_storage()

init_db()
optimize_db()

register_blueprints(app)


@app.before_request
def before_request():
    g.request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex[:12])
    g.request_start = time.monotonic()

    if request.method in ("POST", "PUT", "DELETE") and request.path.startswith("/api/"):
        if request.method in ("POST", "PUT") and request.content_length:
            ct = request.content_type or ""
            if "application/json" not in ct and "multipart/form-data" not in ct:
                return jsonify({"error": "不支持的请求格式"}), 415

        origin = request.headers.get("Origin") or ""
        referer = request.headers.get("Referer") or ""
        if origin:
            if not origin.startswith(request.host_url.rstrip("/")):
                logger.warning("CSRF: origin mismatch %s vs %s", origin, request.host_url)
                return jsonify({"error": "非法请求来源"}), 403
        elif referer:
            if not referer.startswith(request.host_url):
                logger.warning("CSRF: referer mismatch %s vs %s", referer, request.host_url)
                return jsonify({"error": "非法请求来源"}), 403
        else:
            logger.warning("CSRF: no origin/referer for %s %s", request.method, request.path)
            return jsonify({"error": "非法请求来源"}), 403


@app.teardown_appcontext
def close_db(exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


@app.after_request
def add_security_headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "SAMEORIGIN"
    resp.headers["X-XSS-Protection"] = "1; mode=block"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.path.startswith("/static/"):
        resp.headers["Cache-Control"] = "public, max-age=2592000"
    if resp.content_type and "text/html" in resp.content_type:
        resp.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "font-src 'self' https://cdn.jsdelivr.net; "
            "img-src 'self' data: blob:; "
            "connect-src 'self'; "
            "frame-ancestors 'self'"
        )
    rid = g.get("request_id")
    if rid:
        resp.headers["X-Request-ID"] = rid

    if request.path.startswith("/api/"):
        elapsed = round((time.monotonic() - g.get("request_start", 0)) * 1000, 1)
        log_level = logging.WARNING if resp.status_code >= 400 else logging.DEBUG
        logger.log(log_level, "%s %s %s %sms uid=%s",
                   request.method, request.path, resp.status_code, elapsed,
                   g.get("user_id", "-"))
    return resp


try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address

    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["200 per minute"],
        storage_uri="memory://",
    )

    for rule, limit in [
        ("auth.register", "5 per minute"),
        ("auth.login", "10 per minute"),
        ("auth.forgot_password", "3 per minute"),
    ]:
        view = app.view_functions.get(rule)
        if view:
            limiter.limit(limit)(view)
except ImportError:
    logger.warning("flask-limiter 未安装，速率限制已禁用")


_maintenance = {"requests": 0, "last_backup": 0}
_maintenance_lock = threading.Lock()


@app.before_request
def periodic_maintenance():
    with _maintenance_lock:
        _maintenance["requests"] += 1
        do_optimize = _maintenance["requests"] % 500 == 0
        now = time.monotonic()
        do_backup = now - _maintenance["last_backup"] > 86400
        if do_backup:
            _maintenance["last_backup"] = now
    if do_optimize:
        try:
            optimize_db()
        except Exception:
            pass
    if do_backup:
        try:
            backup_db()
        except Exception:
            pass


@app.route("/health")
def health_check():
    try:
        conn = get_db_direct()
        conn.execute("SELECT 1")
        conn.close()
        return jsonify({"status": "ok"})
    except Exception as e:
        logger.error("健康检查失败: %s", e)
        return jsonify({"status": "error", "message": "database unavailable"}), 503


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "资源不存在"}), 404


@app.errorhandler(500)
def internal_error(e):
    logger.exception("服务器内部错误")
    return jsonify({"error": "服务器内部错误"}), 500


@app.errorhandler(413)
def request_entity_too_large(e):
    return jsonify({"error": "上传文件过大，最大 5MB"}), 413


@app.errorhandler(429)
def rate_limit_exceeded(e):
    return jsonify({"error": "请求过于频繁，请稍后再试"}), 429


def _graceful_shutdown(*_args):
    logger.info("正在关闭服务...")
    try:
        backup_db()
    except Exception:
        pass
    logger.info("服务已关闭")

atexit.register(_graceful_shutdown)
signal.signal(signal.SIGTERM, lambda *a: (_graceful_shutdown(), exit(0)))

if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "false").lower() in ("true", "1")
    port = int(os.environ.get("PORT", 5555))
    host = os.environ.get("HOST", "127.0.0.1")

    if debug:
        app.run(debug=True, host=host, port=port)
    else:
        try:
            from waitress import serve
            logger.info("使用 waitress 生产服务器启动 (http://%s:%s)", host, port)
            serve(app, host=host, port=port, threads=8)
        except ImportError:
            try:
                import gunicorn  # noqa: F401
                import subprocess, sys
                logger.info("使用 gunicorn 生产服务器启动")
                subprocess.run([
                    sys.executable, "-m", "gunicorn",
                    "--bind", f"{host}:{port}",
                    "--workers", "4",
                    "--access-logfile", "-",
                    "app:app",
                ])
            except ImportError:
                logger.warning("未安装生产 WSGI 服务器 (waitress/gunicorn)，回退到 Flask 开发服务器")
                app.run(host=host, port=port)

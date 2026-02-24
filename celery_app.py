from celery import Celery
from config import CELERY_BROKER_URL, CELERY_RESULT_BACKEND, SENTRY_DSN

def make_celery():
    c = Celery(
        "schedule_planner",
        broker=CELERY_BROKER_URL,
        backend=CELERY_RESULT_BACKEND,
        include=["tasks.email_tasks"],
    )
    c.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="Asia/Shanghai",
        enable_utc=True,
        task_acks_late=True,
        worker_prefetch_multiplier=1,
    )
    return c


celery = make_celery()

if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.celery import CeleryIntegration
    sentry_sdk.init(dsn=SENTRY_DSN, integrations=[CeleryIntegration()])

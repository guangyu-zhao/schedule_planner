"""
storage — pluggable file-storage backends.

Usage:
    from storage import get_storage
    storage = get_storage()
    url = storage.save(data, "avatars/1_abc.jpg")
    storage.delete("avatars/1_abc.jpg")
"""

import os
import logging
from typing import Optional

from storage.base import Storage

logger = logging.getLogger(__name__)

_instance: Optional[Storage] = None


def get_storage() -> Storage:
    """Return the singleton Storage instance based on STORAGE_TYPE env var."""
    global _instance
    if _instance is not None:
        return _instance

    storage_type = os.environ.get("STORAGE_TYPE", "local").lower()

    if storage_type == "oss":
        from storage.oss import OSSStorage

        _instance = OSSStorage(
            access_key_id=os.environ.get("OSS_ACCESS_KEY_ID", ""),
            access_key_secret=os.environ.get("OSS_ACCESS_KEY_SECRET", ""),
            endpoint=os.environ.get("OSS_ENDPOINT", ""),
            bucket=os.environ.get("OSS_BUCKET", ""),
            base_url=os.environ.get("OSS_BASE_URL", ""),
        )
        logger.info("Using OSS storage backend")
    else:
        from storage.local import LocalStorage

        upload_folder = os.environ.get(
            "UPLOAD_FOLDER",
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads"),
        )
        _instance = LocalStorage(upload_folder)
        logger.info("Using local storage backend: %s", upload_folder)

    return _instance


__all__ = ["Storage", "get_storage"]

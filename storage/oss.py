import logging
from typing import Union, IO

from flask import redirect

from storage.base import Storage

logger = logging.getLogger(__name__)


class OSSStorage(Storage):
    """Alibaba Cloud OSS storage backend (stub).

    Set the following environment variables to activate:
        OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET,
        OSS_ENDPOINT, OSS_BUCKET, OSS_BASE_URL
    """

    def __init__(
        self,
        access_key_id: str,
        access_key_secret: str,
        endpoint: str,
        bucket: str,
        base_url: str,
    ):
        self._access_key_id = access_key_id
        self._access_key_secret = access_key_secret
        self._endpoint = endpoint
        self._bucket_name = bucket
        self._base_url = base_url.rstrip("/")
        self._client = None

        # Lazy-import the SDK so the project still works without it installed
        try:
            import oss2  # noqa: F401

            auth = oss2.Auth(self._access_key_id, self._access_key_secret)
            self._client = oss2.Bucket(auth, self._endpoint, self._bucket_name)
            logger.info("OSS storage initialized: %s/%s", self._endpoint, self._bucket_name)
        except ImportError:
            logger.warning(
                "oss2 SDK not installed — OSSStorage will raise on every operation. "
                "Install with: pip install oss2"
            )
        except Exception as exc:
            logger.error("Failed to initialize OSS client: %s", exc)

    def _ensure_client(self):
        if self._client is None:
            raise RuntimeError(
                "OSS client is not available. "
                "Install oss2 (pip install oss2) and check your credentials."
            )

    def save(self, data: Union[bytes, IO], relative_path: str) -> str:
        self._ensure_client()
        if isinstance(data, bytes):
            self._client.put_object(relative_path, data)
        else:
            self._client.put_object(relative_path, data)
        return self.url(relative_path)

    def delete(self, relative_path: str) -> bool:
        self._ensure_client()
        try:
            self._client.delete_object(relative_path)
            return True
        except Exception:
            logger.exception("OSS delete failed for %s", relative_path)
            return False

    def exists(self, relative_path: str) -> bool:
        self._ensure_client()
        try:
            return self._client.object_exists(relative_path)
        except Exception:
            return False

    def url(self, relative_path: str) -> str:
        return f"{self._base_url}/{relative_path}"

    def serve(self, relative_path: str):
        """Redirect to the OSS public URL."""
        return redirect(self.url(relative_path))

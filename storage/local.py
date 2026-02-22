import os
from typing import Union, IO

from flask import send_from_directory

from storage.base import Storage


class LocalStorage(Storage):
    """Store files on the local filesystem under *root_dir*."""

    def __init__(self, root_dir: str):
        self._root = root_dir
        os.makedirs(self._root, exist_ok=True)

    def _full_path(self, relative_path: str) -> str:
        return os.path.join(self._root, relative_path)

    def save(self, data: Union[bytes, IO], relative_path: str) -> str:
        full = self._full_path(relative_path)
        os.makedirs(os.path.dirname(full), exist_ok=True)

        if isinstance(data, bytes):
            with open(full, "wb") as f:
                f.write(data)
        else:
            with open(full, "wb") as f:
                while True:
                    chunk = data.read(8192)
                    if not chunk:
                        break
                    f.write(chunk)

        return self.url(relative_path)

    def delete(self, relative_path: str) -> bool:
        full = self._full_path(relative_path)
        if os.path.exists(full):
            try:
                os.remove(full)
                return True
            except OSError:
                return False
        return False

    def exists(self, relative_path: str) -> bool:
        return os.path.exists(self._full_path(relative_path))

    def url(self, relative_path: str) -> str:
        return f"/uploads/{relative_path}"

    def serve(self, relative_path: str):
        """Return a Flask response that serves the file."""
        directory = os.path.dirname(self._full_path(relative_path))
        filename = os.path.basename(relative_path)
        return send_from_directory(directory, filename)

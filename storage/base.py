from abc import ABC, abstractmethod
from typing import Union, IO


class Storage(ABC):
    """Abstract file storage interface.

    All paths are relative to the storage root (e.g. "avatars/3_abc123.jpg").
    """

    @abstractmethod
    def save(self, data: Union[bytes, IO], relative_path: str) -> str:
        """Persist *data* at *relative_path* and return the public URL."""

    @abstractmethod
    def delete(self, relative_path: str) -> bool:
        """Remove the file. Return True if deleted, False if not found."""

    @abstractmethod
    def exists(self, relative_path: str) -> bool:
        """Check whether the file exists."""

    @abstractmethod
    def url(self, relative_path: str) -> str:
        """Return the public URL for the stored file."""

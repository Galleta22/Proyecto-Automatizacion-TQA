from datetime import datetime, timezone


def utc_now() -> datetime:
    """Return naive UTC for compatibility with existing database timestamps."""
    return datetime.now(timezone.utc).replace(tzinfo=None)

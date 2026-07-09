from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app


def test_lifespan_without_db_boots_and_skips_scheduler(monkeypatch):
    """Without DATABASE_URL, the lifespan boots successfully but does
    not start the scheduler (fuel prices remain disabled)."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with patch("app.main.AsyncIOScheduler") as scheduler_cls, \
         patch("app.main.db.open_pool", AsyncMock(return_value=False)), \
         patch("app.main.db.close_pool", AsyncMock()) as close_pool:
        with TestClient(app) as client:
            assert client.get("/health").json() == {"status": "ok"}
        scheduler_cls.assert_not_called()      # no pool -> no scheduler
    close_pool.assert_awaited_once()           # shutdown always closes


def test_lifespan_with_db_starts_scheduler_and_startup_refresh(monkeypatch):
    """With DATABASE_URL, the lifespan starts the scheduler and runs
    startup refresh in the background."""
    with patch("app.main.AsyncIOScheduler") as scheduler_cls, \
         patch("app.main.db.open_pool", AsyncMock(return_value=True)), \
         patch("app.main.db.close_pool", AsyncMock()), \
         patch("app.main.refresh_all", AsyncMock(return_value={})) as refresh:
        with TestClient(app) as client:
            client.get("/health")
        scheduler = scheduler_cls.return_value
        scheduler.start.assert_called_once()
        scheduler.shutdown.assert_called_once_with(wait=False)
    refresh.assert_awaited()                    # startup refresh ran

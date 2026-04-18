"""
Postgres-backed persistence for LangGraph threads and cross-thread memory.

- AsyncPostgresSaver : per-thread checkpoint storage (conversation history)
- AsyncPostgresStore : cross-thread key/value memory with pgvector index (used from M4+)

Async variants are required because FastAPI invokes the graph via
compiled_graph.astream(...), which calls aget_tuple / aput on the checkpointer.
The sync PostgresSaver/PostgresStore raise NotImplementedError for their a*
methods.

Both are backed by a shared psycopg AsyncConnectionPool so the underlying
connections live for the full service lifetime (from_conn_string() returns a
context manager that closes its connection on exit, which would kill the
checkpointer the moment startup finishes).

The pgvector extension must exist on the database before store.setup() runs;
we ensure it with an explicit CREATE EXTENSION IF NOT EXISTS call.

CLAUDE.md §Non-negotiable #8 — checkpointer.setup() + store.setup() on startup, idempotent.
"""

import logging
import os

import psycopg
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.store.postgres.aio import AsyncPostgresStore
from psycopg_pool import AsyncConnectionPool

logger = logging.getLogger(__name__)

PG_URL = os.environ.get("PG_URL")
if not PG_URL:
    raise RuntimeError(
        "PG_URL env var is required but not set. "
        "Example: postgresql://user:pass@postgres:5432/langgraph"
    )


def _ensure_pgvector(conn_str: str) -> None:
    """
    Create the pgvector extension if it doesn't already exist.
    Must run before PostgresStore.setup() which creates vector-typed columns.
    Uses a one-shot synchronous connection — runs once at startup.
    """
    with psycopg.connect(conn_str, autocommit=True) as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
    logger.info("pgvector extension ensured")


async def setup_persistence() -> tuple[AsyncPostgresSaver, AsyncPostgresStore, AsyncConnectionPool]:
    """
    Idempotent startup routine:
    1. Ensure pgvector extension exists.
    2. Build a shared AsyncConnectionPool.
    3. Create/verify checkpointer schema.
    4. Create/verify store schema (including vector index).

    Returns (checkpointer, store, pool) — caller owns the pool and must close
    it on shutdown.

    autocommit=True  — LangGraph issues DDL in setup() and manages its own txns.
    prepare_threshold=0  — disables prepared statements, avoids pgbouncer
                           compatibility issues, matches upstream recommendation.
    """
    logger.info("Setting up persistence layer...")

    _ensure_pgvector(PG_URL)

    pool = AsyncConnectionPool(
        conninfo=PG_URL,
        max_size=10,
        kwargs={"autocommit": True, "prepare_threshold": 0},
        open=False,
    )
    await pool.open()

    checkpointer = AsyncPostgresSaver(pool)
    await checkpointer.setup()
    logger.info("AsyncPostgresSaver schema ready")

    store = AsyncPostgresStore(pool)
    await store.setup()
    logger.info("AsyncPostgresStore schema ready (pgvector index included)")

    return checkpointer, store, pool

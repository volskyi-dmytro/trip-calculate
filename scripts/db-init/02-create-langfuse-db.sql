-- Create the langfuse database for Langfuse v3 observability platform.
-- The tripplanner database is created by POSTGRES_DB env var in docker-compose.yml.
-- The langgraph database is created by 01-create-langgraph-db.sql.
--
-- Langfuse v3 requires its own Postgres database; ClickHouse handles the
-- analytics event volume. This Postgres DB stores users, projects, traces
-- metadata, and queue state used by langfuse-worker.

SELECT 'CREATE DATABASE langfuse OWNER tripplanner'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'langfuse')\gexec

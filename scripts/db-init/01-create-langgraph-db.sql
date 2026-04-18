-- Create the langgraph database for PostgresSaver + PostgresStore.
-- The tripplanner database is created by POSTGRES_DB env var in docker-compose.yml.
-- pgvector extension is added per-database; the agent's persistence.py ensures it
-- via CREATE EXTENSION IF NOT EXISTS vector at startup.

SELECT 'CREATE DATABASE langgraph OWNER tripplanner'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'langgraph')\gexec

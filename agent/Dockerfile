# LangGraph agent service
# python:3.12-slim matches the Python version pinned in CLAUDE.md §Python agent service.
FROM python:3.12-slim

# Create a non-root user (mirrors Spring Dockerfile convention of non-root operation).
RUN groupadd -r agent && useradd -r -g agent agent

WORKDIR /app

# Install dependencies in a separate layer — this layer is cached unless
# requirements.txt changes, making rebuilds fast during development.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source after installing deps.
COPY . .

# Transfer ownership to the non-root user before switching.
RUN chown -R agent:agent /app

USER agent

# Expose port for inter-container communication (NOT published to host — see docker-compose.yml).
EXPOSE 8000

# Liveness probe: hits the /healthz endpoint (no auth required).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')" || exit 1

# Start uvicorn with the FastAPI app defined in app.py.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

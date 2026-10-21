# GLITCH API — Cloud Run image.
#   cd api && gcloud run deploy glitch-api --source . --region us-central1 ...
# Cloud Run injects PORT; GLITCH_PORT is left unset so PORT wins (see config.py).
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /bin/

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PYTHON=python3.12 \
    GLITCH_HOST=0.0.0.0

WORKDIR /app

# Dependencies first (cached layer), then the package itself.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
RUN uv sync --frozen --no-dev

RUN useradd --create-home --uid 10001 glitch && chown -R glitch /app
USER glitch

EXPOSE 8080
CMD ["uv", "run", "--frozen", "--no-dev", "python", "-m", "glitch_api"]

# Economic Dashboard - one image for the web app and the data refresh.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 TZ=Europe/Berlin
WORKDIR /app

# Dependencies come from pyproject.toml (single source of truth); tzdata for time zones in the slim image.
COPY pyproject.toml .
RUN python -c "import tomllib; print('\n'.join(tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']))" > /tmp/requirements.txt \
    && pip install -r /tmp/requirements.txt tzdata

COPY app app
COPY etl etl
COPY indicators.yaml .

# Run as an unprivileged user; /app/data (the SQLite database) is a volume.
RUN useradd --system --uid 10001 --no-create-home app && mkdir data && chown app data
USER app
VOLUME /app/data
EXPOSE 8765

HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=4)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765"]

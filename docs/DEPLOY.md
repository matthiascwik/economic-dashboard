# Running the dashboard with Docker

The repository ships a `Dockerfile` and a `compose.yaml`: a small always-on web container and a nightly data refresh.
Any host with Docker and Compose v2 works (a home server, NAS, VPS or Raspberry Pi with a matching image architecture).

## What gets deployed
| Container | Purpose | Limits |
|---|---|---|
| `web` | FastAPI dashboard on port **8765**, read-only access to the database | 256 MB RAM, 0.5 CPU, CPU weight 256 |
| `etl` | fetches all data on first start and then daily at 04:30 (`etl/schedule.py`) | 512 MB RAM, 0.5 CPU, CPU weight 128, `nice 19` |

Both share one named volume `dashboard-data` (the SQLite database, about 10 MB, re-creatable by the refresh).
The limits and low priorities keep the dashboard from starving other services on a small host; a full refresh needs about
230 MB peak memory and a few CPU-seconds, mostly spent waiting for the network. Adjust them in `compose.yaml` as needed.

## 1. Build the image
On the host (or on any machine with Docker; for another CPU architecture use `docker buildx build --platform linux/amd64 ... --load`
and move the image with `docker save` / `docker load`):

    git clone <repository-url> economic-dashboard && cd economic-dashboard
    docker build -t economic-dashboard:0.1.0 .

If you copy the sources by archive instead of cloning, list the paths to pack explicitly. An exclude such as `--exclude=data`
would also drop `app/static/data/countries.geojson` (excludes match at any depth) and the maps would stay empty:

    tar --exclude=__pycache__ -czf economic_dashboard.tgz \
        app etl indicators.yaml pyproject.toml Dockerfile compose.yaml .dockerignore .env.example

## 2. Start
Put your Destatis token next to the compose file (`.env`, mode 600; see `.env.example`):

    DESTATIS_TOKEN=<your token>

Then:

    docker compose up -d

Without a token the Destatis indicators fail and everything else still loads (the Germany sector charts stay empty).

## 3. Verify
- `docker ps` shows `economic-dashboard-web-1` and `-etl-1`; after about a minute the web container is `healthy`.
- `docker logs -f economic-dashboard-etl-1` shows the first refresh (`[3/20] ...`, about 2 minutes; Destatis is the slowest part) and `Next refresh: ...`.
- Open `http://<host>:8765`. Until the first refresh has finished the pages show "The data has not been loaded yet".
- `curl -I http://<host>:8765/static/data/countries.geojson` must answer `200 OK`.
- `docker stats --no-stream` should show well below the limits.

## Operating
- **Refresh time:** `ETL_RUN_AT` in `compose.yaml` (local time, `TZ`). A manual run: `docker exec economic-dashboard-etl-1 python -m etl.run`.
- **Update:** get the new sources, `docker build -t economic-dashboard:0.1.0 .`, then `docker compose up -d --force-recreate`
  (or use a new tag and change it in `compose.yaml`). The database survives because it lives on the volume.
- **Logs:** `docker logs --tail 100 economic-dashboard-etl-1` (progress, retries, failures, quality check).
- **Security:** there is no login. Keep the port inside a trusted network or put an authenticating reverse proxy in front of it;
  do not expose it directly to the internet. The containers run as an unprivileged user with a read-only file system and no capabilities.
- **Dependencies** are not pinned, so a rebuild picks up current versions; run the test suite first.
